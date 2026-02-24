import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.responses import FileResponse

from q2h.api.auth import router as auth_router
from q2h.api.dashboard import router as dashboard_router
from q2h.api.vulnerabilities import router as vuln_router
from q2h.api.hosts import router as hosts_router
from q2h.api.presets import router as presets_router
from q2h.api.trends import router as trends_router
from q2h.api.export import router as export_router
from q2h.api.imports import router as imports_router
from q2h.api.users import router as users_router
from q2h.api.branding import router as branding_router
from q2h.api.monitoring import router as monitoring_router
from q2h.api.preferences import router as preferences_router
from q2h.api.layers import router as layers_router
from q2h.api.settings import router as settings_router
from q2h.api.watcher import router as watcher_router, set_watcher_service

logger = logging.getLogger("q2h")


async def _auto_import(filepath: Path):
    """Callback used by the file watcher to import a CSV, with dedup."""
    import q2h.db.engine as db_engine
    from q2h.ingestion.csv_parser import QualysCSVParser
    from q2h.ingestion.importer import QualysImporter
    from q2h.db.models import ScanReport
    from sqlalchemy import select, and_

    # Dedup: parse header and check for matching report
    try:
        parser = QualysCSVParser(filepath)
        meta = parser.parse_header()
    except Exception:
        logger.exception("Failed to parse header for dedup: %s", filepath.name)
        meta = None

    if meta and meta.report_date:
        async with db_engine.SessionLocal() as session:
            conditions = [ScanReport.report_date == meta.report_date]
            if meta.asset_group:
                conditions.append(ScanReport.asset_group == meta.asset_group)
            if meta.total_vulns is not None:
                conditions.append(ScanReport.total_vulns_declared == meta.total_vulns)

            existing = (
                await session.execute(select(ScanReport).where(and_(*conditions)))
            ).scalar_one_or_none()

            if existing:
                logger.warning(
                    "Skipping duplicate report: %s (matches report id=%d, date=%s, group=%s)",
                    filepath.name,
                    existing.id,
                    meta.report_date,
                    meta.asset_group,
                )
                return

    # No duplicate found — proceed with import
    async with db_engine.SessionLocal() as session:
        importer = QualysImporter(session, filepath, source="auto")
        report = await importer.run()
        logger.info("Auto-imported %s — report id=%s", filepath.name, report.id)


@asynccontextmanager
async def lifespan(app: FastAPI):
    import q2h.db.engine as db_engine
    from q2h.db.seed import seed_defaults
    from q2h.config import get_settings
    from q2h.watcher.service import FileWatcherService

    db_engine.init_engine()
    async with db_engine.SessionLocal() as session:
        await seed_defaults(session)

    # Start file watcher (always — idles if no DB paths enabled)
    settings = get_settings()
    watcher = FileWatcherService(
        db_session_factory=db_engine.SessionLocal,
        import_callback=_auto_import,
        poll_interval=settings.watcher.poll_interval,
        stable_seconds=settings.watcher.stable_seconds,
    )
    set_watcher_service(watcher)
    watcher.start()

    yield

    await watcher.stop()
    await db_engine.dispose_engine()


APP_VERSION = "1.0.1.0"

RELEASE_NOTES = {
    "version": APP_VERSION,
    "date": "2026-02-24",
    "title": "Fraîcheur, déduplication et améliorations",
    "features": [
        "Filtre fraîcheur : vulnérabilités actives, obsolètes ou toutes",
        "Page admin pour configurer les seuils de fraîcheur",
        "Watcher : filtrage par date (ignore_before) et status enrichi",
        "Popup Nouveautés après connexion sur nouvelle version",
    ],
    "fixes": [
        "Correction du crash des migrations lors de l'upgrade",
        "Catégorisation effective après reclassification",
        "Déduplication correcte des vulnérabilités par serveur",
        "Preset entreprise appliqué par défaut à la première connexion",
        "Tooltip fonctionnel sur le graphique Top 10",
        "Watcher : timezone et chemins UNC corrigés",
    ],
    "improvements": [
        "Menu de navigation toujours visible (header sticky)",
        "Nouvelles catégories : OS / Middleware-OS / Middleware-Application / Application",
        "Version affichée dans le footer",
        "Date du rapport visible dans l'historique des imports",
    ],
    "changelog_url": "https://github.com/NeoRed-domo/Qualys2Human/blob/master/CHANGELOG.md",
}

app = FastAPI(title="Qualys2Human", version=APP_VERSION, lifespan=lifespan)
app.include_router(auth_router)
app.include_router(dashboard_router)
app.include_router(vuln_router)
app.include_router(hosts_router)
app.include_router(presets_router)
app.include_router(trends_router)
app.include_router(export_router)
app.include_router(imports_router)
app.include_router(users_router)
app.include_router(branding_router)
app.include_router(monitoring_router)
app.include_router(preferences_router)
app.include_router(layers_router)
app.include_router(watcher_router)
app.include_router(settings_router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": APP_VERSION}


@app.get("/api/version")
async def get_version():
    return RELEASE_NOTES


# --- Serve frontend static files (production) ---
# Resolve frontend dir from Q2H_CONFIG (installed) or relative to source tree (dev)
_config_env = os.environ.get("Q2H_CONFIG")
if _config_env:
    _frontend_dir = Path(_config_env).parent / "app" / "frontend"
else:
    _frontend_dir = Path(__file__).parent.parent.parent.parent / "frontend" / "dist"

if _frontend_dir.is_dir():
    # Serve static assets (js, css, images) under /assets
    _assets_dir = _frontend_dir / "assets"
    if _assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=str(_assets_dir)), name="assets")

    # SPA catch-all: serve index.html for any non-API route
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Try to serve a file directly (e.g. favicon.ico, manifest.json)
        file_path = _frontend_dir / full_path
        if full_path and file_path.is_file():
            return FileResponse(str(file_path))
        # Otherwise serve index.html for client-side routing
        return FileResponse(str(_frontend_dir / "index.html"))
