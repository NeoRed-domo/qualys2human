"""App settings API — freshness thresholds."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from q2h.db.engine import get_db
from q2h.db.models import AppSettings
from q2h.auth.dependencies import get_current_user, require_admin

router = APIRouter(prefix="/api/settings", tags=["settings"])


class FreshnessSettings(BaseModel):
    stale_days: int
    hide_days: int


@router.get("/freshness", response_model=FreshnessSettings)
async def get_freshness(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    stale = await db.execute(
        select(AppSettings.value).where(AppSettings.key == "freshness_stale_days")
    )
    hide = await db.execute(
        select(AppSettings.value).where(AppSettings.key == "freshness_hide_days")
    )
    return FreshnessSettings(
        stale_days=int(stale.scalar() or "7"),
        hide_days=int(hide.scalar() or "30"),
    )


@router.put("/freshness", response_model=FreshnessSettings)
async def update_freshness(
    body: FreshnessSettings,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    for key, val in [("freshness_stale_days", body.stale_days), ("freshness_hide_days", body.hide_days)]:
        existing = (await db.execute(select(AppSettings).where(AppSettings.key == key))).scalar_one_or_none()
        if existing:
            existing.value = str(val)
        else:
            db.add(AppSettings(key=key, value=str(val)))
    await db.commit()
    return body
