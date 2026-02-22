from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession

from q2h.auth.dependencies import get_current_user
from q2h.db.engine import get_db
from q2h.db.models import Vulnerability, Host, ReportCoherenceCheck

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


class SeverityCount(BaseModel):
    severity: int
    count: int


class TopVuln(BaseModel):
    qid: int
    title: str
    severity: int
    count: int


class TopHost(BaseModel):
    ip: str
    dns: Optional[str] = None
    os: Optional[str] = None
    host_count: int


class CoherenceItem(BaseModel):
    check_type: str
    entity: Optional[str] = None
    expected_value: str
    actual_value: str
    severity: str


class OverviewResponse(BaseModel):
    total_vulns: int
    host_count: int
    critical_count: int
    severity_distribution: list[SeverityCount]
    top_vulns: list[TopVuln]
    top_hosts: list[TopHost]
    coherence_checks: list[CoherenceItem]


def _apply_filters(stmt, severities, date_from, date_to, report_id, types):
    """Apply common filters to a Vulnerability query."""
    if severities:
        sev_list = [int(s.strip()) for s in severities.split(",")]
        stmt = stmt.where(Vulnerability.severity.in_(sev_list))
    if date_from:
        stmt = stmt.where(Vulnerability.first_detected >= date_from)
    if date_to:
        stmt = stmt.where(Vulnerability.last_detected <= date_to)
    if report_id:
        stmt = stmt.where(Vulnerability.scan_report_id == report_id)
    if types:
        type_list = [t.strip() for t in types.split(",")]
        stmt = stmt.where(Vulnerability.type.in_(type_list))
    return stmt


@router.get("/overview", response_model=OverviewResponse)
async def dashboard_overview(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
    severities: Optional[str] = Query(None, description="Comma-separated severity levels"),
    date_from: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    report_id: Optional[int] = Query(None, description="Filter by scan report ID"),
    types: Optional[str] = Query(None, description="Comma-separated vuln types"),
):
    # --- Total vulns ---
    total_q = select(func.count(Vulnerability.id))
    total_q = _apply_filters(total_q, severities, date_from, date_to, report_id, types)
    total_vulns = (await db.execute(total_q)).scalar() or 0

    # --- Distinct host count ---
    host_q = select(func.count(func.distinct(Vulnerability.host_id)))
    host_q = _apply_filters(host_q, severities, date_from, date_to, report_id, types)
    host_count = (await db.execute(host_q)).scalar() or 0

    # --- Critical count (severity 4 + 5) ---
    crit_q = select(func.count(Vulnerability.id)).where(Vulnerability.severity >= 4)
    crit_q = _apply_filters(crit_q, severities, date_from, date_to, report_id, types)
    critical_count = (await db.execute(crit_q)).scalar() or 0

    # --- Severity distribution ---
    sev_q = (
        select(Vulnerability.severity, func.count(Vulnerability.id).label("count"))
        .group_by(Vulnerability.severity)
        .order_by(Vulnerability.severity.desc())
    )
    sev_q = _apply_filters(sev_q, severities, date_from, date_to, report_id, types)
    sev_rows = (await db.execute(sev_q)).all()
    severity_distribution = [
        SeverityCount(severity=row.severity, count=row.count) for row in sev_rows
    ]

    # --- Top 10 vulns by frequency ---
    top_v_q = (
        select(
            Vulnerability.qid,
            Vulnerability.title,
            Vulnerability.severity,
            func.count(Vulnerability.id).label("count"),
        )
        .group_by(Vulnerability.qid, Vulnerability.title, Vulnerability.severity)
        .order_by(func.count(Vulnerability.id).desc())
        .limit(10)
    )
    top_v_q = _apply_filters(top_v_q, severities, date_from, date_to, report_id, types)
    top_v_rows = (await db.execute(top_v_q)).all()
    top_vulns = [
        TopVuln(qid=r.qid, title=r.title, severity=r.severity, count=r.count)
        for r in top_v_rows
    ]

    # --- Top 10 hosts by vuln count ---
    top_h_q = (
        select(
            Host.ip,
            Host.dns,
            Host.os,
            func.count(Vulnerability.id).label("host_count"),
        )
        .join(Vulnerability, Vulnerability.host_id == Host.id)
        .group_by(Host.id, Host.ip, Host.dns, Host.os)
        .order_by(func.count(Vulnerability.id).desc())
        .limit(10)
    )
    top_h_q = _apply_filters(top_h_q, severities, date_from, date_to, report_id, types)
    top_h_rows = (await db.execute(top_h_q)).all()
    top_hosts = [
        TopHost(ip=r.ip, dns=r.dns, os=r.os, host_count=r.host_count)
        for r in top_h_rows
    ]

    # --- Coherence checks ---
    coh_q = select(ReportCoherenceCheck)
    if report_id:
        coh_q = coh_q.where(ReportCoherenceCheck.scan_report_id == report_id)
    coh_rows = (await db.execute(coh_q)).scalars().all()
    coherence_checks = [
        CoherenceItem(
            check_type=c.check_type,
            entity=c.entity,
            expected_value=c.expected_value,
            actual_value=c.actual_value,
            severity=c.severity,
        )
        for c in coh_rows
    ]

    return OverviewResponse(
        total_vulns=total_vulns,
        host_count=host_count,
        critical_count=critical_count,
        severity_distribution=severity_distribution,
        top_vulns=top_vulns,
        top_hosts=top_hosts,
        coherence_checks=coherence_checks,
    )
