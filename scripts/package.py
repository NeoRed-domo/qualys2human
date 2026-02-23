"""Package script — creates an offline deployment archive (.zip and optionally .exe SFX).

Usage:
    python scripts/package.py [--build-dir dist] [--output qualys2human-vX.X.X]

Expects `scripts/build.py` to have been run first (or runs it automatically).
Bundles the built artifacts into a zip (and optionally a 7-Zip SFX .exe) ready for
offline deployment on Windows Server.

The resulting archive contains:
    Qualys2Human-1.0.0/
    ├── python/           (embedded Python + all deps)
    ├── app/              (backend source + frontend build)
    ├── data/             (branding)
    ├── installer/        (setup.py, modules, batch files, README, config template)
    ├── prerequisites/    (PostgreSQL .exe, WinSW .exe)
    ├── install.bat       (entry point → installer/install.bat)
    ├── upgrade.bat       (entry point → installer/upgrade.bat)
    ├── uninstall.bat     (entry point → installer/uninstall.bat)
    └── VERSION
"""

import argparse
import shutil
import subprocess
import sys
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).absolute().parent.parent
VERSION = "1.0.0"


def ensure_build(build_dir: Path):
    """Run build if dist/ doesn't exist."""
    if not (build_dir / "app").exists() or not (build_dir / "python").exists():
        print("Build artifacts not found, running build.py first...")
        subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "build.py"), "--output-dir", str(build_dir)],
            check=True,
        )


def create_archive(build_dir: Path, output_path: Path):
    """Create the offline zip archive."""
    print(f"\n=== Creating archive: {output_path} ===")

    archive_root = f"Qualys2Human-{VERSION}"
    file_count = 0

    with ZipFile(output_path, "w", ZIP_DEFLATED) as zf:
        # Add built artifacts (python/, app/, data/)
        for subdir in ["python", "app", "data"]:
            src = build_dir / subdir
            if not src.exists():
                continue
            for fpath in src.rglob("*"):
                if fpath.is_file():
                    arcname = f"{archive_root}/{subdir}/{fpath.relative_to(src)}"
                    zf.write(fpath, arcname)
                    file_count += 1

        # Add installer directory
        installer_dir = ROOT / "installer"
        if installer_dir.exists():
            for fpath in installer_dir.rglob("*"):
                if fpath.is_file():
                    arcname = f"{archive_root}/installer/{fpath.relative_to(installer_dir)}"
                    zf.write(fpath, arcname)
                    file_count += 1

        # Add prerequisites (PostgreSQL .exe, WinSW .exe — NOT python-embed)
        prereqs_dir = ROOT / "prerequisites"
        if prereqs_dir.exists():
            for fpath in prereqs_dir.iterdir():
                if fpath.is_file() and fpath.suffix == ".exe":
                    arcname = f"{archive_root}/prerequisites/{fpath.name}"
                    zf.write(fpath, arcname)
                    file_count += 1

        # Add root-level batch entry points (thin wrappers that call installer/*.bat)
        # These must NOT be copies of installer/*.bat — the paths differ at root level.
        wrapper_template = (
            '@echo off\r\n'
            'cd /d "%~dp0"\r\n'
            'call "installer\\{bat}" %*\r\n'
        )
        for bat_name in ["install.bat", "upgrade.bat", "uninstall.bat"]:
            zf.writestr(
                f"{archive_root}/{bat_name}",
                wrapper_template.format(bat=bat_name),
            )
            file_count += 1

        # Add VERSION file
        zf.writestr(f"{archive_root}/VERSION", VERSION)
        file_count += 1

    size_mb = output_path.stat().st_size / 1024 / 1024
    print(f"  {file_count} files added")
    print(f"=== Archive created: {output_path} ({size_mb:.1f} MB) ===")


def create_sfx(zip_path: Path, sfx_path: Path):
    """Create a 7-Zip SFX executable from the zip archive.

    Requires 7-Zip to be installed on the build machine.
    """
    print(f"\n=== Creating SFX executable: {sfx_path} ===")

    # Check if 7z is available
    sz_exe = None
    for candidate in ["7z", r"C:\Program Files\7-Zip\7z.exe", r"C:\Program Files (x86)\7-Zip\7z.exe"]:
        try:
            subprocess.run([candidate, "--help"], capture_output=True, timeout=5)
            sz_exe = candidate
            break
        except (FileNotFoundError, subprocess.TimeoutExpired):
            continue

    if not sz_exe:
        print("  WARNING: 7-Zip not found. SFX executable not created.")
        print("  Install 7-Zip from https://7-zip.org to create .exe packages.")
        print(f"  The .zip archive is still available at: {zip_path}")
        return

    # Find the SFX module (try installer variant first, then standard GUI)
    sfx_module = None
    for candidate in [
        Path(r"C:\Program Files\7-Zip\7zS2.sfx"),
        Path(r"C:\Program Files (x86)\7-Zip\7zS2.sfx"),
        Path(r"C:\Program Files\7-Zip\7z.sfx"),
        Path(r"C:\Program Files (x86)\7-Zip\7z.sfx"),
    ]:
        if candidate.exists():
            sfx_module = candidate
            break

    if not sfx_module:
        print("  WARNING: 7zS2.sfx module not found. SFX executable not created.")
        return

    # Create 7z archive from zip contents
    archive_7z = zip_path.with_suffix(".7z")
    # Extract zip to temp, then re-archive as 7z
    temp_dir = zip_path.parent / "_sfx_temp"
    if temp_dir.exists():
        shutil.rmtree(temp_dir)

    import zipfile
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(temp_dir)

    subprocess.run(
        [sz_exe, "a", "-t7z", str(archive_7z), f"{temp_dir}\\*"],
        capture_output=True, check=True,
    )

    # Create SFX config
    config_txt = sfx_path.with_suffix(".sfx.txt")
    config_txt.write_text(
        ';!@Install@!UTF-8!\n'
        f'Title="Qualys2Human {VERSION}"\n'
        'BeginPrompt="Installer Qualys2Human ?"\n'
        f'RunProgram="installer\\\\install.bat"\n'
        ';!@InstallEnd@!\n',
        encoding="utf-8",
    )

    # Concatenate: sfx_module + config + archive → exe
    with open(sfx_path, "wb") as out:
        out.write(sfx_module.read_bytes())
        out.write(config_txt.read_bytes())
        out.write(archive_7z.read_bytes())

    # Cleanup temp files
    shutil.rmtree(temp_dir, ignore_errors=True)
    archive_7z.unlink(missing_ok=True)
    config_txt.unlink(missing_ok=True)

    size_mb = sfx_path.stat().st_size / 1024 / 1024
    print(f"=== SFX executable created: {sfx_path} ({size_mb:.1f} MB) ===")


def main():
    parser = argparse.ArgumentParser(description="Package Qualys2Human for offline deployment")
    parser.add_argument("--build-dir", default="dist", help="Build directory (default: dist)")
    parser.add_argument("--output", default=None, help="Output filename (without extension)")
    parser.add_argument("--skip-build", action="store_true", help="Skip automatic build")
    parser.add_argument("--skip-sfx", action="store_true", help="Skip SFX .exe creation")
    args = parser.parse_args()

    build_dir = ROOT / args.build_dir
    base_name = args.output or f"Qualys2Human-{VERSION}"
    zip_path = ROOT / f"{base_name}.zip"
    sfx_path = ROOT / f"{base_name}.exe"

    if not args.skip_build:
        ensure_build(build_dir)

    create_archive(build_dir, zip_path)

    if not args.skip_sfx:
        create_sfx(zip_path, sfx_path)


if __name__ == "__main__":
    main()
