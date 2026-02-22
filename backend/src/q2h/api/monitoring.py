"""Monitoring API — system health, metrics, and proactive alerts."""

import os
import platform
import time
from datetime import datetime

import psutil
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from q2h.auth.dependencies import get_current_user
from q2h.db.engine import get_db
import q2h.db.engine as db_engine
from q2h.db.models import ImportJob, ScanReport, User

router = APIRouter(prefix="/api/monitoring", tags=["monitoring"])

_start_time = time.time()


# --- Schemas ---

class ServiceStatus(BaseModel):
    name: str
    status: str  # ok / warning / error
    detail: str | None = None


class SystemMetrics(BaseModel):
    cpu_percent: float
    memory_percent: float
    memory_used_mb: int
    memory_total_mb: int
    disk_percent: float
    disk_used_gb: float
    disk_total_gb: float


class DbPoolInfo(BaseModel):
    pool_size: int
    checked_out: int
    overflow: int
    checked_in: int


class ActivitySummary(BaseModel):
    total_reports: int
    total_users: int
    last_import_filename: str | None
    last_import_date: str | None
    last_import_status: str | None


class AlertItem(BaseModel):
    level: str  # warning / error
    message: str


class MonitoringResponse(BaseModel):
    uptime_seconds: int
    platform: str
    python_version: str
    services: list[ServiceStatus]
    system: SystemMetrics
    db_pool: DbPoolInfo | None
    activity: ActivitySummary
    alerts: list[AlertItem]


# --- Thresholds ---

CPU_WARN = 80
CPU_ERROR = 95
MEM_WARN = 80
MEM_ERROR = 95
DISK_WARN = 80
DISK_ERROR = 95


@router.get("", response_model=MonitoringResponse)
async def get_monitoring(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    uptime = int(time.time() - _start_time)
    alerts: list[AlertItem] = []

    # --- System metrics ---
    cpu = psutil.cpu_percent(interval=0.1)
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage(os.path.abspath(os.sep))

    system = SystemMetrics(
        cpu_percent=cpu,
        memory_percent=mem.percent,
        memory_used_mb=int(mem.used / 1024 / 1024),
        memory_total_mb=int(mem.total / 1024 / 1024),
        disk_percent=disk.percent,
        disk_used_gb=round(disk.used / 1024 / 1024 / 1024, 1),
        disk_total_gb=round(disk.total / 1024 / 1024 / 1024, 1),
    )

    # CPU alerts
    if cpu >= CPU_ERROR:
        alerts.append(AlertItem(level="error", message=f"CPU critique : {cpu}%"))
    elif cpu >= CPU_WARN:
        alerts.append(AlertItem(level="warning", message=f"CPU élevé : {cpu}%"))

    # Memory alerts
    if mem.percent >= MEM_ERROR:
        alerts.append(AlertItem(level="error", message=f"Mémoire critique : {mem.percent}%"))
    elif mem.percent >= MEM_WARN:
        alerts.append(AlertItem(level="warning", message=f"Mémoire élevée : {mem.percent}%"))

    # Disk alerts
    if disk.percent >= DISK_ERROR:
        alerts.append(AlertItem(level="error", message=f"Disque critique : {disk.percent}%"))
    elif disk.percent >= DISK_WARN:
        alerts.append(AlertItem(level="warning", message=f"Disque élevé : {disk.percent}%"))

    # --- Service statuses ---
    services: list[ServiceStatus] = []

    # Database connectivity
    try:
        await db.execute(text("SELECT 1"))
        services.append(ServiceStatus(name="PostgreSQL", status="ok"))
    except Exception as e:
        services.append(ServiceStatus(name="PostgreSQL", status="error", detail=str(e)))
        alerts.append(AlertItem(level="error", message="Base de données inaccessible"))

    # App service
    services.append(ServiceStatus(name="API FastAPI", status="ok", detail=f"Uptime {uptime}s"))

    # --- DB pool info ---
    db_pool = None
    if db_engine.engine is not None:
        pool = db_engine.engine.pool
        db_pool = DbPoolInfo(
            pool_size=pool.size(),
            checked_out=pool.checkedout(),
            overflow=pool.overflow(),
            checked_in=pool.checkedin(),
        )

    # --- Activity summary ---
    total_reports = (await db.execute(select(func.count()).select_from(ScanReport))).scalar() or 0
    total_users = (await db.execute(select(func.count()).select_from(User))).scalar() or 0

    last_import_q = (
        select(ImportJob, ScanReport.filename)
        .join(ScanReport, ImportJob.scan_report_id == ScanReport.id)
        .order_by(ImportJob.id.desc())
        .limit(1)
    )
    last_row = (await db.execute(last_import_q)).first()

    activity = ActivitySummary(
        total_reports=total_reports,
        total_users=total_users,
        last_import_filename=last_row[1] if last_row else None,
        last_import_date=str(last_row[0].ended_at) if last_row and last_row[0].ended_at else None,
        last_import_status=last_row[0].status if last_row else None,
    )

    # Check for failed imports
    failed_q = select(func.count()).select_from(ImportJob).where(ImportJob.status == "error")
    failed_count = (await db.execute(failed_q)).scalar() or 0
    if failed_count > 0:
        alerts.append(AlertItem(
            level="warning",
            message=f"{failed_count} import(s) en erreur",
        ))

    return MonitoringResponse(
        uptime_seconds=uptime,
        platform=f"{platform.system()} {platform.release()}",
        python_version=platform.python_version(),
        services=services,
        system=system,
        db_pool=db_pool,
        activity=activity,
        alerts=alerts,
    )
