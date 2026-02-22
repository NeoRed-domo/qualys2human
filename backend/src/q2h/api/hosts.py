from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from q2h.auth.dependencies import get_current_user
from q2h.db.engine import get_db
from q2h.db.models import Vulnerability, Host

router = APIRouter(prefix="/api/hosts", tags=["hosts"])


class HostDetailResponse(BaseModel):
    ip: str
    dns: Optional[str] = None
    netbios: Optional[str] = None
    os: Optional[str] = None
    os_cpe: Optional[str] = None
    first_seen: Optional[str] = None
    last_seen: Optional[str] = None
    vuln_count: int


class HostVulnItem(BaseModel):
    qid: int
    title: str
    severity: int
    type: Optional[str] = None
    category: Optional[str] = None
    vuln_status: Optional[str] = None
    port: Optional[int] = None
    protocol: Optional[str] = None
    first_detected: Optional[str] = None
    last_detected: Optional[str] = None
    tracking_method: Optional[str] = None


class PaginatedVulns(BaseModel):
    items: list[HostVulnItem]
    total: int
    page: int
    page_size: int


@router.get("/{ip}", response_model=HostDetailResponse)
async def host_detail(
    ip: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    result = await db.execute(select(Host).where(Host.ip == ip))
    host = result.scalar_one_or_none()
    if not host:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Host not found")

    vuln_count_q = select(func.count(Vulnerability.id)).where(
        Vulnerability.host_id == host.id
    )
    vuln_count = (await db.execute(vuln_count_q)).scalar() or 0

    return HostDetailResponse(
        ip=host.ip,
        dns=host.dns,
        netbios=host.netbios,
        os=host.os,
        os_cpe=host.os_cpe,
        first_seen=host.first_seen.isoformat() if host.first_seen else None,
        last_seen=host.last_seen.isoformat() if host.last_seen else None,
        vuln_count=vuln_count,
    )


@router.get("/{ip}/vulnerabilities", response_model=PaginatedVulns)
async def host_vulnerabilities(
    ip: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
):
    result = await db.execute(select(Host).where(Host.ip == ip))
    host = result.scalar_one_or_none()
    if not host:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Host not found")

    # Total count
    total_q = select(func.count(Vulnerability.id)).where(
        Vulnerability.host_id == host.id
    )
    total = (await db.execute(total_q)).scalar() or 0

    # Paginated vuln list
    offset = (page - 1) * page_size
    rows_q = (
        select(Vulnerability)
        .where(Vulnerability.host_id == host.id)
        .order_by(Vulnerability.severity.desc(), Vulnerability.qid)
        .offset(offset)
        .limit(page_size)
    )
    rows = (await db.execute(rows_q)).scalars().all()

    items = [
        HostVulnItem(
            qid=v.qid,
            title=v.title,
            severity=v.severity,
            type=v.type,
            category=v.category,
            vuln_status=v.vuln_status,
            port=v.port,
            protocol=v.protocol,
            first_detected=v.first_detected.isoformat() if v.first_detected else None,
            last_detected=v.last_detected.isoformat() if v.last_detected else None,
            tracking_method=v.tracking_method,
        )
        for v in rows
    ]

    return PaginatedVulns(items=items, total=total, page=page, page_size=page_size)
