"""Watcher admin API — CRUD for watched paths + status."""

from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from q2h.db.engine import get_db
from q2h.db.models import WatchPath
from q2h.auth.dependencies import require_admin

router = APIRouter(prefix="/api/watcher", tags=["watcher"])


# --- Pydantic schemas ---

class WatchPathCreate(BaseModel):
    path: str
    pattern: str = "*.csv"
    recursive: bool = False
    enabled: bool = True
    ignore_before: str | None = None


class WatchPathUpdate(BaseModel):
    path: str | None = None
    pattern: str | None = None
    recursive: bool | None = None
    enabled: bool | None = None
    ignore_before: str | None = None


class WatchPathResponse(BaseModel):
    id: int
    path: str
    pattern: str
    recursive: bool
    enabled: bool
    ignore_before: str | None = None
    created_at: str
    updated_at: str


class WatcherStatusResponse(BaseModel):
    running: bool
    active_paths: int
    known_files: int


def _parse_ignore_before(value: str | None) -> datetime | None:
    """Parse an ISO-8601 string to datetime, or None."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except (ValueError, TypeError) as exc:
        raise HTTPException(400, f"Format ignore_before invalide (ISO-8601 attendu) : {exc}")


def _wp_to_response(wp: "WatchPath") -> WatchPathResponse:
    """Convert a WatchPath ORM instance to its API response."""
    return WatchPathResponse(
        id=wp.id,
        path=wp.path,
        pattern=wp.pattern,
        recursive=wp.recursive,
        enabled=wp.enabled,
        ignore_before=str(wp.ignore_before) if wp.ignore_before else None,
        created_at=str(wp.created_at),
        updated_at=str(wp.updated_at),
    )


# --- Reference to watcher service (set by main.py at startup) ---
_watcher_service = None


def set_watcher_service(svc):
    global _watcher_service
    _watcher_service = svc


# --- Endpoints ---

@router.get("/paths", response_model=list[WatchPathResponse])
async def list_paths(
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    result = await db.execute(select(WatchPath).order_by(WatchPath.id))
    rows = result.scalars().all()
    return [_wp_to_response(wp) for wp in rows]


@router.post("/paths", response_model=WatchPathResponse, status_code=201)
async def create_path(
    body: WatchPathCreate,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    # Validate path exists on filesystem
    p = Path(body.path)
    if not p.exists() or not p.is_dir():
        raise HTTPException(400, f"Le répertoire n'existe pas : {body.path}")

    # Check uniqueness
    existing = await db.execute(select(WatchPath).where(WatchPath.path == body.path))
    if existing.scalar_one_or_none():
        raise HTTPException(409, "Ce répertoire est déjà surveillé")

    wp = WatchPath(
        path=body.path,
        pattern=body.pattern,
        recursive=body.recursive,
        enabled=body.enabled,
        ignore_before=_parse_ignore_before(body.ignore_before),
    )
    db.add(wp)
    await db.commit()
    await db.refresh(wp)
    return _wp_to_response(wp)


@router.put("/paths/{path_id}", response_model=WatchPathResponse)
async def update_path(
    path_id: int,
    body: WatchPathUpdate,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    result = await db.execute(select(WatchPath).where(WatchPath.id == path_id))
    wp = result.scalar_one_or_none()
    if not wp:
        raise HTTPException(404, "Watch path not found")

    if body.path is not None:
        p = Path(body.path)
        if not p.exists() or not p.is_dir():
            raise HTTPException(400, f"Le répertoire n'existe pas : {body.path}")
        wp.path = body.path
    if body.pattern is not None:
        wp.pattern = body.pattern
    if body.recursive is not None:
        wp.recursive = body.recursive
    if body.enabled is not None:
        wp.enabled = body.enabled
    if body.ignore_before is not None:
        wp.ignore_before = _parse_ignore_before(body.ignore_before)

    await db.commit()
    await db.refresh(wp)
    return _wp_to_response(wp)


@router.delete("/paths/{path_id}", status_code=204)
async def delete_path(
    path_id: int,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    result = await db.execute(select(WatchPath).where(WatchPath.id == path_id))
    wp = result.scalar_one_or_none()
    if not wp:
        raise HTTPException(404, "Watch path not found")
    await db.delete(wp)
    await db.commit()


@router.get("/status", response_model=WatcherStatusResponse)
async def get_status(
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    count_q = select(func.count()).select_from(WatchPath).where(WatchPath.enabled.is_(True))
    active = (await db.execute(count_q)).scalar() or 0
    known = len(_watcher_service._known_files) if _watcher_service else 0
    running = _watcher_service._running if _watcher_service else False
    return WatcherStatusResponse(running=running, active_paths=active, known_files=known)
