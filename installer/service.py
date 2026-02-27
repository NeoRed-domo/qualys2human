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
  <env name="PYTHONPATH" value="{src_dir}" />
</service>
"""


def generate_xml(install_dir: Path, service_name: str = SERVICE_NAME,
                 logger=None) -> Path:
    """Generate the WinSW XML configuration file."""
    python_exe = install_dir / "python" / "python.exe"
    working_dir = install_dir / "app" / "backend"
    src_dir = install_dir / "app" / "backend" / "src"
    log_dir = install_dir / "logs"
    config_path = install_dir / "config.yaml"

    log_dir.mkdir(parents=True, exist_ok=True)

    xml_content = WINSW_XML_TEMPLATE.format(
        service_id=service_name,
        service_name=service_name,
        python_exe=python_exe,
        working_dir=working_dir,
        src_dir=src_dir,
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
    # WinSW exe is renamed to {service_name}.exe so it auto-discovers {service_name}.xml
    winsw = install_dir / f"{service_name}.exe"

    if not winsw.exists():
        logger.error("WinSW non trouve: %s", winsw)
        return False

    try:
        result = subprocess.run(
            [str(winsw), action],
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


def _wait_service_stopped(service_name: str, timeout: int = 30,
                          logger=None) -> bool:
    """Poll sc query until the service is fully stopped (or timeout)."""
    import time
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            result = subprocess.run(
                ["sc", "query", service_name],
                capture_output=True, text=True, timeout=10,
            )
            # sc query output contains "STATE  : X  STOPPED"
            if "STOPPED" in result.stdout:
                return True
        except Exception:
            pass
        time.sleep(2)
    if logger:
        logger.warning("Timeout (%ds) en attente de l'arret du service", timeout)
    return False


def stop_service(install_dir: Path, service_name: str = SERVICE_NAME,
                 logger=None) -> bool:
    """Stop the service and wait until it is fully stopped."""
    ok = _winsw(install_dir, "stop", service_name, logger)
    if ok:
        if _wait_service_stopped(service_name, timeout=30, logger=logger):
            if logger:
                logger.info("[OK] Service '%s' arrete", service_name)
        else:
            if logger:
                logger.warning("Le service n'est pas confirme arrete, poursuite...")
    return ok


def uninstall_service(install_dir: Path, service_name: str = SERVICE_NAME,
                      logger=None) -> bool:
    """Stop and uninstall the service."""
    _winsw(install_dir, "stop", service_name, logger)
    return _winsw(install_dir, "uninstall", service_name, logger)
