from fastapi import FastAPI

app = FastAPI(title="Qualys2Human", version="1.0.0")


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}
