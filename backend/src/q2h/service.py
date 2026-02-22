"""Windows service entry point — runs the Qualys2Human application via Uvicorn.

Can be called directly:
    python -m q2h.service

Or via NSSM as a Windows service:
    nssm install Qualys2Human <python_path> <this_script_path>
"""

import logging
import os
import ssl
import sys
from pathlib import Path

import uvicorn

from q2h.config import get_settings


def setup_logging():
    """Configure application logging."""
    log_dir = Path(__file__).parent.parent.parent / "logs"
    log_dir.mkdir(exist_ok=True)

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        handlers=[
            logging.FileHandler(log_dir / "q2h.log", encoding="utf-8"),
            logging.StreamHandler(sys.stdout),
        ],
    )


def build_ssl_context(cert_path: str, key_path: str) -> ssl.SSLContext | None:
    """Build SSL context if certificate files exist."""
    cert = Path(cert_path)
    key = Path(key_path)
    if cert.exists() and key.exists():
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(str(cert), str(key))
        return ctx
    return None


def main():
    setup_logging()
    logger = logging.getLogger("q2h.service")

    settings = get_settings()
    server = settings.server

    logger.info("Starting Qualys2Human v1.0.0")
    logger.info("  Host: %s", server.host)
    logger.info("  Port: %s", server.port)

    # Build uvicorn config
    uvicorn_kwargs = {
        "app": "q2h.main:app",
        "host": server.host,
        "port": server.port,
        "log_level": "info",
        "access_log": True,
    }

    # TLS
    cert_path = Path(server.tls_cert)
    key_path = Path(server.tls_key)
    if cert_path.exists() and key_path.exists():
        uvicorn_kwargs["ssl_certfile"] = str(cert_path)
        uvicorn_kwargs["ssl_keyfile"] = str(key_path)
        logger.info("  TLS: enabled (%s)", cert_path)
    else:
        logger.warning("  TLS: disabled (certificate files not found)")
        logger.warning("    Expected: %s and %s", server.tls_cert, server.tls_key)

    # Set working directory to backend root
    backend_root = Path(__file__).parent.parent.parent
    os.chdir(backend_root)

    logger.info("Starting Uvicorn server...")
    uvicorn.run(**uvicorn_kwargs)


if __name__ == "__main__":
    main()
