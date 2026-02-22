# Packaging & Installer — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Produce a single self-extracting `.exe` that installs Qualys2Human from scratch on an offline Windows Server (PostgreSQL, service, TLS, config — all automated).

**Architecture:** Modular Python installer (`installer/`) orchestrated by `setup.py`, with separate modules for prerequisites, database, service (WinSW), config generation, upgrade, and uninstall. Build pipeline (`scripts/`) produces the offline package from the dev machine.

**Tech Stack:** Python 3.12 embedded, WinSW, PostgreSQL 18 silent installer, 7-Zip SFX, YAML config, Alembic migrations.

**Design doc:** `docs/plans/2026-02-22-packaging-installer-design.md`

---

## Task 1: installer/utils.py — Logging, prompts, password generation

**Files:**
- Create: `installer/utils.py`

**Step 1: Write `installer/utils.py`**

```python
"""Installer utilities — logging, prompts, password generation."""

import logging
import os
import secrets
import string
import sys
from pathlib import Path


def setup_logging(log_file: Path | None = None) -> logging.Logger:
    """Configure installer logging to console + optional file."""
    logger = logging.getLogger("q2h.installer")
    logger.setLevel(logging.INFO)

    fmt = logging.Formatter("[%(levelname)s] %(message)s")

    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(fmt)
    logger.addHandler(console)

    if log_file:
        log_file.parent.mkdir(parents=True, exist_ok=True)
        fh = logging.FileHandler(log_file, encoding="utf-8")
        fh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
        logger.addHandler(fh)

    return logger


def prompt(message: str, default: str = "", password: bool = False,
           non_interactive: bool = False) -> str:
    """Prompt user for input. In non-interactive mode, return default."""
    if non_interactive:
        return default
    suffix = f" [{default}]" if default and not password else ""
    try:
        if password:
            import getpass
            value = getpass.getpass(f"  {message}: ").strip()
        else:
            value = input(f"  {message}{suffix}: ").strip()
    except (EOFError, KeyboardInterrupt):
        print("\nInstallation annulee.")
        sys.exit(1)
    return value or default


def prompt_confirm(message: str, default: bool = True,
                   non_interactive: bool = False) -> bool:
    """Prompt for yes/no confirmation."""
    if non_interactive:
        return default
    suffix = "[O/n]" if default else "[o/N]"
    try:
        value = input(f"  {message} {suffix}: ").strip().lower()
    except (EOFError, KeyboardInterrupt):
        print("\nInstallation annulee.")
        sys.exit(1)
    if not value:
        return default
    return value in ("o", "oui", "y", "yes")


def generate_password(length: int = 32) -> str:
    """Generate a cryptographically secure random password."""
    alphabet = string.ascii_letters + string.digits + "!@#$%&*"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def generate_secret(length: int = 64) -> str:
    """Generate a hex secret (for JWT, etc.)."""
    return secrets.token_hex(length // 2)


def check_admin() -> bool:
    """Check if running with administrator privileges (Windows)."""
    if os.name != "nt":
        return os.geteuid() == 0
    try:
        import ctypes
        return ctypes.windll.shell32.IsUserAnAdmin() != 0
    except Exception:
        return False


def validate_password_strength(password: str) -> str | None:
    """Validate admin password strength. Returns error message or None."""
    if len(password) < 10:
        return "Le mot de passe doit contenir au moins 10 caracteres"
    has_upper = any(c.isupper() for c in password)
    has_lower = any(c.islower() for c in password)
    has_digit = any(c.isdigit() for c in password)
    has_special = any(c in "!@#$%^&*()-_=+[]{}|;:,.<>?" for c in password)
    if not (has_upper and has_lower and has_digit and has_special):
        return "Le mot de passe doit contenir majuscules, minuscules, chiffres et caracteres speciaux"
    return None


def banner(version: str):
    """Display installer banner."""
    print()
    print("=" * 56)
    print("  Qualys2Human — Installer")
    print(f"  Version: {version}")
    print("  NeoRed (c) 2026")
    print("=" * 56)
    print()
```

**Step 2: Commit**

```bash
git add installer/utils.py
git commit -m "feat(installer): add utils module — logging, prompts, password generation"
```

---

## Task 2: installer/prereqs.py — OS checks, PostgreSQL install, TLS cert

**Files:**
- Create: `installer/prereqs.py`

**Step 1: Write `installer/prereqs.py`**

