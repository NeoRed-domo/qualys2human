from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from q2h.auth.dependencies import get_current_user, require_admin
from q2h.db.engine import get_db
from q2h.db.models import EnterprisePreset, UserPreset

router = APIRouter(prefix="/api/presets", tags=["presets"])


# --- Schemas ---

class EnterprisePresetResponse(BaseModel):
    severities: list[int]
    types: list[str]
    layers: list[int]
    name: str


class EnterprisePresetUpdate(BaseModel):
    severities: list[int]
    types: list[str]
    layers: list[int] = []
    name: Optional[str] = "default"


class UserPresetResponse(BaseModel):
    id: int
    name: str
    severities: list[int]
    types: list[str]
    layers: list[int]


class UserPresetCreate(BaseModel):
    name: str
    severities: list[int]
    types: list[str]
    layers: list[int] = []


# --- Enterprise presets (admin only for PUT) ---

@router.get("/enterprise", response_model=EnterprisePresetResponse)
async def get_enterprise_preset(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    result = await db.execute(select(EnterprisePreset).limit(1))
    preset = result.scalar_one_or_none()
    if not preset:
        # Return defaults if none configured
        return EnterprisePresetResponse(
            severities=[1, 2, 3, 4, 5], types=[], layers=[], name="default"
        )
    return EnterprisePresetResponse(
        severities=preset.severities or [],
        types=preset.types or [],
        layers=preset.layers or [],
        name=preset.name,
    )


@router.put("/enterprise", response_model=EnterprisePresetResponse)
async def update_enterprise_preset(
    body: EnterprisePresetUpdate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    result = await db.execute(select(EnterprisePreset).limit(1))
    preset = result.scalar_one_or_none()
    if preset:
        preset.severities = body.severities
        preset.types = body.types
        preset.layers = body.layers
        preset.name = body.name or preset.name
    else:
        preset = EnterprisePreset(
            name=body.name or "default",
            severities=body.severities,
            types=body.types,
            layers=body.layers,
        )
        db.add(preset)
    await db.commit()
    return EnterprisePresetResponse(
        severities=preset.severities,
        types=preset.types,
        layers=preset.layers or [],
        name=preset.name,
    )


# --- User presets ---

@router.get("/user", response_model=list[UserPresetResponse])
async def list_user_presets(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    user_id = int(user["sub"])
    result = await db.execute(
        select(UserPreset).where(UserPreset.user_id == user_id)
    )
    presets = result.scalars().all()
    return [
        UserPresetResponse(
            id=p.id, name=p.name, severities=p.severities or [],
            types=p.types or [], layers=p.layers or [],
        )
        for p in presets
    ]


@router.post("/user", response_model=UserPresetResponse, status_code=201)
async def create_user_preset(
    body: UserPresetCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    user_id = int(user["sub"])
    preset = UserPreset(
        user_id=user_id,
        name=body.name,
        severities=body.severities,
        types=body.types,
        layers=body.layers,
    )
    db.add(preset)
    await db.commit()
    await db.refresh(preset)
    return UserPresetResponse(
        id=preset.id,
        name=preset.name,
        severities=preset.severities or [],
        types=preset.types or [],
        layers=preset.layers or [],
    )


@router.delete("/user/{preset_id}", status_code=204)
async def delete_user_preset(
    preset_id: int,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    user_id = int(user["sub"])
    result = await db.execute(
        select(UserPreset).where(
            UserPreset.id == preset_id, UserPreset.user_id == user_id
        )
    )
    preset = result.scalar_one_or_none()
    if not preset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Preset not found"
        )
    await db.delete(preset)
    await db.commit()
