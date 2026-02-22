import pytest
from httpx import AsyncClient, ASGITransport
from q2h.main import app


@pytest.mark.asyncio
async def test_login_endpoint_exists():
    """Login endpoint should return 401 or 422, not 404."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/auth/login", json={
            "username": "admin",
            "password": "wrong",
            "domain": "local",
        })
        assert response.status_code in (401, 422)


@pytest.mark.asyncio
async def test_health_still_works():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"