```python
"""Prerequisites — OS checks, PostgreSQL silent install, TLS certificate generation."""

import platform
import shutil
import socket
import subprocess
import ssl
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from utils import setup_logging

SCRIPT_DIR = Path(__file__).resolve().parent
PACKAGE_ROOT = SCRIPT_DIR.parent


def check_os(logger) -> bool:
    """Verify Windows Server 2019+ (build >= 17763)."""
    if platform.system() != "Windows":
        logger.error("Ce programme est prevu pour Windows Server.")
        return False
    build = int(platform.version().split(".")[-1])
    if build < 17763:
        logger.error("Windows Server 2019 ou superieur requis (build actuel: %s)", build)
        return False
    logger.info("[OK] Windows %s (build %s)", platform.version(), build)
    return True


def check_disk_space(install_dir: Path, min_gb: float = 2.0, logger=None) -> bool:
    """Verify enough free disk space."""
    drive = install_dir.anchor or install_dir.parts[0]
    usage = shutil.disk_usage(drive)
    free_gb = usage.free / (1024 ** 3)
    if free_gb < min_gb:
        logger.error("Espace disque insuffisant: %.1f Go libre (minimum %.1f Go)", free_gb, min_gb)
        return False
    logger.info("[OK] Espace disque: %.1f Go libre", free_gb)
    return True


def check_port(port: int, logger=None) -> bool:
    """Verify that the target port is available."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(("0.0.0.0", port))
            logger.info("[OK] Port %d disponible", port)
            return True
        except OSError:
            logger.error("Port %d deja utilise", port)
            return False


def install_postgresql(install_dir: Path, pg_password: str, logger=None) -> bool:
    """Install PostgreSQL silently from bundled installer."""
    pg_installer = PACKAGE_ROOT / "prerequisites" / "postgresql-18.2-1-windows-x64.exe"
    if not pg_installer.exists():
        logger.error("Installeur PostgreSQL non trouve: %s", pg_installer)
        return False

    pg_data_dir = install_dir / "pgsql" / "data"
    pg_install_dir = install_dir / "pgsql"

    logger.info("Installation de PostgreSQL (silencieux)...")
    cmd = [
        str(pg_installer),
        "--mode", "unattended",
        "--unattendedmodeui", "none",
        "--prefix", str(pg_install_dir),
        "--datadir", str(pg_data_dir),
        "--superpassword", pg_password,
        "--serverport", "5432",
        "--servicename", "postgresql-q2h",
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if result.returncode != 0:
            logger.error("PostgreSQL installation echouee (code %d)", result.returncode)
            logger.error(result.stderr[:500] if result.stderr else "Pas de details")
            return False
        logger.info("[OK] PostgreSQL installe dans %s", pg_install_dir)
        return True
    except subprocess.TimeoutExpired:
        logger.error("PostgreSQL installation timeout (>5 min)")
        return False


def copy_winsw(install_dir: Path, logger=None) -> bool:
    """Copy WinSW executable to installation directory."""
    src = PACKAGE_ROOT / "prerequisites" / "WinSW-x64.exe"
    if not src.exists():
        logger.error("WinSW non trouve: %s", src)
        return False
    dst = install_dir / "WinSW-x64.exe"
    shutil.copy2(src, dst)
    logger.info("[OK] WinSW copie dans %s", dst)
    return True


def generate_tls_cert(install_dir: Path, logger=None) -> bool:
    """Generate a self-signed TLS certificate using Python ssl module."""
    certs_dir = install_dir / "certs"
    certs_dir.mkdir(parents=True, exist_ok=True)
    cert_file = certs_dir / "server.crt"
    key_file = certs_dir / "server.key"

    if cert_file.exists() and key_file.exists():
        logger.info("[OK] Certificats TLS existants conserves")
        return True

    logger.info("Generation du certificat TLS auto-signe...")
    try:
        # Use OpenSSL via subprocess (available with Python ssl)
        # Generate private key
        subprocess.run([
            sys.executable, "-c",
            f"""
import ssl, os
from pathlib import Path

# We use the cryptography library if available, otherwise openssl CLI
try:
    from cryptography import x509
    from cryptography.x509.oid import NameOID
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from datetime import datetime, timedelta, timezone

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, "Qualys2Human"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "NeoRed"),
    ])
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.now(timezone.utc))
        .not_valid_after(datetime.now(timezone.utc) + timedelta(days=3650))
        .add_extension(
            x509.SubjectAlternativeName([
                x509.DNSName("localhost"),
                x509.IPAddress(ipaddress.IPv4Address("127.0.0.1")),
            ]),
            critical=False,
        )
        .sign(key, hashes.SHA256())
    )
    Path(r"{key_file}").write_bytes(
        key.private_bytes(serialization.Encoding.PEM,
                          serialization.PrivateFormat.TraditionalOpenSSL,
                          serialization.NoEncryption())
    )
    Path(r"{cert_file}").write_bytes(cert.public_bytes(serialization.Encoding.PEM))
except ImportError:
    # Fallback: use openssl command line
    import subprocess as sp
    sp.run([
        "openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes",
        "-keyout", r"{key_file}", "-out", r"{cert_file}",
        "-days", "3650", "-subj", "/CN=Qualys2Human/O=NeoRed",
    ], check=True, capture_output=True)
""",
        ], check=True, capture_output=True, text=True)
        logger.info("[OK] Certificat TLS genere: %s", cert_file)
        return True
    except subprocess.CalledProcessError as e:
        logger.error("Echec generation certificat TLS: %s", e.stderr[:300] if e.stderr else str(e))
        return False


def run_all(install_dir: Path, server_port: int, pg_password: str, logger=None):
    """Run all prerequisite checks and installations."""
    if not check_os(logger):
        return False
    if not check_disk_space(install_dir, logger=logger):
        return False
    if not check_port(server_port, logger=logger):
        return False
    if not install_postgresql(install_dir, pg_password, logger=logger):
        return False
    if not copy_winsw(install_dir, logger=logger):
        return False
    if not generate_tls_cert(install_dir, logger=logger):
        return False
    return True
```

