from contextlib import asynccontextmanager

from fastapi import FastAPI

from q2h.api.auth import router as auth_router
from q2h.api.dashboard import router as dashboard_router
from q2h.api.vulnerabilities import router as vuln_router
from q2h.api.hosts import router as hosts_router
from q2h.api.presets import router as presets_router
from q2h.api.trends import router as trends_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    import q2h.db.engine as db_engine
    from q2h.db.seed import seed_defaults

    db_engine.init_engine()
    async with db_engine.SessionLocal() as session:
        await seed_defaults(session)
    yield
    await db_engine.dispose_engine()


app = FastAPI(title="Qualys2Human", version="1.0.0", lifespan=lifespan)
app.include_router(auth_router)
app.include_router(dashboard_router)
app.include_router(vuln_router)
app.include_router(hosts_router)
app.include_router(presets_router)
app.include_router(trends_router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}
