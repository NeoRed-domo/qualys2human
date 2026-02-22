"""Build script — compiles frontend, collects backend + dependencies.

Usage:
    python scripts/build.py [--output-dir dist]

Produces a `dist/` folder with:
    dist/
    ├── backend/         (Python source + installed deps in .venv)
    ├── frontend/        (Vite production build → static files)
    ├── data/            (branding assets)
    └── config.yaml      (template config)
"""

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT / "backend"
FRONTEND_DIR = ROOT / "frontend"
DATA_DIR = ROOT / "data"


def run(cmd: list[str], cwd: Path | None = None, env=None):
    """Run a subprocess, printing output live."""
    print(f"  > {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=cwd, env=env)
    if result.returncode != 0:
        print(f"  ERROR: Command failed with exit code {result.returncode}")
        sys.exit(1)


def build_frontend(output: Path):
    """Build React frontend with Vite."""
    print("\n=== Building frontend ===")
    run(["npm", "install"], cwd=FRONTEND_DIR)
    run(["npx", "vite", "build"], cwd=FRONTEND_DIR)

    src = FRONTEND_DIR / "dist"
    dst = output / "frontend"
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst)
    print(f"  Frontend build copied to {dst}")


def collect_backend(output: Path):
    """Copy backend source and install dependencies into a virtual env."""
    print("\n=== Collecting backend ===")
    dst = output / "backend"
    if dst.exists():
        shutil.rmtree(dst)

    # Copy source
    src_dir = BACKEND_DIR / "src"
    shutil.copytree(src_dir, dst / "src")

    # Copy pyproject.toml and config
    shutil.copy2(BACKEND_DIR / "pyproject.toml", dst / "pyproject.toml")
    config_yaml = BACKEND_DIR / "config.yaml"
    if config_yaml.exists():
        shutil.copy2(config_yaml, dst / "config.yaml")

    # Copy alembic config and migrations
    alembic_ini = BACKEND_DIR / "alembic.ini"
    if alembic_ini.exists():
        shutil.copy2(alembic_ini, dst / "alembic.ini")
    alembic_dir = BACKEND_DIR / "alembic"
    if alembic_dir.exists():
        shutil.copytree(alembic_dir, dst / "alembic")

    # Install dependencies into a local venv
    venv_dir = dst / ".venv"
    print(f"  Creating virtual environment at {venv_dir}")
    run([sys.executable, "-m", "venv", str(venv_dir)])

    # Determine pip path
    if os.name == "nt":
        pip = str(venv_dir / "Scripts" / "pip.exe")
    else:
        pip = str(venv_dir / "bin" / "pip")

    run([pip, "install", "--no-cache-dir", str(dst)])
    print(f"  Backend collected to {dst}")


def collect_data(output: Path):
    """Copy data assets (branding, etc.)."""
    print("\n=== Collecting data assets ===")
    dst = output / "data"
    if dst.exists():
        shutil.rmtree(dst)
    if DATA_DIR.exists():
        shutil.copytree(DATA_DIR, dst)
        print(f"  Data copied to {dst}")
    else:
        print("  No data directory found, skipping")


def main():
    parser = argparse.ArgumentParser(description="Build Qualys2Human for deployment")
    parser.add_argument("--output-dir", default="dist", help="Output directory (default: dist)")
    parser.add_argument("--skip-frontend", action="store_true", help="Skip frontend build")
    parser.add_argument("--skip-backend", action="store_true", help="Skip backend collection")
    args = parser.parse_args()

    output = ROOT / args.output_dir
    output.mkdir(parents=True, exist_ok=True)
    print(f"Build output: {output}")

    if not args.skip_frontend:
        build_frontend(output)
    if not args.skip_backend:
        collect_backend(output)
    collect_data(output)

    print(f"\n=== Build complete: {output} ===")


if __name__ == "__main__":
    main()