**Step 2: Commit**

```bash
git add installer/prereqs.py
git commit -m "feat(installer): add prereqs module — OS checks, PostgreSQL install, TLS cert"
```

---

## Task 3: installer/config.py — Generate config.yaml, secrets, master key

**Files:**
- Create: `installer/config.py`

**Step 1: Write `installer/config.py`**

```python
"""Configuration generation — config.yaml, JWT secret, master key."""

import os
import yaml
from pathlib import Path

from utils import generate_password, generate_secret


def generate_config(
    install_dir: Path,
    *,
    server_host: str = "0.0.0.0",
    server_port: int = 8443,
    db_host: str = "localhost",
    db_port: int = 5432,
    db_name: str = "qualys2human",
    db_user: str = "q2h",
    db_password: str = "",
    logger=None,
) -> Path:
    """Generate config.yaml from parameters."""
    config = {
        "server": {
            "host": server_host,
            "port": server_port,
            "tls_cert": "./certs/server.crt",
            "tls_key": "./certs/server.key",
        },
        "database": {
            "host": db_host,
            "port": db_port,
            "name": db_name,
            "user": db_user,
            "password": db_password,
            "encryption_key_file": "./keys/master.key",
        },
        "watcher": {
            "enabled": False,
            "paths": [],
            "poll_interval": 10,
            "stable_seconds": 5,
        },
    }

    config_path = install_dir / "config.yaml"
    config_path.write_text(
        yaml.dump(config, default_flow_style=False, allow_unicode=True, sort_keys=False),
        encoding="utf-8",
    )
    logger.info("[OK] config.yaml genere: %s", config_path)
    return config_path


def generate_jwt_secret(install_dir: Path, logger=None) -> str:
    """Generate and save a random JWT secret."""
    secret = generate_secret(64)
    # Store in an env file that the app reads
    env_file = install_dir / ".env"
    lines = []
    if env_file.exists():
        lines = env_file.read_text(encoding="utf-8").splitlines()
        lines = [l for l in lines if not l.startswith("JWT_SECRET=")]
    lines.append(f"JWT_SECRET={secret}")
    env_file.write_text("\n".join(lines) + "\n", encoding="utf-8")
    logger.info("[OK] JWT secret genere")
    return secret


def create_master_key(install_dir: Path, logger=None) -> bool:
    """Create encryption master key (DPAPI-protected on Windows)."""
    keys_dir = install_dir / "keys"
    keys_dir.mkdir(parents=True, exist_ok=True)
    key_file = keys_dir / "master.key"

    if key_file.exists():
        logger.info("[OK] Master key existante conservee")
        return True

    # Generate raw key
    raw_key = os.urandom(32)  # AES-256

    if os.name == "nt":
        try:
            import ctypes
            import ctypes.wintypes

            # DPAPI CryptProtectData
            class DATA_BLOB(ctypes.Structure):
                _fields_ = [
                    ("cbData", ctypes.wintypes.DWORD),
                    ("pbData", ctypes.POINTER(ctypes.c_byte)),
                ]

            input_blob = DATA_BLOB()
            input_blob.cbData = len(raw_key)
            input_blob.pbData = (ctypes.c_byte * len(raw_key))(*raw_key)
            output_blob = DATA_BLOB()

            if ctypes.windll.crypt32.CryptProtectData(
                ctypes.byref(input_blob), "Q2H Master Key", None, None, None, 0,
                ctypes.byref(output_blob),
            ):
                protected = bytes(
                    (ctypes.c_byte * output_blob.cbData).from_address(output_blob.pbData)
                )
                key_file.write_bytes(protected)
                ctypes.windll.kernel32.LocalFree(output_blob.pbData)
                logger.info("[OK] Master key generee (DPAPI protegee)")
                return True
        except Exception as e:
            logger.warning("DPAPI non disponible: %s. Sauvegarde en clair.", e)

    # Fallback: save raw key (non-Windows or DPAPI failure)
    key_file.write_bytes(raw_key)
    logger.info("[OK] Master key generee (attention: non chiffree)")
    return True


def run_all(install_dir: Path, *, db_password: str, server_port: int = 8443,
            logger=None) -> bool:
    """Generate all configuration files."""
    generate_config(
        install_dir,
        server_port=server_port,
        db_password=db_password,
        logger=logger,
    )
    generate_jwt_secret(install_dir, logger=logger)
    create_master_key(install_dir, logger=logger)
    return True
```

