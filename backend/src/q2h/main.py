from fastapi import FastAPI

from q2h.api.auth import router as auth_router

app = FastAPI(title="Qualys2Human", version="1.0.0")
app.include_router(auth_router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}
