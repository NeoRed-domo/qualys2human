from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, func, text, cast, Date
from sqlalchemy.ext.asyncio import AsyncSession

from q2h.auth.dependencies import get_current_user, require_admin
from q2h.db.engine import get_db
from q2h.db.models import TrendConfig, TrendTemplate, Vulnerability, ScanReport

router = APIRouter(prefix="/api/trends", tags=["trends"])


# --- Schemas ---

class TrendConfigResponse(BaseModel):
    max_window_days: int
    query_timeout_seconds: int


class TrendConfigUpdate(BaseModel):
    max_window_days: int
    query_timeout_seconds: int


class TrendTemplateResponse(BaseModel):
    id: int
    name: str
    metric: str
    group_by: Optional[str] = None
    filters: dict


class TrendTemplateCreate(BaseModel):
    name: str
    metric: str
    group_by: Optional[str] = None
    filters: dict = {}


class TrendQueryRequest(BaseModel):
    metric: str  # total_vulns, critical_count, host_count
    group_by: Optional[str] = None  # severity, category, type
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    severities: Optional[list[int]] = None


class TrendDataPoint(BaseModel):
    date: str
    value: int
    group: Optional[str] = None


class TrendQueryResponse(BaseModel):
    series: list[TrendDataPoint]


# --- Config ---

@router.get("/config", response_model=TrendConfigResponse)
async def get_trend_config(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    result = await db.execute(select(TrendConfig).limit(1))
    cfg = result.scalar_one_or_none()
    if not cfg:
        return TrendConfigResponse(max_window_days=365, query_timeout_seconds=30)
    return TrendConfigResponse(
        max_window_days=cfg.max_window_days,
        query_timeout_seconds=cfg.query_timeout_seconds,
    )


@router.put("/config", response_model=TrendConfigResponse)
async def update_trend_config(
    body: TrendConfigUpdate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    result = await db.execute(select(TrendConfig).limit(1))
    cfg = result.scalar_one_or_none()
    if cfg:
        cfg.max_window_days = body.max_window_days
        cfg.query_timeout_seconds = body.query_timeout_seconds
    else:
        cfg = TrendConfig(
            max_window_days=body.max_window_days,
            query_timeout_seconds=body.query_timeout_seconds,
        )
        db.add(cfg)
    await db.commit()
    return TrendConfigResponse(
        max_window_days=cfg.max_window_days,
        query_timeout_seconds=cfg.query_timeout_seconds,
    )


# --- Templates ---

@router.get("/templates", response_model=list[TrendTemplateResponse])
async def list_templates(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    result = await db.execute(select(TrendTemplate))
    templates = result.scalars().all()
    return [
        TrendTemplateResponse(
            id=t.id, name=t.name, metric=t.metric,
            group_by=t.group_by, filters=t.filters or {},
        )
        for t in templates
    ]


@router.post("/templates", response_model=TrendTemplateResponse, status_code=201)
async def create_template(
    body: TrendTemplateCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    tmpl = TrendTemplate(
        name=body.name,
        metric=body.metric,
        group_by=body.group_by,
        filters=body.filters,
        created_by=int(user["sub"]),
    )
    db.add(tmpl)
    await db.commit()
    await db.refresh(tmpl)
    return TrendTemplateResponse(
        id=tmpl.id, name=tmpl.name, metric=tmpl.metric,
        group_by=tmpl.group_by, filters=tmpl.filters or {},
    )


@router.delete("/templates/{template_id}", status_code=204)
async def delete_template(
    template_id: int,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    result = await db.execute(select(TrendTemplate).where(TrendTemplate.id == template_id))
    tmpl = result.scalar_one_or_none()
    if not tmpl:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    await db.delete(tmpl)
    await db.commit()


# --- Query ---

@router.post("/query", response_model=TrendQueryResponse)
async def execute_trend_query(
    body: TrendQueryRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    # Get config for timeout
    cfg_result = await db.execute(select(TrendConfig).limit(1))
    cfg = cfg_result.scalar_one_or_none()
    timeout_sec = cfg.query_timeout_seconds if cfg else 30

    # Set statement timeout
    await db.execute(text(f"SET LOCAL statement_timeout = '{timeout_sec}s'"))

    # Build the query: group vulns by report date
    date_col = cast(ScanReport.imported_at, Date).label("date")

    if body.metric == "total_vulns":
        value_expr = func.count(Vulnerability.id)
    elif body.metric == "critical_count":
        value_expr = func.count(Vulnerability.id).filter(Vulnerability.severity >= 4)
    elif body.metric == "host_count":
        value_expr = func.count(func.distinct(Vulnerability.host_id))
    else:
        raise HTTPException(status_code=400, detail=f"Unknown metric: {body.metric}")

    # Group by column
    if body.group_by == "severity":
        group_col = cast(Vulnerability.severity, type_=func.text()).label("grp")
    elif body.group_by == "category":
        group_col = Vulnerability.category.label("grp")
    elif body.group_by == "type":
        group_col = Vulnerability.type.label("grp")
    else:
        group_col = None

    # Build query
    cols = [date_col, value_expr.label("value")]
    group_by_cols = [date_col]
    if group_col is not None:
        cols.insert(1, group_col)
        group_by_cols.append(group_col)

    q = (
        select(*cols)
        .select_from(Vulnerability)
        .join(ScanReport, Vulnerability.scan_report_id == ScanReport.id)
        .group_by(*group_by_cols)
        .order_by(date_col)
    )

    # Apply filters
    if body.date_from:
        dt_from = datetime.strptime(body.date_from, "%Y-%m-%d")
        q = q.where(ScanReport.imported_at >= dt_from)
    if body.date_to:
        dt_to = datetime.strptime(body.date_to, "%Y-%m-%d")
        q = q.where(ScanReport.imported_at <= dt_to)
    if body.severities:
        q = q.where(Vulnerability.severity.in_(body.severities))

    rows = (await db.execute(q)).all()

    series = []
    for row in rows:
        dp = TrendDataPoint(
            date=str(row.date),
            value=row.value,
            group=str(row[1]) if group_col is not None else None,
        )
        series.append(dp)

    return TrendQueryResponse(series=series)
