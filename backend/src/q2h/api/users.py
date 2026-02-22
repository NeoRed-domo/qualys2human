"""User management API — CRUD for users and profiles (admin only)."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from q2h.auth.dependencies import require_admin, get_current_user
from q2h.auth.service import AuthService
from q2h.db.engine import get_db
from q2h.db.models import User, Profile

router = APIRouter(prefix="/api/users", tags=["users"])
auth_service = AuthService()


# --- Schemas ---

class UserResponse(BaseModel):
    id: int
    username: str
    auth_type: str
    profile_name: str
    profile_id: int
    ad_domain: str | None
    is_active: bool
    must_change_password: bool
    last_login: str | None


class UserListResponse(BaseModel):
    items: list[UserResponse]
    total: int


class UserCreate(BaseModel):
    username: str
    password: str
    auth_type: str = "local"
    profile_id: int
    ad_domain: Optional[str] = None


class UserUpdate(BaseModel):
    password: Optional[str] = None
    profile_id: Optional[int] = None
    is_active: Optional[bool] = None
    must_change_password: Optional[bool] = None
    ad_domain: Optional[str] = None


class ProfileResponse(BaseModel):
    id: int
    name: str
    type: str
    permissions: dict
    is_default: bool


# --- Profiles ---

@router.get("/profiles", response_model=list[ProfileResponse])
async def list_profiles(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """List all available profiles."""
    result = await db.execute(select(Profile).order_by(Profile.name))
    profiles = result.scalars().all()
    return [
        ProfileResponse(
            id=p.id, name=p.name, type=p.type,
            permissions=p.permissions, is_default=p.is_default,
        )
        for p in profiles
    ]


# --- Users CRUD ---

@router.get("", response_model=UserListResponse)
async def list_users(
    page: int = 1,
    page_size: int = 20,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    """List all users with pagination."""
    offset = (page - 1) * page_size

    base = select(User).join(Profile)
    count_base = select(func.count()).select_from(User)

    if search:
        base = base.where(User.username.ilike(f"%{search}%"))
        count_base = count_base.where(User.username.ilike(f"%{search}%"))

    total = (await db.execute(count_base)).scalar()

    q = base.order_by(User.username).offset(offset).limit(page_size)
    result = await db.execute(q)
    users = result.scalars().all()

    items = []
    for u in users:
        # Need profile name — do a quick load
        profile_result = await db.execute(select(Profile).where(Profile.id == u.profile_id))
        profile = profile_result.scalar_one()
        items.append(UserResponse(
            id=u.id,
            username=u.username,
            auth_type=u.auth_type,
            profile_name=profile.name,
            profile_id=u.profile_id,
            ad_domain=u.ad_domain,
            is_active=u.is_active,
            must_change_password=u.must_change_password,
            last_login=str(u.last_login) if u.last_login else None,
        ))

    return UserListResponse(items=items, total=total)


@router.post("", response_model=UserResponse, status_code=201)
async def create_user(
    body: UserCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    """Create a new user."""
    # Check username uniqueness
    existing = await db.execute(select(User).where(User.username == body.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, "Username already exists")

    # Validate profile
    profile_result = await db.execute(select(Profile).where(Profile.id == body.profile_id))
    profile = profile_result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid profile_id")

    new_user = User(
        username=body.username,
        password_hash=auth_service.hash_password(body.password),
        auth_type=body.auth_type,
        profile_id=body.profile_id,
        ad_domain=body.ad_domain,
        must_change_password=True,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    return UserResponse(
        id=new_user.id,
        username=new_user.username,
        auth_type=new_user.auth_type,
        profile_name=profile.name,
        profile_id=new_user.profile_id,
        ad_domain=new_user.ad_domain,
        is_active=new_user.is_active,
        must_change_password=new_user.must_change_password,
        last_login=None,
    )


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    body: UserUpdate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    """Update an existing user."""
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    if body.password is not None:
        target.password_hash = auth_service.hash_password(body.password)
    if body.profile_id is not None:
        # Validate profile
        profile_check = await db.execute(select(Profile).where(Profile.id == body.profile_id))
        if not profile_check.scalar_one_or_none():
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid profile_id")
        target.profile_id = body.profile_id
    if body.is_active is not None:
        target.is_active = body.is_active
    if body.must_change_password is not None:
        target.must_change_password = body.must_change_password
    if body.ad_domain is not None:
        target.ad_domain = body.ad_domain

    await db.commit()
    await db.refresh(target)

    profile_result = await db.execute(select(Profile).where(Profile.id == target.profile_id))
    profile = profile_result.scalar_one()

    return UserResponse(
        id=target.id,
        username=target.username,
        auth_type=target.auth_type,
        profile_name=profile.name,
        profile_id=target.profile_id,
        ad_domain=target.ad_domain,
        is_active=target.is_active,
        must_change_password=target.must_change_password,
        last_login=str(target.last_login) if target.last_login else None,
    )


@router.delete("/{user_id}", status_code=204)
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    """Delete a user (cannot delete yourself)."""
    current_user_id = int(user["sub"])
    if user_id == current_user_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot delete yourself")

    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    await db.delete(target)
    await db.commit()
