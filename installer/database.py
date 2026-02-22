"""Database initialization — PostgreSQL role, database, extensions, Alembic migrations."""

import os
import subprocess
from pathlib import Path


def _psql(cmd: str, pg_password: str, install_dir: Path, logger=None) -> bool:
    """Run a psql command as the postgres superuser."""
    pg_bin = install_dir / "pgsql" / "bin" / "psql.exe"
    if not pg_bin.exists():
        pg_bin = "psql"

    env = {**os.environ, "PGPASSWORD": pg_password}
    try:
        result = subprocess.run(
            [str(pg_bin), "-U", "postgres", "-h", "localhost", "-c", cmd],
            capture_output=True, text=True, timeout=30, env=env,
        )
        if result.returncode != 0 and "already exists" not in (result.stderr or ""):
            logger.error("psql echoue: %s", result.stderr.strip() if result.stderr else "")
            return False
        return True
    except (FileNotFoundError, subprocess.TimeoutExpired) as e:
        logger.error("psql non accessible: %s", e)
        return False


def create_role(db_user: str, db_password: str, pg_superpass: str,
                install_dir: Path, logger=None) -> bool:
    """Create the q2h PostgreSQL role."""
    logger.info("Creation du role PostgreSQL '%s'...", db_user)
    ok = _psql(
        f"CREATE ROLE {db_user} WITH LOGIN PASSWORD '{db_password}';",
        pg_superpass, install_dir, logger,
    )
    if ok:
        logger.info("[OK] Role '%s' cree", db_user)
    return ok


def create_database(db_name: str, db_user: str, pg_superpass: str,
                    install_dir: Path, logger=None) -> bool:
    """Create the qualys2human database and enable pgcrypto."""
    logger.info("Creation de la base '%s'...", db_name)
    ok = _psql(
        f"CREATE DATABASE {db_name} OWNER {db_user};",
        pg_superpass, install_dir, logger,
    )
    if ok:
        logger.info("[OK] Base '%s' creee", db_name)
    # Enable pgcrypto on the new database
    pg_bin = install_dir / "pgsql" / "bin" / "psql.exe"
    if not pg_bin.exists():
        pg_bin = "psql"
    env = {**os.environ, "PGPASSWORD": pg_superpass}
    try:
        subprocess.run(
            [str(pg_bin), "-U", "postgres", "-h", "localhost", "-d", db_name,
             "-c", "CREATE EXTENSION IF NOT EXISTS pgcrypto;"],
            capture_output=True, text=True, timeout=30, env=env,
        )
        logger.info("[OK] Extension pgcrypto activee")
    except Exception as e:
        logger.warning("pgcrypto: %s", e)
    return ok


def run_migrations(install_dir: Path, logger=None) -> bool:
    """Run Alembic migrations."""
    logger.info("Execution des migrations Alembic...")
    python_exe = install_dir / "python" / "python.exe"
    backend_dir = install_dir / "app" / "backend"
    alembic_ini = backend_dir / "alembic.ini"

    if not alembic_ini.exists():
        logger.error("alembic.ini non trouve dans %s", backend_dir)
        return False

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
        logger.error("Migrations timeout (>2 min)")
        return False


def run_all(install_dir: Path, *, db_name: str = "qualys2human", db_user: str = "q2h",
            db_password: str, pg_superpass: str, logger=None) -> bool:
    """Full database initialization."""
    if not create_role(db_user, db_password, pg_superpass, install_dir, logger):
        return False
    if not create_database(db_name, db_user, pg_superpass, install_dir, logger):
        return False
    if not run_migrations(install_dir, logger):
        return False
    return True