**Step 2: Commit**

```bash
git add installer/config.py
git commit -m "feat(installer): add config module — YAML generation, JWT secret, DPAPI master key"
```

---

## Task 4: installer/database.py — Create role, database, run migrations

**Files:**
- Create: `installer/database.py`

**Step 1: Write `installer/database.py`**

```python
"""Database initialization — PostgreSQL role, database, extensions, Alembic migrations."""

import subprocess
import sys
from pathlib import Path


def _psql(cmd: str, pg_password: str, install_dir: Path, logger=None) -> bool:
    """Run a psql command as the postgres superuser."""
    pg_bin = install_dir / "pgsql" / "bin" / "psql.exe"
    if not pg_bin.exists():
        # Fallback to PATH
        pg_bin = "psql"

    env = {"PGPASSWORD": pg_password, "PATH": str(install_dir / "pgsql" / "bin")}
    try:
        result = subprocess.run(
            [str(pg_bin), "-U", "postgres", "-h", "localhost", "-c", cmd],
            capture_output=True, text=True, timeout=30, env={**__import__("os").environ, **env},
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
    """Create the qualys2human database."""
    logger.info("Creation de la base '%s'...", db_name)
    ok = _psql(
        f"CREATE DATABASE {db_name} OWNER {db_user};",
        pg_superpass, install_dir, logger,
    )
    if ok:
        logger.info("[OK] Base '%s' creee", db_name)
    # Enable pgcrypto
    _psql(
        f"\\c {db_name}\nCREATE EXTENSION IF NOT EXISTS pgcrypto;",
        pg_superpass, install_dir, logger,
    )
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
```

**Step 2: Commit**

```bash
git add installer/database.py
git commit -m "feat(installer): add database module — role, database, pgcrypto, Alembic"
```

---

## Task 5: installer/service.py — WinSW XML config, service install/start

**Files:**
- Create: `installer/service.py`

**Step 1: Write `installer/service.py`**

```python
"""Windows service management via WinSW."""

import subprocess
from pathlib import Path

SERVICE_NAME = "Qualys2Human"

WINSW_XML_TEMPLATE = """\
<service>
  <id>{service_id}</id>
  <name>{service_name}</name>
  <description>Qualys2Human vulnerability dashboard</description>
  <executable>{python_exe}</executable>
  <arguments>-m q2h.service</arguments>
  <workingdirectory>{working_dir}</workingdirectory>
  <startmode>Automatic</startmode>
  <onfailure action="restart" delay="10 sec" />
  <onfailure action="restart" delay="30 sec" />
  <onfailure action="none" />
  <log mode="roll-by-size">
    <sizeThreshold>10240</sizeThreshold>
    <keepFiles>5</keepFiles>
    <logpath>{log_dir}</logpath>
  </log>
  <env name="Q2H_CONFIG" value="{config_path}" />
</service>
"""


def generate_xml(install_dir: Path, service_name: str = SERVICE_NAME,
                 logger=None) -> Path:
    """Generate the WinSW XML configuration file."""
    python_exe = install_dir / "python" / "python.exe"
    working_dir = install_dir / "app" / "backend"
    log_dir = install_dir / "logs"
    config_path = install_dir / "config.yaml"

    log_dir.mkdir(parents=True, exist_ok=True)

    xml_content = WINSW_XML_TEMPLATE.format(
        service_id=service_name,
        service_name=service_name,
        python_exe=python_exe,
        working_dir=working_dir,
        log_dir=log_dir,
        config_path=config_path,
    )

    xml_path = install_dir / f"{service_name}.xml"
    xml_path.write_text(xml_content, encoding="utf-8")
    logger.info("[OK] Configuration WinSW generee: %s", xml_path)
    return xml_path


def _winsw(install_dir: Path, action: str, service_name: str = SERVICE_NAME,
           logger=None) -> bool:
    """Run a WinSW command."""
    winsw = install_dir / "WinSW-x64.exe"
    xml_path = install_dir / f"{service_name}.xml"

    if not winsw.exists():
        logger.error("WinSW non trouve: %s", winsw)
        return False

    try:
        result = subprocess.run(
            [str(winsw), action, str(xml_path)],
            capture_output=True, text=True, timeout=60,
        )
        if result.returncode != 0:
            logger.error("WinSW %s echoue: %s", action,
                         result.stderr.strip() if result.stderr else result.stdout.strip())
            return False
        return True
    except subprocess.TimeoutExpired:
        logger.error("WinSW %s timeout", action)
        return False


def install_service(install_dir: Path, service_name: str = SERVICE_NAME,
                    logger=None) -> bool:
    """Install and start the Windows service."""
    generate_xml(install_dir, service_name, logger)

    logger.info("Installation du service '%s'...", service_name)
    if not _winsw(install_dir, "install", service_name, logger):
        return False
    logger.info("[OK] Service '%s' installe", service_name)

    logger.info("Demarrage du service '%s'...", service_name)
    if not _winsw(install_dir, "start", service_name, logger):
        return False
    logger.info("[OK] Service '%s' demarre", service_name)
    return True


def stop_service(install_dir: Path, service_name: str = SERVICE_NAME,
                 logger=None) -> bool:
    """Stop the service."""
    return _winsw(install_dir, "stop", service_name, logger)


def uninstall_service(install_dir: Path, service_name: str = SERVICE_NAME,
                      logger=None) -> bool:
    """Stop and uninstall the service."""
    _winsw(install_dir, "stop", service_name, logger)
    return _winsw(install_dir, "uninstall", service_name, logger)
```

