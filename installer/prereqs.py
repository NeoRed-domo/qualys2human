"""Prerequisites — OS checks, PostgreSQL silent install, TLS certificate generation."""

import ipaddress
import platform
import shutil
import socket
import subprocess
import sys
from pathlib import Path

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
    install_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    logger.info("[OK] WinSW copie dans %s", dst)
    return True


def generate_tls_cert(install_dir: Path, logger=None) -> bool:
    """Generate a self-signed TLS certificate."""
    certs_dir = install_dir / "certs"
    certs_dir.mkdir(parents=True, exist_ok=True)
    cert_file = certs_dir / "server.crt"
    key_file = certs_dir / "server.key"

    if cert_file.exists() and key_file.exists():
        logger.info("[OK] Certificats TLS existants conserves")
        return True

    logger.info("Generation du certificat TLS auto-signe...")
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
        key_file.write_bytes(
            key.private_bytes(
                serialization.Encoding.PEM,
                serialization.PrivateFormat.TraditionalOpenSSL,
                serialization.NoEncryption(),
            )
        )
        cert_file.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
        logger.info("[OK] Certificat TLS genere: %s", cert_file)
        return True
    except ImportError:
        pass

    # Fallback: use openssl command line
    try:
        subprocess.run([
            "openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes",
            "-keyout", str(key_file), "-out", str(cert_file),
            "-days", "3650", "-subj", "/CN=Qualys2Human/O=NeoRed",
        ], check=True, capture_output=True)
        logger.info("[OK] Certificat TLS genere (openssl): %s", cert_file)
        return True
    except (FileNotFoundError, subprocess.CalledProcessError) as e:
        logger.error("Echec generation certificat TLS: %s", e)
        return False


def run_all(install_dir: Path, server_port: int, pg_password: str, logger=None) -> bool:
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
