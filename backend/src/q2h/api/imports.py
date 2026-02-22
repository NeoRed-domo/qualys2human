"""Import management API — history, manual upload, progress."""

import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from q2h.db.engine import get_db
from q2h.db.models import ImportJob, ScanReport
from q2h.auth.dependencies import get_current_user

router = APIRouter(prefix="/api/imports", tags=["imports"])


class ImportJobResponse(BaseModel):
    id: int
    scan_report_id: int
    filename: str
    source: str
    status: str
    progress: int
    rows_processed: int
    rows_total: int
    started_at: str | None
    ended_at: str | None
    error_message: str | None


class ImportListResponse(BaseModel):
    items: list[ImportJobResponse]
    total: int


class ImportUploadResponse(BaseModel):
    job_id: int
    report_id: int
    status: str
    rows_processed: int


@router.get("", response_model=ImportListResponse)
async def list_imports(
    page: int = 1,
    page_size: int = 20,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """List import history with pagination, most recent first."""
    offset = (page - 1) * page_size

    count_q = select(func.count()).select_from(ImportJob)
    total = (await db.execute(count_q)).scalar()

    q = (
        select(ImportJob, ScanReport.filename, ScanReport.source)
        .join(ScanReport, ImportJob.scan_report_id == ScanReport.id)
        .order_by(desc(ImportJob.id))
        .offset(offset)
        .limit(page_size)
    )
    rows = (await db.execute(q)).all()

    items = []
    for job, filename, source in rows:
        items.append(ImportJobResponse(
            id=job.id,
            scan_report_id=job.scan_report_id,
            filename=filename,
            source=source,
            status=job.status,
            progress=job.progress,
            rows_processed=job.rows_processed,
            rows_total=job.rows_total,
            started_at=str(job.started_at) if job.started_at else None,
            ended_at=str(job.ended_at) if job.ended_at else None,
            error_message=job.error_message,
        ))

    return ImportListResponse(items=items, total=total)


@router.get("/{job_id}", response_model=ImportJobResponse)
async def get_import(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Get status of a single import job."""
    q = (
        select(ImportJob, ScanReport.filename, ScanReport.source)
        .join(ScanReport, ImportJob.scan_report_id == ScanReport.id)
        .where(ImportJob.id == job_id)
    )
    row = (await db.execute(q)).first()
    if not row:
        raise HTTPException(404, "Import job not found")

    job, filename, source = row
    return ImportJobResponse(
        id=job.id,
        scan_report_id=job.scan_report_id,
        filename=filename,
        source=source,
        status=job.status,
        progress=job.progress,
        rows_processed=job.rows_processed,
        rows_total=job.rows_total,
        started_at=str(job.started_at) if job.started_at else None,
        ended_at=str(job.ended_at) if job.ended_at else None,
        error_message=job.error_message,
    )


@router.post("/upload", response_model=ImportUploadResponse)
async def upload_csv(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Upload a Qualys CSV and trigger import."""
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(400, "Only .csv files are accepted")

    # Save uploaded file to a temp location
    content = await file.read()
    if len(content) == 0:
        raise HTTPException(400, "Empty file")

    tmp_dir = Path(tempfile.gettempdir()) / "q2h_uploads"
    tmp_dir.mkdir(exist_ok=True)
    tmp_path = tmp_dir / file.filename
    tmp_path.write_bytes(content)

    try:
        from q2h.ingestion.importer import QualysImporter

        importer = QualysImporter(db, tmp_path, source="manual")
        report = await importer.run()

        return ImportUploadResponse(
            job_id=importer.job.id,
            report_id=report.id,
            status=importer.job.status,
            rows_processed=importer.job.rows_processed,
        )
    except Exception as e:
        raise HTTPException(500, f"Import failed: {str(e)}")
    finally:
        # Clean up temp file
        try:
            tmp_path.unlink(missing_ok=True)
        except OSError:
            pass