**Step 2: Commit**

```bash
git add installer/service.py
git commit -m "feat(installer): add service module — WinSW XML config, install/start/stop"
```

---

## Task 6: installer/setup.py — Main orchestrator (rewrite)

**Files:**
- Modify: `installer/setup.py` (full rewrite)

**Step 1: Rewrite `installer/setup.py`**

```python
"""Qualys2Human — Main installer orchestrator.

Usage:
    python setup.py [--install-dir C:\\Q2H] [--port 8443] [--non-interactive]
"""

import argparse
import shutil
import sys
import time
from pathlib import Path

# Installer modules are in the same directory
sys.path.insert(0, str(Path(__file__).resolve().parent))

from utils import (
    banner, check_admin, generate_password, prompt, prompt_confirm,
    setup_logging, validate_password_strength,
)
import prereqs
import config as config_mod
import database
import service

SCRIPT_DIR = Path(__file__).resolve().parent
PACKAGE_ROOT = SCRIPT_DIR.parent
VERSION_FILE = PACKAGE_ROOT / "VERSION"


def read_version() -> str:
    if VERSION_FILE.exists():
        return VERSION_FILE.read_text().strip()
    return "dev"


def copy_app_files(install_dir: Path, logger):
    """Copy application files from package to installation directory."""
    logger.info("Copie des fichiers applicatifs...")

    # Copy Python embedded
    src_python = PACKAGE_ROOT / "python"
    dst_python = install_dir / "python"
    if src_python.exists():
        if dst_python.exists():
            shutil.rmtree(dst_python)
        shutil.copytree(src_python, dst_python)
        logger.info("  [OK] python/")

    # Copy app (backend + frontend)
    src_app = PACKAGE_ROOT / "app"
    dst_app = install_dir / "app"
    if src_app.exists():
        if dst_app.exists():
            shutil.rmtree(dst_app)
        shutil.copytree(src_app, dst_app)
        logger.info("  [OK] app/")

    # Copy data assets (branding, etc.)
    src_data = PACKAGE_ROOT / "data"
    dst_data = install_dir / "data"
    if src_data.exists() and not dst_data.exists():
        shutil.copytree(src_data, dst_data)
        logger.info("  [OK] data/")

    logger.info("[OK] Fichiers copies")


def health_check(port: int, logger, retries: int = 10, delay: float = 3.0) -> bool:
    """Wait for the application to respond on /api/health."""
    import urllib.request
    import ssl

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
    parser = argparse.ArgumentParser(description="Install Qualys2Human")
    parser.add_argument("--install-dir", default=r"C:\Q2H")
    parser.add_argument("--port", type=int, default=8443)
    parser.add_argument("--non-interactive", action="store_true")
    args = parser.parse_args()

    version = read_version()
    banner(version)
    ni = args.non_interactive

    # Setup logging
    install_dir = Path(prompt("Repertoire d'installation", args.install_dir, non_interactive=ni))
    log_file = install_dir / "logs" / "install.log"
    logger = setup_logging(log_file)

    # Check admin privileges
    if not check_admin():
        logger.error("Ce programme doit etre execute en tant qu'administrateur.")
        sys.exit(1)
    logger.info("[OK] Droits administrateur")

    # --- Prompts ---
    server_port = int(prompt("Port HTTPS", str(args.port), non_interactive=ni))

    # Admin password (mandatory, validated)
    while True:
        admin_password = prompt("Mot de passe administrateur", password=True, non_interactive=ni)
        if ni:
            admin_password = admin_password or "Qualys2Human!"
            break
        err = validate_password_strength(admin_password)
        if err:
            print(f"  [!] {err}")
            continue
        confirm = prompt("Confirmer le mot de passe", password=True, non_interactive=ni)
        if admin_password != confirm:
            print("  [!] Les mots de passe ne correspondent pas")
            continue
        break

    service_name = prompt("Nom du service Windows", "Qualys2Human", non_interactive=ni)

    # Generate secure passwords (never shown to user)
    pg_superpass = generate_password(32)
    db_password = generate_password(32)

    # --- Step 1: Prerequisites ---
    print("\n--- Etape 1/5 : Prerequis ---")
    if not prereqs.run_all(install_dir, server_port, pg_superpass, logger=logger):
        logger.error("Prerequis non satisfaits. Installation annulee.")
        sys.exit(1)

    # --- Step 2: Copy files ---
    print("\n--- Etape 2/5 : Copie des fichiers ---")
    copy_app_files(install_dir, logger)

    # --- Step 3: Configuration ---
    print("\n--- Etape 3/5 : Configuration ---")
    config_mod.run_all(install_dir, db_password=db_password, server_port=server_port, logger=logger)

    # --- Step 4: Database ---
    print("\n--- Etape 4/5 : Base de donnees ---")
    if not database.run_all(
        install_dir, db_password=db_password, pg_superpass=pg_superpass, logger=logger,
    ):
        logger.error("Initialisation de la base echouee.")
        sys.exit(1)

    # --- Step 5: Service ---
    print("\n--- Etape 5/5 : Service Windows ---")
    if not service.install_service(install_dir, service_name, logger=logger):
        logger.error("Installation du service echouee.")
        sys.exit(1)

    # --- Health check ---
    print()
    health_check(server_port, logger)

    # --- Done ---
    print()
    print("=" * 56)
    print("  Installation terminee avec succes!")
    print(f"  Repertoire : {install_dir}")
    print(f"  Application: https://localhost:{server_port}")
    print(f"  Identifiant: admin")
    print(f"  Service    : {service_name}")
    print()
    print("  IMPORTANT: Le mot de passe de la base de donnees a ete")
    print("  genere aleatoirement et stocke dans config.yaml.")
    print("  Ne partagez jamais ce fichier.")
    print("=" * 56)


if __name__ == "__main__":
    main()
```

