"""Package script — creates an offline deployment archive.

Usage:
    python scripts/package.py [--build-dir dist] [--output qualys2human-vX.X.X.zip]

Expects `scripts/build.py` to have been run first (or runs it automatically).
Bundles the built artifacts into a zip ready for offline deployment on Windows Server.

The resulting zip contains:
    qualys2human/
    ├── backend/          (source + venv with all deps)
    ├── frontend/         (static build)
    ├── data/             (branding)
    ├── installer/        (install.bat, setup.py, config-template.yaml, README)
    ├── prerequisites/    (bundled NSSM, etc.)
    └── VERSION
"""

import argparse
import shutil
import subprocess
import sys
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parent.parent
VERSION = "1.0.0"


def ensure_build(build_dir: Path):
    """Run build if dist/ doesn't exist."""
    if not (build_dir / "backend").exists() or not (build_dir / "frontend").exists():
        print("Build artifacts not found, running build.py first...")
        subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "build.py"), "--output-dir", str(build_dir)],
            check=True,
        )


def create_archive(build_dir: Path, output_path: Path):
    """Create the offline zip archive."""
    print(f"\n=== Creating archive: {output_path} ===")

    archive_root = f"qualys2human-{VERSION}"

    with ZipFile(output_path, "w", ZIP_DEFLATED) as zf:
        # Add built artifacts
        for subdir in ["backend", "frontend", "data"]:
            src = build_dir / subdir
            if not src.exists():
                continue
            for fpath in src.rglob("*"):
                if fpath.is_file():
                    arcname = f"{archive_root}/{subdir}/{fpath.relative_to(src)}"
                    zf.write(fpath, arcname)
                    print(f"  + {arcname}")

        # Add installer directory
        installer_dir = ROOT / "installer"
        if installer_dir.exists():
            for fpath in installer_dir.rglob("*"):
                if fpath.is_file():
                    arcname = f"{archive_root}/installer/{fpath.relative_to(installer_dir)}"
                    zf.write(fpath, arcname)
                    print(f"  + {arcname}")

        # Add prerequisites (NSSM, etc.)
        prereqs_dir = ROOT / "prerequisites"
        if prereqs_dir.exists():
            for fpath in prereqs_dir.rglob("*"):
                if fpath.is_file():
                    arcname = f"{archive_root}/prerequisites/{fpath.relative_to(prereqs_dir)}"
                    zf.write(fpath, arcname)
                    print(f"  + {arcname}")

        # Add VERSION file
        zf.writestr(f"{archive_root}/VERSION", VERSION)

    size_mb = output_path.stat().st_size / 1024 / 1024
    print(f"\n=== Archive created: {output_path} ({size_mb:.1f} MB) ===")


def main():
    parser = argparse.ArgumentParser(description="Package Qualys2Human for offline deployment")
    parser.add_argument("--build-dir", default="dist", help="Build directory (default: dist)")
    parser.add_argument("--output", default=None, help="Output zip filename")
    parser.add_argument("--skip-build", action="store_true", help="Skip automatic build")
    args = parser.parse_args()

    build_dir = ROOT / args.build_dir
    output_name = args.output or f"qualys2human-{VERSION}.zip"
    output_path = ROOT / output_name

    if not args.skip_build:
        ensure_build(build_dir)

    create_archive(build_dir, output_path)


if __name__ == "__main__":
    main()
