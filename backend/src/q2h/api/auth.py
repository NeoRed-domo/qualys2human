from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from q2h.auth.service import AuthService
from q2h.db.engine import get_db
from q2h.db.models import User, Profile, AuditLog

router = APIRouter(prefix="/api/auth", tags=["auth"])
auth_service = AuthService()


class LoginRequest(BaseModel):
    username: str
    password: str
    domain: str = "local"


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    profile: str
    must_change_password: bool


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    if req.domain == "local":
        result = await db.execute(
            select(User).join(Profile).where(
                User.username == req.username,
                User.auth_type == "local",
                User.is_active == True,  # noqa: E712
            )
        )
        user = result.scalar_one_or_none()
        if not user or not auth_service.verify_password(req.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials"
            )
    else:
        raise HTTPException(status_code=501, detail="AD authentication not yet configured")

    profile_result = await db.execute(select(Profile).where(Profile.id == user.profile_id))
    profile = profile_result.scalar_one()

    user.last_login = datetime.utcnow()
    db.add(AuditLog(user_id=user.id, action="login", detail=f"domain={req.domain}"))
    await db.commit()

    return TokenResponse(
        access_token=auth_service.create_access_token(user.id, user.username, profile.name),
        refresh_token=auth_service.create_refresh_token(user.id),
        profile=profile.name,
        must_change_password=user.must_change_password,
    )
