from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from q2h.auth.dependencies import get_current_user
from q2h.db.engine import get_db
from q2h.db.models import LatestVuln, Host

router = APIRouter(prefix="/api/vulnerabilities", tags=["vulnerabilities"])


class VulnDetailResponse(BaseModel):
    qid: int
    title: str
    severity: int
    type: Optional[str] = None
    category: Optional[str] = None
    cvss_base: Optional[str] = None
    cvss3_base: Optional[str] = None
    threat: Optional[str] = None
    impact: Optional[str] = None
    solution: Optional[str] = None
    vendor_reference: Optional[str] = None
    cve_ids: Optional[list[str]] = None
    affected_host_count: int
    total_occurrences: int


class VulnHostItem(BaseModel):
    ip: str
    dns: Optional[str] = None
    os: Optional[str] = None
    port: Optional[int] = None
    protocol: Optional[str] = None
    vuln_status: Optional[str] = None
    first_detected: Optional[str] = None
    last_detected: Optional[str] = None


class PaginatedHosts(BaseModel):
    items: list[VulnHostItem]
    total: int
    page: int
    page_size: int


@router.get("/{qid}", response_model=VulnDetailResponse)
async def vulnerability_detail(
    qid: int,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    # Get one representative row for the QID info
    result = await db.execute(
        select(LatestVuln).where(LatestVuln.qid == qid).limit(1)
    )
    vuln = result.scalar_one_or_none()
    if not vuln:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="QID not found")

    # Count affected hosts and total occurrences
    host_count_q = select(func.count(func.distinct(LatestVuln.host_id))).where(
        LatestVuln.qid == qid
    )
    affected_host_count = (await db.execute(host_count_q)).scalar() or 0

    total_q = select(func.count(LatestVuln.id)).where(LatestVuln.qid == qid)
    total_occurrences = (await db.execute(total_q)).scalar() or 0

    return VulnDetailResponse(
        qid=vuln.qid,
        title=vuln.title,
        severity=vuln.severity,
        type=vuln.type,
        category=vuln.category,
        cvss_base=vuln.cvss_base,
        cvss3_base=vuln.cvss3_base,
        threat=vuln.threat,
        impact=vuln.impact,
        solution=vuln.solution,
        vendor_reference=vuln.vendor_reference,
        cve_ids=vuln.cve_ids,
        affected_host_count=affected_host_count,
        total_occurrences=total_occurrences,
    )


@router.get("/{qid}/hosts", response_model=PaginatedHosts)
async def vulnerability_hosts(
    qid: int,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
):
    # Total count
    total_q = select(func.count(LatestVuln.id)).where(LatestVuln.qid == qid)
    total = (await db.execute(total_q)).scalar() or 0

    # Paginated host list
    offset = (page - 1) * page_size
    rows_q = (
        select(
            Host.ip, Host.dns, Host.os,
            LatestVuln.port, LatestVuln.protocol,
            LatestVuln.vuln_status,
            LatestVuln.first_detected, LatestVuln.last_detected,
        )
        .join(LatestVuln, LatestVuln.host_id == Host.id)
        .where(LatestVuln.qid == qid)
        .order_by(Host.ip)
        .offset(offset)
        .limit(page_size)
    )
    rows = (await db.execute(rows_q)).all()

    items = [
        VulnHostItem(
            ip=r.ip,
            dns=r.dns,
            os=r.os,
            port=r.port,
            protocol=r.protocol,
            vuln_status=r.vuln_status,
            first_detected=r.first_detected.isoformat() if r.first_detected else None,
            last_detected=r.last_detected.isoformat() if r.last_detected else None,
        )
        for r in rows
    ]

    return PaginatedHosts(items=items, total=total, page=page, page_size=page_size)