**Step 2: Commit**

```bash
git add installer/setup.py
git commit -m "feat(installer): rewrite setup.py as modular orchestrator with 5 steps"
```

---

## Task 7: installer/upgrade.py — Backup + in-place upgrade

**Files:**
- Create: `installer/upgrade.py`

**Step 1: Write `installer/upgrade.py`**

```python
"""Upgrade — backup current installation, replace files, run migrations, restart."""

import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from utils import banner, check_admin, prompt, setup_logging
import service as service_mod

SCRIPT_DIR = Path(__file__).resolve().parent
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

    # Backup files
    for name in ["config.yaml", ".env"]:
        src = install_dir / name
        if src.exists():
            shutil.copy2(src, backup_dir / name)

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
        # Read db password from config.yaml
        import yaml
        config = yaml.safe_load((install_dir / "config.yaml").read_text(encoding="utf-8"))
        db_conf = config.get("database", {})
        env = {**__import__("os").environ, "PGPASSWORD": db_conf.get("password", "")}

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
    logger.info("--- Sauvegarde ---")
    backup_dir = backup(install_dir, logger)

    # Step 3: Replace files
    logger.info("--- Mise a jour des fichiers ---")
    upgrade_files(install_dir, logger)

    # Step 4: Migrations
    logger.info("--- Migrations ---")
    if not run_migrations(install_dir, logger):
        if backup_dir:
            rollback(install_dir, backup_dir, logger)
        sys.exit(1)

    # Step 5: Restart
    logger.info("--- Redemarrage ---")
    service_mod._winsw(install_dir, "start", service_name, logger)

    # Health check
    import importlib
    setup = importlib.import_module("setup")
    import yaml
    config = yaml.safe_load((install_dir / "config.yaml").read_text(encoding="utf-8"))
    port = config.get("server", {}).get("port", 8443)
    if not setup.health_check(port, logger):
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
```

**Step 2: Commit**

```bash
git add installer/upgrade.py
git commit -m "feat(installer): add upgrade module — backup, in-place update, rollback"
```

---

## Task 8: installer/uninstall.py — Clean removal

**Files:**
- Create: `installer/uninstall.py`

**Step 1: Write `installer/uninstall.py`**

