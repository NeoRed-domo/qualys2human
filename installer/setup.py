"""Interactive installer for Qualys2Human on Windows Server.

Checks prerequisites, configures the database, creates the Windows service,
and initializes the application.

Usage:
    python setup.py [--install-dir C:\\Qualys2Human] [--non-interactive]
"""

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PACKAGE_ROOT = SCRIPT_DIR.parent  # The extracted archive root
VERSION_FILE = PACKAGE_ROOT / "VERSION"


def banner():
    print("=" * 56)
    print("  Qualys2Human — Installer")
    version = VERSION_FILE.read_text().strip() if VERSION_FILE.exists() else "dev"
    print(f"  Version: {version}")
    print("=" * 56)
    print()


def check_python():
    """Ensure Python 3.12+."""
    major, minor = sys.version_info[:2]
    if major < 3 or (major == 3 and minor < 12):
        print(f"[ERREUR] Python 3.12+ requis (actuel: {major}.{minor})")
        sys.exit(1)
    print(f"[OK] Python {major}.{minor}")


def check_postgresql():
    """Check if PostgreSQL is accessible."""
    try:
        result = subprocess.run(
            ["pg_isready"], capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0:
            print("[OK] PostgreSQL est accessible")
            return True
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
    print("[AVERTISSEMENT] PostgreSQL non detecte. Assurez-vous qu'il est installe et demarre.")
    return False


def check_nssm():
    """Check if NSSM is available."""
    nssm_path = PACKAGE_ROOT / "prerequisites" / "nssm.exe"
    if nssm_path.exists():
        print(f"[OK] NSSM trouve: {nssm_path}")
        return str(nssm_path)

    # Check PATH
    try:
        result = subprocess.run(["nssm", "version"], capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            print("[OK] NSSM dans le PATH")
            return "nssm"
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    print("[AVERTISSEMENT] NSSM non trouve. Le service Windows ne sera pas cree automatiquement.")
    return None


def prompt(message: str, default: str = "", non_interactive: bool = False) -> str:
    """Prompt user for input, or use default in non-interactive mode."""
    if non_interactive:
        return default
    suffix = f" [{default}]" if default else ""
    value = input(f"  {message}{suffix}: ").strip()
    return value or default


def install_files(install_dir: Path):
    """Copy application files to installation directory."""
    print(f"\n--- Installation dans {install_dir} ---")
    install_dir.mkdir(parents=True, exist_ok=True)

    for subdir in ["backend", "frontend", "data"]:
        src = PACKAGE_ROOT / subdir
        dst = install_dir / subdir
        if src.exists():
            if dst.exists():
                shutil.rmtree(dst)
            shutil.copytree(src, dst)
            print(f"  [OK] {subdir}/ copie")

    print("  [OK] Fichiers installes")


def configure(install_dir: Path, db_host: str, db_port: str, db_name: str,
              db_user: str, db_pass: str, server_port: str):
    """Generate config.yaml from template."""
    print("\n--- Configuration ---")
    config_template = SCRIPT_DIR / "config-template.yaml"
    config_dest = install_dir / "backend" / "config.yaml"

    if config_template.exists():
        content = config_template.read_text()
        content = content.replace('"localhost"', f'"{db_host}"')
        content = content.replace("port: 5432", f"port: {db_port}")
        content = content.replace('"qualys2human"', f'"{db_name}"')
        content = content.replace('"q2h"', f'"{db_user}"')
        content = content.replace('"CHANGE_ME"', f'"{db_pass}"')
        content = content.replace("port: 8443", f"port: {server_port}")
        config_dest.write_text(content)
        print(f"  [OK] config.yaml genere: {config_dest}")
    else:
        print("  [AVERTISSEMENT] Template de config non trouve, config manuelle requise")


def init_database(install_dir: Path):
    """Run Alembic migrations to initialize the database."""
    print("\n--- Initialisation de la base de donnees ---")
    backend_dir = install_dir / "backend"
    alembic_ini = backend_dir / "alembic.ini"

    if not alembic_ini.exists():
        print("  [AVERTISSEMENT] alembic.ini non trouve, migrations non executees")
        return

    venv_python = backend_dir / ".venv" / "Scripts" / "python.exe"
    if not venv_python.exists():
        venv_python = Path(sys.executable)

    try:
        subprocess.run(
            [str(venv_python), "-m", "alembic", "upgrade", "head"],
            cwd=backend_dir, check=True,
        )
        print("  [OK] Migrations executees")
    except subprocess.CalledProcessError:
        print("  [ERREUR] Les migrations ont echoue. Verifiez la connexion a la base.")


def install_service(nssm_path: str, install_dir: Path, service_name: str):
    """Install Qualys2Human as a Windows service using NSSM."""
    print(f"\n--- Installation du service '{service_name}' ---")

    venv_python = install_dir / "backend" / ".venv" / "Scripts" / "python.exe"
    if not venv_python.exists():
        print("  [ERREUR] venv Python non trouve, service non cree")
        return

    service_script = install_dir / "backend" / "src" / "q2h" / "service.py"

    try:
        # Remove existing service if any
        subprocess.run([nssm_path, "stop", service_name], capture_output=True)
        subprocess.run([nssm_path, "remove", service_name, "confirm"], capture_output=True)

        # Install service
        subprocess.run(
            [nssm_path, "install", service_name, str(venv_python), str(service_script)],
            check=True,
        )
        subprocess.run(
            [nssm_path, "set", service_name, "AppDirectory", str(install_dir / "backend")],
            check=True,
        )
        subprocess.run(
            [nssm_path, "set", service_name, "Description", "Qualys2Human vulnerability dashboard"],
            check=True,
        )
        subprocess.run(
            [nssm_path, "set", service_name, "Start", "SERVICE_AUTO_START"],
            check=True,
        )

        print(f"  [OK] Service '{service_name}' installe")
        print(f"  Demarrage: nssm start {service_name}")
    except subprocess.CalledProcessError:
        print(f"  [ERREUR] Impossible d'installer le service")


def main():
    parser = argparse.ArgumentParser(description="Install Qualys2Human")
    parser.add_argument("--install-dir", default=r"C:\Qualys2Human", help="Installation directory")
    parser.add_argument("--non-interactive", action="store_true", help="Use defaults, no prompts")
    args = parser.parse_args()

    banner()
    ni = args.non_interactive

    # --- Prerequisites ---
    print("--- Verification des prerequis ---")
    check_python()
    pg_ok = check_postgresql()
    nssm_path = check_nssm()
    print()

    # --- Configuration prompts ---
    install_dir = Path(prompt("Repertoire d'installation", args.install_dir, ni))
    db_host = prompt("Hote PostgreSQL", "localhost", ni)
    db_port = prompt("Port PostgreSQL", "5432", ni)
    db_name = prompt("Nom de la base", "qualys2human", ni)
    db_user = prompt("Utilisateur base", "q2h", ni)
    db_pass = prompt("Mot de passe base", "changeme", ni)
    server_port = prompt("Port de l'application", "8443", ni)
    service_name = prompt("Nom du service Windows", "Qualys2Human", ni)

    # --- Install ---
    install_files(install_dir)
    configure(install_dir, db_host, db_port, db_name, db_user, db_pass, server_port)

    if pg_ok:
        init_database(install_dir)
    else:
        print("\n[INFO] Base de donnees non initialisee (PostgreSQL non detecte)")
        print("  Executez les migrations manuellement apres avoir configure PostgreSQL:")
        print(f"  cd {install_dir / 'backend'}")
        print("  .venv\\Scripts\\python -m alembic upgrade head")

    if nssm_path:
        install_service(nssm_path, install_dir, service_name)
    else:
        print("\n[INFO] Service non cree (NSSM non disponible)")
        print("  Pour demarrer manuellement:")
        print(f"  cd {install_dir / 'backend'}")
        print("  .venv\\Scripts\\python -m q2h.service")

    print("\n" + "=" * 56)
    print("  Installation terminee!")
    print(f"  Repertoire: {install_dir}")
    print(f"  Application: https://localhost:{server_port}")
    print("  Identifiants par defaut: admin / Qualys2Human!")
    print("  (Changez le mot de passe a la premiere connexion)")
    print("=" * 56)


if __name__ == "__main__":
    main()
