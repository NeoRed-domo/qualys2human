"""Upgrade — backup current installation, replace files, run migrations, restart."""

import shutil
import ssl
import subprocess
import sys
import time
import urllib.request
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).absolute().parent))

from utils import banner, check_admin, prompt, setup_logging
import service as service_mod

SCRIPT_DIR = Path(__file__).absolute().parent
PACKAGE_ROOT = SCRIPT_DIR.parent


def detect_install_dir() -> Path | None:
    """Try to detect existing installation directory."""
    candidates = [Path(r"C:\Q2H"), Path(r"C:\Qualys2Human")]
    for p in candidates:
        if (p / "config.yaml").exists():
            return p
    return None


def backup(install_dir: Path, logger) -> Path | None:
    """Create a backup of config, certs, keys, data, and database."""
    ts = datetime.now().strftime("%Y-%m-%d-%H%M")
    backup_dir = install_dir / "backups" / ts
    backup_dir.mkdir(parents=True, exist_ok=True)

    # Backup config files
    for name in ["config.yaml", ".env"]:
        src = install_dir / name
        if src.exists():
            shutil.copy2(src, backup_dir / name)

    # Backup directories
    for dirname in ["certs", "keys", "data"]:
        src = install_dir / dirname
        if src.exists():
            shutil.copytree(src, backup_dir / dirname)

    # Backup database
    logger.info("Sauvegarde de la base de donnees (pg_dump)...")
    pg_dump = install_dir / "pgsql" / "bin" / "pg_dump.exe"
    if not pg_dump.exists():
        pg_dump = "pg_dump"

    dump_file = backup_dir / "qualys2human.sql"
    try:
        import yaml
        config = yaml.safe_load((install_dir / "config.yaml").read_text(encoding="utf-8"))
        db_conf = config.get("database", {})
        import os
        env = {**os.environ, "PGPASSWORD": db_conf.get("password", "")}

        subprocess.run(
            [str(pg_dump), "-U", db_conf.get("user", "q2h"), "-h", "localhost",
             "-d", db_conf.get("name", "qualys2human"), "-f", str(dump_file)],
            env=env, capture_output=True, text=True, timeout=300, check=True,
        )
        logger.info("[OK] Base sauvegardee: %s", dump_file)
    except Exception as e:
        logger.warning("Sauvegarde DB echouee: %s", e)

    logger.info("[OK] Backup complet: %s", backup_dir)
    return backup_dir


def upgrade_files(install_dir: Path, logger):
    """Replace app/ and python/ with new versions, preserving config."""
    for subdir in ["app", "python"]:
        src = PACKAGE_ROOT / subdir
        dst = install_dir / subdir
        if src.exists():
            if dst.exists():
                shutil.rmtree(dst)
            shutil.copytree(src, dst)
            logger.info("  [OK] %s/ mis a jour", subdir)


def run_migrations(install_dir: Path, logger) -> bool:
    """Run Alembic migrations after upgrade."""
    python_exe = install_dir / "python" / "python.exe"
    backend_dir = install_dir / "app" / "backend"
    try:
        result = subprocess.run(
            [str(python_exe), "-m", "alembic", "upgrade", "head"],
            cwd=backend_dir, capture_output=True, text=True, timeout=120,
        )
        if result.returncode != 0:
            logger.error("Migrations echouees: %s", result.stderr[:500] if result.stderr else "")
            return False
        logger.info("[OK] Migrations executees")
        return True
    except subprocess.TimeoutExpired:
        logger.error("Migrations timeout")
        return False


def rollback(install_dir: Path, backup_dir: Path, logger):
    """Restore from backup on failure."""
    logger.warning("Rollback en cours depuis %s ...", backup_dir)
    for name in ["config.yaml", ".env"]:
        src = backup_dir / name
        if src.exists():
            shutil.copy2(src, install_dir / name)
    for dirname in ["certs", "keys", "data"]:
        src = backup_dir / dirname
        dst = install_dir / dirname
        if src.exists():
            if dst.exists():
                shutil.rmtree(dst)
            shutil.copytree(src, dst)
    logger.info("[OK] Fichiers restaures depuis le backup")


def health_check(port: int, logger, retries: int = 10, delay: float = 3.0) -> bool:
    """Wait for the application to respond on /api/health."""
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    url = f"https://localhost:{port}/api/health"
    logger.info("Verification: %s ...", url)

    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.urlopen(url, timeout=5, context=ctx)
            if req.status == 200:
                logger.info("[OK] Application accessible")
                return True
        except Exception:
            pass
        if attempt < retries:
            time.sleep(delay)

    logger.error("L'application ne repond pas apres %d tentatives", retries)
    return False


def main():
    version_file = PACKAGE_ROOT / "VERSION"
    version = version_file.read_text().strip() if version_file.exists() else "dev"
    banner(version)
    print("  Mode: MISE A JOUR\n")

    if not check_admin():
        print("[ERREUR] Droits administrateur requis.")
        sys.exit(1)

    install_dir = detect_install_dir()
    if not install_dir:
        install_dir = Path(prompt("Repertoire d'installation existant", r"C:\Q2H"))
    if not (install_dir / "config.yaml").exists():
        print(f"[ERREUR] Installation non trouvee dans {install_dir}")
        sys.exit(1)

    logger = setup_logging(install_dir / "logs" / "upgrade.log")
    service_name = prompt("Nom du service Windows", "Qualys2Human")

    # Step 1: Stop service
    logger.info("Arret du service '%s'...", service_name)
    service_mod.stop_service(install_dir, service_name, logger)

    # Step 2: Backup
    print("\n--- Sauvegarde ---")
    backup_dir = backup(install_dir, logger)

    # Step 3: Replace files
    print("\n--- Mise a jour des fichiers ---")
    upgrade_files(install_dir, logger)

    # Step 4: Migrations
    print("\n--- Migrations ---")
    if not run_migrations(install_dir, logger):
        if backup_dir:
            rollback(install_dir, backup_dir, logger)
        sys.exit(1)

    # Step 5: Restart
    print("\n--- Redemarrage ---")
    service_mod._winsw(install_dir, "start", service_name, logger)

    # Health check
    import yaml
    config = yaml.safe_load((install_dir / "config.yaml").read_text(encoding="utf-8"))
    port = config.get("server", {}).get("port", 8443)
    if not health_check(port, logger):
        logger.warning("L'application ne repond pas. Rollback...")
        if backup_dir:
            rollback(install_dir, backup_dir, logger)
            service_mod._winsw(install_dir, "start", service_name, logger)
        sys.exit(1)

    print()
    print("=" * 56)
    print(f"  Mise a jour vers v{version} terminee!")
    print("=" * 56)


if __name__ == "__main__":
    main()