```python
"""Uninstall — stop service, remove service, optionally drop database, delete files."""

import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from utils import banner, check_admin, prompt, prompt_confirm, setup_logging
import service as service_mod

SCRIPT_DIR = Path(__file__).resolve().parent
PACKAGE_ROOT = SCRIPT_DIR.parent


def drop_database(install_dir: Path, logger) -> bool:
    """Drop the qualys2human database and q2h role."""
    import yaml

    config_path = install_dir / "config.yaml"
    if not config_path.exists():
        logger.warning("config.yaml non trouve, suppression DB impossible")
        return False

    config = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    db = config.get("database", {})

    pg_bin = install_dir / "pgsql" / "bin" / "psql.exe"
    if not pg_bin.exists():
        pg_bin = "psql"

    # We need the postgres superuser password; try PGPASSWORD env or prompt
    env = {**__import__("os").environ}

    commands = [
        f"DROP DATABASE IF EXISTS {db.get('name', 'qualys2human')};",
        f"DROP ROLE IF EXISTS {db.get('user', 'q2h')};",
    ]

    for cmd in commands:
        try:
            subprocess.run(
                [str(pg_bin), "-U", "postgres", "-h", "localhost", "-c", cmd],
                env=env, capture_output=True, text=True, timeout=30,
            )
        except Exception as e:
            logger.warning("Commande SQL echouee: %s", e)

    logger.info("[OK] Base de donnees supprimee")
    return True


def main():
    banner("uninstall")
    print("  Mode: DESINSTALLATION\n")

    if not check_admin():
        print("[ERREUR] Droits administrateur requis.")
        sys.exit(1)

    install_dir = Path(prompt("Repertoire d'installation", r"C:\Q2H"))
    if not install_dir.exists():
        print(f"[ERREUR] Repertoire non trouve: {install_dir}")
        sys.exit(1)

    logger = setup_logging()
    service_name = prompt("Nom du service Windows", "Qualys2Human")

    # Stop and remove service
    logger.info("Arret et suppression du service '%s'...", service_name)
    service_mod.uninstall_service(install_dir, service_name, logger)
    logger.info("[OK] Service supprime")

    # Ask about database
    keep_db = not prompt_confirm(
        "Voulez-vous supprimer la base de donnees ? (les donnees seront perdues)",
        default=False,
    )
    if not keep_db:
        drop_database(install_dir, logger)

    # Delete files
    if prompt_confirm(f"Supprimer le repertoire {install_dir} ?", default=True):
        shutil.rmtree(install_dir, ignore_errors=True)
        logger.info("[OK] Repertoire %s supprime", install_dir)

    print()
    print("=" * 56)
    print("  Desinstallation terminee.")
    if keep_db:
        print("  La base de donnees PostgreSQL a ete conservee.")
    print("=" * 56)


if __name__ == "__main__":
    main()
```

**Step 2: Commit**

```bash
git add installer/uninstall.py
git commit -m "feat(installer): add uninstall module — service removal, optional DB drop"
```

---

## Task 9: install.bat / upgrade.bat / uninstall.bat — Entry points

**Files:**
- Modify: `installer/install.bat` (rewrite to use embedded Python)
- Create: `installer/upgrade.bat`
- Create: `installer/uninstall.bat`

**Step 1: Rewrite `installer/install.bat`**

```batch
@echo off
setlocal enableextensions
title Qualys2Human - Installation
echo.
echo ================================================
echo   Qualys2Human - Installation
echo   NeoRed (c) 2026
echo ================================================
echo.

:: Check admin rights
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] Ce script doit etre execute en tant qu'administrateur.
    echo Faites un clic droit ^> Executer en tant qu'administrateur.
    pause
    exit /b 1
)

:: Use embedded Python from the package
set "PYTHON=%~dp0..\python\python.exe"
if not exist "%PYTHON%" (
    echo [ERREUR] Python embarque non trouve: %PYTHON%
    echo Le package semble incomplet.
    pause
    exit /b 1
)

:: Run the setup script
echo Lancement de l'installateur...
echo.
"%PYTHON%" "%~dp0setup.py" %*

if %errorlevel% neq 0 (
    echo.
    echo [ERREUR] L'installation a echoue. Consultez les messages ci-dessus.
    pause
    exit /b 1
)

echo.
pause
```

**Step 2: Write `installer/upgrade.bat`**

```batch
@echo off
setlocal enableextensions
title Qualys2Human - Mise a jour
echo.
echo ================================================
echo   Qualys2Human - Mise a jour
echo   NeoRed (c) 2026
echo ================================================
echo.

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] Ce script doit etre execute en tant qu'administrateur.
    pause
    exit /b 1
)

set "PYTHON=%~dp0..\python\python.exe"
if not exist "%PYTHON%" (
    echo [ERREUR] Python embarque non trouve: %PYTHON%
    pause
    exit /b 1
)

"%PYTHON%" "%~dp0upgrade.py" %*

if %errorlevel% neq 0 (
    echo.
    echo [ERREUR] La mise a jour a echoue.
    pause
    exit /b 1
)

echo.
pause
```

**Step 3: Write `installer/uninstall.bat`**

```batch
@echo off
setlocal enableextensions
title Qualys2Human - Desinstallation
echo.
echo ================================================
echo   Qualys2Human - Desinstallation
echo   NeoRed (c) 2026
echo ================================================
echo.

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] Ce script doit etre execute en tant qu'administrateur.
    pause
    exit /b 1
)

set "PYTHON=%~dp0..\python\python.exe"
if not exist "%PYTHON%" (
    echo [ERREUR] Python embarque non trouve: %PYTHON%
    pause
    exit /b 1
)

"%PYTHON%" "%~dp0uninstall.py" %*

if %errorlevel% neq 0 (
    echo.
    echo [ERREUR] La desinstallation a echoue.
    pause
    exit /b 1
)

echo.
pause
```

**Step 4: Commit**

```bash
git add installer/install.bat installer/upgrade.bat installer/uninstall.bat
git commit -m "feat(installer): rewrite batch entry points for embedded Python"
```

---

## Task 10: Update config-template.yaml and README-INSTALL.txt

**Files:**
- Modify: `installer/config-template.yaml`
- Modify: `installer/README-INSTALL.txt`

**Step 1: Update `installer/config-template.yaml`** to match new structure (jwt_secret, monitoring, trends sections).

**Step 2: Rewrite `installer/README-INSTALL.txt`** to reflect the new automated install flow (no manual PostgreSQL, WinSW instead of NSSM, embedded Python, upgrade/uninstall).

**Step 3: Commit**

```bash
git add installer/config-template.yaml installer/README-INSTALL.txt
git commit -m "docs(installer): update config template and install README for new flow"
```

---

## Task 11: scripts/build.py — Rewrite for embedded Python

**Files:**
- Modify: `scripts/build.py`

**Step 1: Rewrite `scripts/build.py`**

The key changes:
1. Instead of creating a venv, prepare the Python embedded distribution
2. Unzip `prerequisites/python-embed/python-3.12.x-embed-amd64.zip` into `dist/python/`
3. Enable pip in embedded Python (edit `python312._pth` to uncomment `import site`)
4. Install backend dependencies into `python/Lib/site-packages/` using `pip install --target`
5. Copy backend source into `dist/app/backend/`
6. Build frontend and copy into `dist/app/frontend/`
7. Copy data assets

**Step 2: Commit**

```bash
git add scripts/build.py
git commit -m "feat(build): rewrite build.py for embedded Python + pip install --target"
```

---

## Task 12: scripts/package.py — Rewrite for 7-Zip SFX

**Files:**
- Modify: `scripts/package.py`

**Step 1: Rewrite `scripts/package.py`**

The key changes:
1. Assemble the final structure: `dist/` + `installer/` + `prerequisites/` (only WinSW and PG .exe) + `VERSION`
2. Move batch files to root of archive (install.bat, upgrade.bat, uninstall.bat)
3. Create `.7z` archive using 7-Zip CLI (`7z a -t7z`)
4. Create SFX config file for auto-extraction + auto-run install.bat
5. Concatenate: `7zS2.sfx` + `config.txt` + `archive.7z` → `Qualys2Human-1.0.0.exe`
6. Fallback to .zip if 7-Zip not installed

**Step 2: Commit**

```bash
git add scripts/package.py
git commit -m "feat(package): rewrite package.py for 7-Zip SFX .exe generation"
```

---

## Task 13: Final integration test and cleanup

**Files:**
- Review all modified files
- Remove references to NSSM throughout the codebase
- Verify no hardcoded `changeme` passwords remain in installer code

**Step 1: Search and replace NSSM references**

```bash
grep -r "nssm\|NSSM" installer/ scripts/ --include="*.py" --include="*.bat" --include="*.txt"
```

Fix any remaining references.

**Step 2: Verify no weak default passwords in installer**

The installer MUST:
- Generate random db password (never prompt the user for it)
- Require a strong admin password (validated)
- Generate random JWT secret

**Step 3: Commit**

```bash
git add -A
git commit -m "chore(installer): cleanup NSSM references, verify security defaults"
```

---

## Summary

| Task | Module | Description |
|------|--------|-------------|
| 1 | `installer/utils.py` | Logging, prompts, password generation, admin check |
| 2 | `installer/prereqs.py` | OS checks, PostgreSQL silent install, WinSW copy, TLS cert |
| 3 | `installer/config.py` | config.yaml generation, JWT secret, DPAPI master key |
| 4 | `installer/database.py` | PostgreSQL role, database, pgcrypto, Alembic migrations |
| 5 | `installer/service.py` | WinSW XML config, service install/start/stop/uninstall |
| 6 | `installer/setup.py` | Main orchestrator (rewrite) — 5-step install flow |
| 7 | `installer/upgrade.py` | Backup + in-place upgrade + rollback |
| 8 | `installer/uninstall.py` | Service removal, optional DB drop, file cleanup |
| 9 | `.bat` files | Entry points using embedded Python |
| 10 | Config + README | Updated docs for new flow |
| 11 | `scripts/build.py` | Rewrite for embedded Python packaging |
| 12 | `scripts/package.py` | Rewrite for 7-Zip SFX .exe generation |
| 13 | Cleanup | Remove NSSM refs, verify security defaults |
