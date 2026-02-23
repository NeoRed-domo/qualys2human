# Qualys2Human Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a web application that ingests Qualys CSV vulnerability reports and produces interactive, drill-down dashboards for security operations teams.

**Architecture:** Modular monolith — single FastAPI backend serving a React+TypeScript frontend as static files, backed by PostgreSQL 18. Background task pool for CSV ingestion, file watcher for auto-import. Runs as a Windows service.

**Tech Stack:** Python 3.12, FastAPI, Polars, SQLAlchemy 2.0, Alembic, React 18, TypeScript, Ant Design, Recharts, AG Grid, PostgreSQL 18, ReportLab.

**Design doc:** `docs/plans/2026-02-22-qualys2human-design.md`

---

## Phase 1: Project Scaffolding & Database Foundation

> **Outcome:** Backend project structure, DB models, migrations running, health endpoint responding.

### Task 1.1: Initialize Backend Project

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/src/q2h/__init__.py`
- Create: `backend/src/q2h/main.py`
- Create: `backend/src/q2h/config.py`
- Create: `backend/config.yaml`
- Create: `.gitignore`

**Step 1: Create project directory structure**

```
qualys2human/
├── backend/
│   ├── src/
│   │   └── q2h/
│   │       ├── __init__.py
│   │       ├── main.py
│   │       └── config.py
│   ├── tests/
│   ├── pyproject.toml
│   └── config.yaml
├── frontend/
├── docs/
│   └── plans/
├── data/
│   └── branding/
└── .gitignore
```

**Step 2: Write `pyproject.toml`**

```toml
[project]
name = "qualys2human"
version = "1.0.0"
description = "Qualys vulnerability report dashboard"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.34",
    "sqlalchemy[asyncio]>=2.0",
    "asyncpg>=0.30",
    "alembic>=1.14",
    "polars>=1.0",
    "pydantic>=2.0",
    "pydantic-settings>=2.0",
    "pyyaml>=6.0",
    "python-jose[cryptography]>=3.3",
    "passlib[bcrypt]>=1.7",
    "python-multipart>=0.0.9",
    "slowapi>=0.1",
    "reportlab>=4.0",
    "watchdog>=4.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "pytest-asyncio>=0.24",
    "pytest-cov>=5.0",
    "httpx>=0.27",
    "ruff>=0.8",
]

[tool.pytest.ini_options]
testpaths = ["tests"]
asyncio_mode = "auto"

[tool.ruff]
target-version = "py312"
line-length = 100
```

**Step 3: Write `config.py`** — YAML config loader with Pydantic settings

```python
# backend/src/q2h/config.py
from pathlib import Path
from pydantic_settings import BaseSettings
from pydantic import Field
import yaml

class DatabaseConfig(BaseSettings):
    host: str = "localhost"
    port: int = 5433
    name: str = "qualys2human"
    user: str = "q2h"
    password: str = "changeme"
    encryption_key_file: str = "./keys/master.key"

class ServerConfig(BaseSettings):
    host: str = "0.0.0.0"
    port: int = 8443
    tls_cert: str = "./certs/server.crt"
    tls_key: str = "./certs/server.key"

class Settings(BaseSettings):
    server: ServerConfig = ServerConfig()
    database: DatabaseConfig = DatabaseConfig()

    @classmethod
    def from_yaml(cls, path: Path) -> "Settings":
        if path.exists():
            with open(path) as f:
                data = yaml.safe_load(f) or {}
            return cls(**data)
        return cls()

settings: Settings | None = None

def get_settings() -> Settings:
    global settings
    if settings is None:
        config_path = Path(__file__).parent.parent.parent / "config.yaml"
        settings = Settings.from_yaml(config_path)
    return settings
```

**Step 4: Write `main.py`** — minimal FastAPI app with health endpoint

```python
# backend/src/q2h/main.py
from fastapi import FastAPI

app = FastAPI(title="Qualys2Human", version="1.0.0")

@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}
```

**Step 5: Write `config.yaml`** (default dev config)

```yaml
server:
  host: 127.0.0.1
  port: 8443

database:
  host: localhost
  port: 5432
  name: qualys2human
  user: q2h
  password: changeme
  encryption_key_file: ./keys/master.key
```

**Step 6: Write `.gitignore`**

```
__pycache__/
*.pyc
.venv/
node_modules/
dist/
build/
*.egg-info/
.env
keys/
certs/
data/branding/logo-custom.*
*.db
```

**Step 7: Install dependencies and verify**

```bash
cd backend && pip install -e ".[dev]"
```

**Step 8: Run health check**

```bash
cd backend && python -m uvicorn q2h.main:app --host 127.0.0.1 --port 8443
# In another terminal: curl http://127.0.0.1:8443/api/health
# Expected: {"status":"ok","version":"1.0.0"}
```

**Step 9: Commit**

```bash
git init
git add -A
git commit -m "feat: initialize backend project with FastAPI skeleton and config"
```

---

### Task 1.2: Database Models (SQLAlchemy)

**Files:**
- Create: `backend/src/q2h/db/__init__.py`
- Create: `backend/src/q2h/db/engine.py`
- Create: `backend/src/q2h/db/models.py`
- Test: `backend/tests/test_models.py`

**Step 1: Write the failing test**

```python
# backend/tests/test_models.py
from q2h.db.models import ScanReport, Host, Vulnerability, ImportJob, ReportCoherenceCheck

def test_scan_report_model_exists():
    report = ScanReport(filename="test.csv", source="manual")
    assert report.filename == "test.csv"
    assert report.source == "manual"

def test_vulnerability_severity_range():
    vuln = Vulnerability(qid=12345, title="Test Vuln", severity=5)
    assert vuln.severity == 5

def test_import_job_default_status():
    job = ImportJob(status="pending")
    assert job.status == "pending"
```

**Step 2: Run test to verify it fails**

```bash
cd backend && python -m pytest tests/test_models.py -v
# Expected: FAIL — ModuleNotFoundError: No module named 'q2h.db'
```

**Step 3: Write `db/engine.py`** — async engine setup

```python
# backend/src/q2h/db/engine.py
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from q2h.config import get_settings

def get_database_url() -> str:
    s = get_settings().database
    return f"postgresql+asyncpg://{s.user}:{s.password}@{s.host}:{s.port}/{s.name}"

engine = None
SessionLocal = None

def init_engine():
    global engine, SessionLocal
    engine = create_async_engine(get_database_url(), pool_size=20, max_overflow=10)
    SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def get_db():
    if SessionLocal is None:
        init_engine()
    async with SessionLocal() as session:
        yield session
```

**Step 4: Write `db/models.py`** — all core models

```python
# backend/src/q2h/db/models.py
from datetime import datetime
from sqlalchemy import (
    String, Integer, Float, Boolean, Text, DateTime, ForeignKey, Index, ARRAY
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.sql import func

class Base(DeclarativeBase):
    pass

class ScanReport(Base):
    __tablename__ = "scan_reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    filename: Mapped[str] = mapped_column(String(500))
    imported_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    report_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    asset_group: Mapped[str | None] = mapped_column(String(255), nullable=True)
    total_vulns_declared: Mapped[int | None] = mapped_column(Integer, nullable=True)
    avg_risk_declared: Mapped[float | None] = mapped_column(Float, nullable=True)
    source: Mapped[str] = mapped_column(String(20))  # "auto" or "manual"

    vulnerabilities: Mapped[list["Vulnerability"]] = relationship(back_populates="scan_report")
    import_jobs: Mapped[list["ImportJob"]] = relationship(back_populates="scan_report")
    coherence_checks: Mapped[list["ReportCoherenceCheck"]] = relationship(back_populates="scan_report")

class Host(Base):
    __tablename__ = "hosts"

    id: Mapped[int] = mapped_column(primary_key=True)
    ip: Mapped[str] = mapped_column(String(45), unique=True, index=True)
    dns: Mapped[str | None] = mapped_column(String(255), nullable=True)
    netbios: Mapped[str | None] = mapped_column(String(255), nullable=True)
    os: Mapped[str | None] = mapped_column(String(500), nullable=True)
    os_cpe: Mapped[str | None] = mapped_column(String(500), nullable=True)
    first_seen: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    last_seen: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    vulnerabilities: Mapped[list["Vulnerability"]] = relationship(back_populates="host")

class Vulnerability(Base):
    __tablename__ = "vulnerabilities"

    id: Mapped[int] = mapped_column(primary_key=True)
    scan_report_id: Mapped[int] = mapped_column(ForeignKey("scan_reports.id"), index=True)
    host_id: Mapped[int] = mapped_column(ForeignKey("hosts.id"), index=True)
    qid: Mapped[int] = mapped_column(Integer, index=True)
    title: Mapped[str] = mapped_column(String(1000))
    vuln_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    severity: Mapped[int] = mapped_column(Integer, index=True)
    port: Mapped[int | None] = mapped_column(Integer, nullable=True)
    protocol: Mapped[str | None] = mapped_column(String(20), nullable=True)
    fqdn: Mapped[str | None] = mapped_column(String(500), nullable=True)
    ssl: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    first_detected: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_detected: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    times_detected: Mapped[int | None] = mapped_column(Integer, nullable=True)
    date_last_fixed: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    cve_ids: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    vendor_reference: Mapped[str | None] = mapped_column(String(500), nullable=True)
    bugtraq_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cvss_base: Mapped[str | None] = mapped_column(String(100), nullable=True)
    cvss_temporal: Mapped[str | None] = mapped_column(String(100), nullable=True)
    cvss3_base: Mapped[str | None] = mapped_column(String(100), nullable=True)
    cvss3_temporal: Mapped[str | None] = mapped_column(String(100), nullable=True)
    threat: Mapped[str | None] = mapped_column(Text, nullable=True)
    impact: Mapped[str | None] = mapped_column(Text, nullable=True)
    solution: Mapped[str | None] = mapped_column(Text, nullable=True)
    results: Mapped[str | None] = mapped_column(Text, nullable=True)
    pci_vuln: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    ticket_state: Mapped[str | None] = mapped_column(String(50), nullable=True)
    tracking_method: Mapped[str | None] = mapped_column(String(50), nullable=True)
    category: Mapped[str | None] = mapped_column(String(255), nullable=True)

    scan_report: Mapped["ScanReport"] = relationship(back_populates="vulnerabilities")
    host: Mapped["Host"] = relationship(back_populates="vulnerabilities")

    __table_args__ = (
        Index("ix_vuln_report_severity", "scan_report_id", "severity"),
        Index("ix_vuln_status", "vuln_status"),
    )

class ImportJob(Base):
    __tablename__ = "import_jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    scan_report_id: Mapped[int] = mapped_column(ForeignKey("scan_reports.id"))
    status: Mapped[str] = mapped_column(String(20))  # pending/processing/done/error
    progress: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    rows_processed: Mapped[int] = mapped_column(Integer, default=0)
    rows_total: Mapped[int] = mapped_column(Integer, default=0)

    scan_report: Mapped["ScanReport"] = relationship(back_populates="import_jobs")

class ReportCoherenceCheck(Base):
    __tablename__ = "report_coherence_checks"

    id: Mapped[int] = mapped_column(primary_key=True)
    scan_report_id: Mapped[int] = mapped_column(ForeignKey("scan_reports.id"), index=True)
    check_type: Mapped[str] = mapped_column(String(50))
    entity: Mapped[str | None] = mapped_column(String(255), nullable=True)
    expected_value: Mapped[str] = mapped_column(String(255))
    actual_value: Mapped[str] = mapped_column(String(255))
    severity: Mapped[str] = mapped_column(String(20))  # warning/error
    detected_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    scan_report: Mapped["ScanReport"] = relationship(back_populates="coherence_checks")
```

**Step 5: Create `db/__init__.py`**

```python
# backend/src/q2h/db/__init__.py
from q2h.db.models import Base, ScanReport, Host, Vulnerability, ImportJob, ReportCoherenceCheck
from q2h.db.engine import get_db, init_engine

__all__ = [
    "Base", "ScanReport", "Host", "Vulnerability", "ImportJob",
    "ReportCoherenceCheck", "get_db", "init_engine",
]
```

**Step 6: Run tests**

```bash
cd backend && python -m pytest tests/test_models.py -v
# Expected: PASS (3 tests)
```

**Step 7: Commit**

```bash
git add backend/src/q2h/db/ backend/tests/test_models.py
git commit -m "feat: add SQLAlchemy database models for all core tables"
```

---

### Task 1.3: Alembic Migrations Setup

**Files:**
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py`
- Create: `backend/alembic/versions/` (auto-generated)

**Step 1: Initialize Alembic**

```bash
cd backend && python -m alembic init alembic
```

**Step 2: Edit `alembic/env.py`** to use our models and async engine

Key changes: import `Base` from `q2h.db.models`, set `target_metadata = Base.metadata`, configure async engine from `q2h.config`.

**Step 3: Edit `alembic.ini`** — set `sqlalchemy.url` placeholder (overridden by env.py)

**Step 4: Generate initial migration**

```bash
cd backend && python -m alembic revision --autogenerate -m "initial schema"
```

**Step 5: Apply migration (requires running PostgreSQL)**

```bash
cd backend && python -m alembic upgrade head
```

**Step 6: Verify tables exist**

```bash
psql -U q2h -d qualys2human -c "\dt"
# Expected: scan_reports, hosts, vulnerabilities, import_jobs, report_coherence_checks
```

**Step 7: Commit**

```bash
git add backend/alembic/ backend/alembic.ini
git commit -m "feat: add Alembic migrations with initial schema"
```

---

## Phase 2: CSV Parsing & Ingestion Engine

> **Outcome:** Can parse the Qualys CSV sample, extract header metadata + detail rows, insert into DB, run coherence checks.

### Task 2.1: Qualys CSV Parser (Header Metadata)

**Files:**
- Create: `backend/src/q2h/ingestion/__init__.py`
- Create: `backend/src/q2h/ingestion/csv_parser.py`
- Test: `backend/tests/test_csv_parser.py`
- Data: `exemple-qualys-raw.csv` (already exists at project root)

**Step 1: Write the failing test**

```python
# backend/tests/test_csv_parser.py
from pathlib import Path
from q2h.ingestion.csv_parser import QualysCSVParser

SAMPLE_CSV = Path(__file__).parent.parent.parent / "exemple-qualys-raw.csv"

def test_parse_header_metadata():
    parser = QualysCSVParser(SAMPLE_CSV)
    metadata = parser.parse_header()
    assert metadata.report_name is not None
    assert metadata.report_date is not None
    assert metadata.asset_group == "AG_Windows"
    assert metadata.active_hosts == 4
    assert metadata.total_vulns == 11

def test_parse_host_summary():
    parser = QualysCSVParser(SAMPLE_CSV)
    _ = parser.parse_header()
    hosts = parser.parse_host_summary()
    assert len(hosts) == 4
    assert hosts[0].ip == "1.1.1.1"
    assert hosts[0].total_vulns == 2
```

**Step 2: Run test to verify it fails**

```bash
cd backend && python -m pytest tests/test_csv_parser.py -v
# Expected: FAIL — ModuleNotFoundError
```

**Step 3: Implement `csv_parser.py`**

The Qualys CSV has a complex multi-section format:
- Lines 1-3: Report metadata (name, date, company)
- Lines 5-6: Asset group summary
- Lines 8-9: Total vulns summary
- Lines 11-15: Per-IP summary
- Line 18+: Detail vulnerability rows (standard CSV with headers on line 18)

The parser must:
1. Read line-by-line to extract header sections (metadata, asset summary, host summary)
2. Detect where the detail section starts (row starting with `"IP","DNS","NetBIOS"...`)
3. Use Polars to parse the detail section as standard CSV

```python
# backend/src/q2h/ingestion/csv_parser.py
import csv
import re
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
import polars as pl

@dataclass
class ReportMetadata:
    report_name: str | None = None
    report_date: datetime | None = None
    company_name: str | None = None
    asset_group: str | None = None
    active_hosts: int | None = None
    total_vulns: int | None = None
    avg_risk: float | None = None

@dataclass
class HostSummary:
    ip: str
    total_vulns: int
    security_risk: float

class QualysCSVParser:
    def __init__(self, filepath: Path):
        self.filepath = filepath
        self._raw_lines: list[str] = []
        self._detail_start_line: int = -1
        self._metadata: ReportMetadata | None = None
        self._host_summaries: list[HostSummary] = []
        self._load_lines()

    def _load_lines(self):
        encodings = ["utf-8", "latin-1", "cp1252"]
        for enc in encodings:
            try:
                with open(self.filepath, encoding=enc) as f:
                    self._raw_lines = f.readlines()
                return
            except UnicodeDecodeError:
                continue
        raise ValueError(f"Cannot decode {self.filepath}")

    def _parse_csv_line(self, line: str) -> list[str]:
        reader = csv.reader([line.strip()])
        for row in reader:
            return row
        return []

    def parse_header(self) -> ReportMetadata:
        meta = ReportMetadata()
        i = 0
        lines = self._raw_lines

        # Line 1: report name, date
        if i < len(lines):
            row = self._parse_csv_line(lines[i])
            if len(row) >= 2:
                meta.report_name = row[0]
                date_match = re.search(r"(\d{2}/\d{2}/\d{4})", row[1])
                if date_match:
                    meta.report_date = datetime.strptime(date_match.group(1), "%m/%d/%Y")
            i += 1

        # Line 2: company
        if i < len(lines):
            row = self._parse_csv_line(lines[i])
            if row:
                meta.company_name = row[0]
            i += 1

        # Scan forward for asset group section
        for j in range(i, len(lines)):
            row = self._parse_csv_line(lines[j])
            if row and row[0] == "Asset Groups":
                # Next line has the values
                if j + 1 < len(lines):
                    val_row = self._parse_csv_line(lines[j + 1])
                    if len(val_row) >= 4:
                        meta.asset_group = val_row[0]
                        meta.active_hosts = int(val_row[3]) if val_row[3] else None
                break

        # Scan for total vulns section
        for j in range(i, len(lines)):
            row = self._parse_csv_line(lines[j])
            if row and row[0] == "Total Vulnerabilities":
                if j + 1 < len(lines):
                    val_row = self._parse_csv_line(lines[j + 1])
                    if len(val_row) >= 2:
                        meta.total_vulns = int(val_row[0]) if val_row[0] else None
                        meta.avg_risk = float(val_row[1]) if val_row[1] else None
                break

        self._metadata = meta
        return meta

    def parse_host_summary(self) -> list[HostSummary]:
        hosts = []
        # Find the per-IP summary section: header row is "IP","Total Vulnerabilities","Security Risk"
        for j, line in enumerate(self._raw_lines):
            row = self._parse_csv_line(line)
            if row and len(row) >= 3 and row[0] == "IP" and row[1] == "Total Vulnerabilities":
                # Read subsequent rows until empty line
                for k in range(j + 1, len(self._raw_lines)):
                    val_row = self._parse_csv_line(self._raw_lines[k])
                    if not val_row or not val_row[0]:
                        break
                    hosts.append(HostSummary(
                        ip=val_row[0],
                        total_vulns=int(val_row[1]) if val_row[1] else 0,
                        security_risk=float(val_row[2]) if val_row[2] else 0.0,
                    ))
                break
        self._host_summaries = hosts
        return hosts

    def find_detail_section_start(self) -> int:
        """Find the line number where the detail vuln rows begin (header row with full columns)."""
        for j, line in enumerate(self._raw_lines):
            row = self._parse_csv_line(line)
            if row and len(row) > 10 and row[0] == "IP" and row[1] == "DNS" and row[2] == "NetBIOS":
                self._detail_start_line = j
                return j
        raise ValueError("Cannot find detail vulnerability section in CSV")

    def parse_detail_rows(self) -> pl.LazyFrame:
        """Parse the detail vulnerability rows using Polars for performance."""
        if self._detail_start_line < 0:
            self.find_detail_section_start()
        return pl.scan_csv(
            self.filepath,
            skip_rows=self._detail_start_line,
            has_header=True,
            infer_schema_length=0,  # Read all as strings initially
            encoding="utf8-lossy",
        )
```

**Step 4: Run tests**

```bash
cd backend && python -m pytest tests/test_csv_parser.py -v
# Expected: PASS
```

**Step 5: Commit**

```bash
git add backend/src/q2h/ingestion/ backend/tests/test_csv_parser.py
git commit -m "feat: add Qualys CSV parser for header metadata and host summary"
```

---

### Task 2.2: CSV Detail Row Parsing & DB Insertion

**Files:**
- Create: `backend/src/q2h/ingestion/importer.py`
- Test: `backend/tests/test_importer.py`

**Step 1: Write the failing test**

```python
# backend/tests/test_importer.py
from pathlib import Path
from q2h.ingestion.csv_parser import QualysCSVParser

SAMPLE_CSV = Path(__file__).parent.parent.parent / "exemple-qualys-raw.csv"

def test_parse_detail_rows():
    parser = QualysCSVParser(SAMPLE_CSV)
    parser.find_detail_section_start()
    df = parser.parse_detail_rows().collect()
    assert len(df) > 0
    assert "IP" in df.columns
    assert "QID" in df.columns
    assert "Severity" in df.columns

def test_detail_row_count_matches_sample():
    parser = QualysCSVParser(SAMPLE_CSV)
    parser.find_detail_section_start()
    df = parser.parse_detail_rows().collect()
    # Sample CSV has 13 detail vulnerability rows (lines 19-165 contain entries for 4 IPs)
    assert len(df) >= 10  # At least 10 vuln rows in sample
```

**Step 2: Run test to verify it fails or passes (validates Polars parsing)**

```bash
cd backend && python -m pytest tests/test_importer.py -v
```

**Step 3: Write `importer.py`** — orchestrates full CSV ingestion into DB

```python
# backend/src/q2h/ingestion/importer.py
from datetime import datetime
from pathlib import Path
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import polars as pl

from q2h.db.models import ScanReport, Host, Vulnerability, ImportJob, ReportCoherenceCheck
from q2h.ingestion.csv_parser import QualysCSVParser

class QualysImporter:
    def __init__(self, session: AsyncSession, filepath: Path, source: str = "manual"):
        self.session = session
        self.filepath = filepath
        self.source = source
        self.parser = QualysCSVParser(filepath)
        self.report: ScanReport | None = None
        self.job: ImportJob | None = None

    async def run(self) -> ScanReport:
        # 1. Parse header
        metadata = self.parser.parse_header()
        host_summaries = self.parser.parse_host_summary()

        # 2. Create scan report record
        self.report = ScanReport(
            filename=self.filepath.name,
            report_date=metadata.report_date,
            asset_group=metadata.asset_group,
            total_vulns_declared=metadata.total_vulns,
            avg_risk_declared=metadata.avg_risk,
            source=self.source,
        )
        self.session.add(self.report)
        await self.session.flush()

        # 3. Create import job
        self.job = ImportJob(
            scan_report_id=self.report.id,
            status="processing",
            started_at=datetime.utcnow(),
        )
        self.session.add(self.job)
        await self.session.flush()

        # 4. Parse detail rows
        self.parser.find_detail_section_start()
        df = self.parser.parse_detail_rows().collect()
        self.job.rows_total = len(df)

        # 5. Upsert hosts and insert vulnerabilities
        host_cache: dict[str, Host] = {}
        rows_processed = 0

        for row in df.iter_rows(named=True):
            ip = row.get("IP", "")
            if not ip:
                continue

            # Upsert host
            if ip not in host_cache:
                result = await self.session.execute(select(Host).where(Host.ip == ip))
                host = result.scalar_one_or_none()
                if host is None:
                    host = Host(
                        ip=ip,
                        dns=row.get("DNS"),
                        netbios=row.get("NetBIOS"),
                        os=row.get("OS"),
                        os_cpe=row.get("OS CPE"),
                    )
                    self.session.add(host)
                    await self.session.flush()
                else:
                    host.last_seen = datetime.utcnow()
                    host.dns = row.get("DNS") or host.dns
                    host.os = row.get("OS") or host.os
                host_cache[ip] = host

            host = host_cache[ip]

            # Parse fields
            severity = int(row.get("Severity", "0") or "0")
            qid = int(row.get("QID", "0") or "0")
            port_str = row.get("Port", "")
            port = int(port_str) if port_str and port_str.isdigit() else None
            ssl_str = row.get("SSL", "")
            ssl_val = True if ssl_str and "ssl" in ssl_str.lower() else None
            pci_str = row.get("PCI Vuln", "")
            pci_val = pci_str.lower() == "yes" if pci_str else None

            cve_raw = row.get("CVE ID", "")
            cve_list = [c.strip() for c in cve_raw.split(",") if c.strip()] if cve_raw else None

            def parse_dt(val: str | None) -> datetime | None:
                if not val:
                    return None
                for fmt in ["%m/%d/%Y %H:%M:%S", "%m/%d/%Y"]:
                    try:
                        return datetime.strptime(val.strip(), fmt)
                    except ValueError:
                        continue
                return None

            vuln = Vulnerability(
                scan_report_id=self.report.id,
                host_id=host.id,
                qid=qid,
                title=row.get("Title", ""),
                vuln_status=row.get("Vuln Status"),
                type=row.get("Type"),
                severity=severity,
                port=port,
                protocol=row.get("Protocol"),
                fqdn=row.get("FQDN"),
                ssl=ssl_val,
                first_detected=parse_dt(row.get("First Detected")),
                last_detected=parse_dt(row.get("Last Detected")),
                times_detected=int(row["Times Detected"]) if row.get("Times Detected") else None,
                date_last_fixed=parse_dt(row.get("Date Last Fixed")),
                cve_ids=cve_list,
                vendor_reference=row.get("Vendor Reference"),
                bugtraq_id=row.get("Bugtraq ID"),
                cvss_base=row.get("CVSS Base"),
                cvss_temporal=row.get("CVSS Temporal"),
                cvss3_base=row.get("CVSS3.1 Base"),
                cvss3_temporal=row.get("CVSS3.1 Temporal"),
                threat=row.get("Threat"),
                impact=row.get("Impact"),
                solution=row.get("Solution"),
                results=row.get("Results"),
                pci_vuln=pci_val,
                ticket_state=row.get("Ticket State"),
                tracking_method=row.get("Tracking Method"),
                category=row.get("Category"),
            )
            self.session.add(vuln)
            rows_processed += 1

            if rows_processed % 5000 == 0:
                self.job.rows_processed = rows_processed
                self.job.progress = int((rows_processed / self.job.rows_total) * 100)
                await self.session.flush()

        # 6. Run coherence checks
        await self._run_coherence_checks(host_summaries, host_cache, df)

        # 7. Finalize
        self.job.rows_processed = rows_processed
        self.job.progress = 100
        self.job.status = "done"
        self.job.ended_at = datetime.utcnow()
        await self.session.commit()

        return self.report

    async def _run_coherence_checks(self, host_summaries, host_cache, df):
        metadata = self.parser._metadata
        actual_vuln_count = len(df)
        actual_host_count = df["IP"].n_unique()

        # Check total vulns
        if metadata.total_vulns is not None and metadata.total_vulns != actual_vuln_count:
            self.session.add(ReportCoherenceCheck(
                scan_report_id=self.report.id,
                check_type="total_vulns_mismatch",
                expected_value=str(metadata.total_vulns),
                actual_value=str(actual_vuln_count),
                severity="warning" if abs(metadata.total_vulns - actual_vuln_count) <= 2 else "error",
            ))

        # Check host count
        if metadata.active_hosts is not None and metadata.active_hosts != actual_host_count:
            self.session.add(ReportCoherenceCheck(
                scan_report_id=self.report.id,
                check_type="host_count_mismatch",
                expected_value=str(metadata.active_hosts),
                actual_value=str(actual_host_count),
                severity="warning",
            ))

        # Check per-host vulns
        for hs in host_summaries:
            actual_for_host = len(df.filter(pl.col("IP") == hs.ip))
            if actual_for_host != hs.total_vulns:
                self.session.add(ReportCoherenceCheck(
                    scan_report_id=self.report.id,
                    check_type="host_risk_mismatch",
                    entity=hs.ip,
                    expected_value=str(hs.total_vulns),
                    actual_value=str(actual_for_host),
                    severity="warning",
                ))

        # Check missing hosts
        summary_ips = {hs.ip for hs in host_summaries}
        detail_ips = set(df["IP"].unique().to_list())
        for missing in summary_ips - detail_ips:
            self.session.add(ReportCoherenceCheck(
                scan_report_id=self.report.id,
                check_type="missing_host",
                entity=missing,
                expected_value="present_in_summary",
                actual_value="absent_from_detail",
                severity="error",
            ))
        for extra in detail_ips - summary_ips:
            self.session.add(ReportCoherenceCheck(
                scan_report_id=self.report.id,
                check_type="missing_host",
                entity=extra,
                expected_value="absent_from_summary",
                actual_value="present_in_detail",
                severity="warning",
            ))
```

**Step 4: Run tests**

```bash
cd backend && python -m pytest tests/test_importer.py -v
# Expected: PASS
```

**Step 5: Commit**

```bash
git add backend/src/q2h/ingestion/importer.py backend/tests/test_importer.py
git commit -m "feat: add CSV detail parser and full ingestion pipeline with coherence checks"
```

---

## Phase 3: Authentication & User Management

> **Outcome:** Login page works (local auth), JWT tokens issued, profile-based access control.

### Task 3.1: Auth Models & User Tables

**Files:**
- Modify: `backend/src/q2h/db/models.py` — add Profile, User, AuditLog models
- Create: Alembic migration

**Step 1: Add models to `models.py`**

```python
# Add to backend/src/q2h/db/models.py

class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    type: Mapped[str] = mapped_column(String(20))  # builtin/custom
    permissions: Mapped[dict] = mapped_column(JSONB, default=dict)
    ad_group_dn: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    users: Mapped[list["User"]] = relationship(back_populates="profile")

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    auth_type: Mapped[str] = mapped_column(String(20))  # local/ad
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id"))
    ad_domain: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False)
    last_login: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    preferences: Mapped[dict] = mapped_column(JSONB, default=dict)

    profile: Mapped["Profile"] = relationship(back_populates="users")

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(100))
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
```

**Step 2: Generate and apply migration**

```bash
cd backend && python -m alembic revision --autogenerate -m "add auth models"
cd backend && python -m alembic upgrade head
```

**Step 3: Commit**

```bash
git add backend/src/q2h/db/models.py backend/alembic/versions/
git commit -m "feat: add Profile, User, AuditLog models and migration"
```

---

### Task 3.2: Auth Service (Local + JWT)

**Files:**
- Create: `backend/src/q2h/auth/__init__.py`
- Create: `backend/src/q2h/auth/service.py`
- Create: `backend/src/q2h/auth/dependencies.py`
- Test: `backend/tests/test_auth.py`

**Step 1: Write failing tests**

```python
# backend/tests/test_auth.py
import pytest
from q2h.auth.service import AuthService

def test_hash_and_verify_password():
    svc = AuthService()
    hashed = svc.hash_password("MyStr0ng!Pass")
    assert svc.verify_password("MyStr0ng!Pass", hashed)
    assert not svc.verify_password("wrong", hashed)

def test_create_and_decode_token():
    svc = AuthService()
    token = svc.create_access_token(user_id=1, username="admin", profile="admin")
    payload = svc.decode_token(token)
    assert payload["sub"] == "1"
    assert payload["username"] == "admin"
    assert payload["profile"] == "admin"
```

**Step 2: Implement `auth/service.py`**

```python
# backend/src/q2h/auth/service.py
from datetime import datetime, timedelta, timezone
from passlib.context import CryptContext
from jose import jwt, JWTError

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
SECRET_KEY = "dev-secret-change-in-prod"  # Loaded from config in production
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_HOURS = 8

class AuthService:
    def hash_password(self, password: str) -> str:
        return pwd_context.hash(password)

    def verify_password(self, plain: str, hashed: str) -> bool:
        return pwd_context.verify(plain, hashed)

    def create_access_token(self, user_id: int, username: str, profile: str) -> str:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        return jwt.encode(
            {"sub": str(user_id), "username": username, "profile": profile, "exp": expire},
            SECRET_KEY, algorithm=ALGORITHM,
        )

    def create_refresh_token(self, user_id: int) -> str:
        expire = datetime.now(timezone.utc) + timedelta(hours=REFRESH_TOKEN_EXPIRE_HOURS)
        return jwt.encode(
            {"sub": str(user_id), "type": "refresh", "exp": expire},
            SECRET_KEY, algorithm=ALGORITHM,
        )

    def decode_token(self, token: str) -> dict:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
```

**Step 3: Implement `auth/dependencies.py`** — FastAPI dependency for current user

```python
# backend/src/q2h/auth/dependencies.py
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from q2h.auth.service import AuthService

security = HTTPBearer()
auth_service = AuthService()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    try:
        payload = auth_service.decode_token(credentials.credentials)
        return payload
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("profile") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin required")
    return user
```

**Step 4: Run tests**

```bash
cd backend && python -m pytest tests/test_auth.py -v
# Expected: PASS
```

**Step 5: Commit**

```bash
git add backend/src/q2h/auth/ backend/tests/test_auth.py
git commit -m "feat: add auth service with password hashing and JWT tokens"
```

---

### Task 3.3: Auth API Endpoints

**Files:**
- Create: `backend/src/q2h/api/__init__.py`
- Create: `backend/src/q2h/api/auth.py`
- Test: `backend/tests/test_api_auth.py`

**Step 1: Write failing test**

```python
# backend/tests/test_api_auth.py
import pytest
from httpx import AsyncClient, ASGITransport
from q2h.main import app

@pytest.mark.asyncio
async def test_login_returns_token():
    # This will test against a seeded DB — for now just test the endpoint exists
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/auth/login", json={
            "username": "admin",
            "password": "wrong",
            "domain": "local",
        })
        # Should return 401 (user doesn't exist yet) not 404
        assert response.status_code in (401, 422)
```

**Step 2: Implement `api/auth.py`**

```python
# backend/src/q2h/api/auth.py
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from q2h.db.engine import get_db
from q2h.db.models import User, Profile, AuditLog
from q2h.auth.service import AuthService

router = APIRouter(prefix="/api/auth", tags=["auth"])
auth_service = AuthService()

class LoginRequest(BaseModel):
    username: str
    password: str
    domain: str = "local"

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    profile: str
    must_change_password: bool

@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    if req.domain == "local":
        result = await db.execute(
            select(User).join(Profile).where(
                User.username == req.username,
                User.auth_type == "local",
                User.is_active == True,
            )
        )
        user = result.scalar_one_or_none()
        if not user or not auth_service.verify_password(req.password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    else:
        # AD auth will be implemented in a later phase
        raise HTTPException(status_code=501, detail="AD authentication not yet configured")

    profile_result = await db.execute(select(Profile).where(Profile.id == user.profile_id))
    profile = profile_result.scalar_one()

    user.last_login = datetime.now(timezone.utc)
    db.add(AuditLog(user_id=user.id, action="login", detail=f"domain={req.domain}"))
    await db.commit()

    return TokenResponse(
        access_token=auth_service.create_access_token(user.id, user.username, profile.name),
        refresh_token=auth_service.create_refresh_token(user.id),
        profile=profile.name,
        must_change_password=user.must_change_password,
    )
```

**Step 3: Register router in `main.py`**

```python
# Add to backend/src/q2h/main.py
from q2h.api.auth import router as auth_router
app.include_router(auth_router)
```

**Step 4: Run tests**

```bash
cd backend && python -m pytest tests/test_api_auth.py -v
# Expected: PASS
```

**Step 5: Commit**

```bash
git add backend/src/q2h/api/ backend/tests/test_api_auth.py backend/src/q2h/main.py
git commit -m "feat: add login API endpoint with local auth"
```

---

### Task 3.4: First-Boot Seeding (Default Admin + Profiles)

**Files:**
- Create: `backend/src/q2h/db/seed.py`
- Test: `backend/tests/test_seed.py`

**Step 1: Implement `seed.py`** — creates default profiles and admin user on first boot

```python
# backend/src/q2h/db/seed.py
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from q2h.db.models import Profile, User
from q2h.auth.service import AuthService

BUILTIN_PROFILES = [
    {"name": "admin", "type": "builtin", "permissions": {"all": True}, "is_default": False},
    {"name": "user", "type": "builtin", "permissions": {"dashboard": True, "export": True}, "is_default": True},
    {"name": "monitoring", "type": "builtin", "permissions": {"monitoring": True, "dashboard": True}, "is_default": False},
]

async def seed_defaults(session: AsyncSession):
    auth = AuthService()

    # Create profiles if not exist
    for p in BUILTIN_PROFILES:
        result = await session.execute(select(Profile).where(Profile.name == p["name"]))
        if result.scalar_one_or_none() is None:
            session.add(Profile(**p))
    await session.flush()

    # Create default admin if no admin exists
    result = await session.execute(
        select(User).join(Profile).where(Profile.name == "admin")
    )
    if result.scalar_one_or_none() is None:
        admin_profile = await session.execute(select(Profile).where(Profile.name == "admin"))
        profile = admin_profile.scalar_one()
        session.add(User(
            username="admin",
            password_hash=auth.hash_password("Qualys2Human!"),
            auth_type="local",
            profile_id=profile.id,
            must_change_password=True,
        ))
    await session.commit()
```

**Step 2: Call seed on app startup in `main.py`**

```python
# Add to main.py startup event
@app.on_event("startup")
async def startup():
    from q2h.db.engine import init_engine, SessionLocal
    init_engine()
    async with SessionLocal() as session:
        await seed_defaults(session)
```

**Step 3: Commit**

```bash
git add backend/src/q2h/db/seed.py backend/src/q2h/main.py
git commit -m "feat: add first-boot seeding with default profiles and admin user"
```

---

## Phase 4: Dashboard API Endpoints

> **Outcome:** REST API returning all dashboard data (overview KPIs, top 10s, drill-down).

### Task 4.1: Overview Endpoint (KPIs + Top 10s)

**Files:**
- Create: `backend/src/q2h/api/dashboard.py`
- Test: `backend/tests/test_api_dashboard.py`

This endpoint returns: total vulns, host count, critical count, severity distribution, top 10 vulns, top 10 hosts, coherence status. All filtered by severity preset + date range + report ID.

Accepts query params: `severities` (comma-sep), `date_from`, `date_to`, `report_id`, `types` (comma-sep).

**Step 1: Write failing test, Step 2: Implement endpoint, Step 3: Run tests, Step 4: Commit**

Pattern: same TDD cycle as above. API returns JSON matching the dashboard layout.

---

### Task 4.2: Vulnerability Detail Endpoint (Level 1)

**Files:**
- Create: `backend/src/q2h/api/vulnerabilities.py`

Endpoints:
- `GET /api/vulnerabilities/{qid}` — vuln detail + affected hosts
- `GET /api/vulnerabilities/{qid}/hosts` — paginated host list for this QID

---

### Task 4.3: Host Detail Endpoint (Level 1)

**Files:**
- Create: `backend/src/q2h/api/hosts.py`

Endpoints:
- `GET /api/hosts/{ip}` — host info + all vulns
- `GET /api/hosts/{ip}/vulnerabilities` — paginated vuln list for this host

---

### Task 4.4: Full Detail Endpoint (Level 2)

Endpoint:
- `GET /api/hosts/{ip}/vulnerabilities/{qid}` — single vuln on single host, all fields

---

### Task 4.5: Filter Presets API

**Files:**
- Create: `backend/src/q2h/api/presets.py`

Endpoints:
- `GET /api/presets/enterprise` — current enterprise rules
- `PUT /api/presets/enterprise` — update (admin only)
- `GET /api/presets/user` — current user's saved presets
- `POST /api/presets/user` — save a user preset
- `DELETE /api/presets/user/{id}` — delete a user preset

---

## Phase 5: Frontend - React App Scaffold & Login

> **Outcome:** React app running, login page functional, authenticated routing.

### Task 5.1: Initialize React + TypeScript Project

**Files:**
- Create: `frontend/package.json`, `frontend/tsconfig.json`, `frontend/vite.config.ts`
- Create: `frontend/src/main.tsx`, `frontend/src/App.tsx`
- Create: `frontend/src/api/client.ts` — Axios instance with JWT interceptor

**Step 1: Scaffold with Vite**

```bash
cd frontend && npm create vite@latest . -- --template react-ts
npm install antd @ant-design/icons recharts ag-grid-react ag-grid-community axios react-router-dom
```

**Step 2: Configure Vite proxy to backend** (`vite.config.ts`)

**Step 3: Commit**

---

### Task 5.2: Login Page

**Files:**
- Create: `frontend/src/pages/Login.tsx`

Must include CyberArk-compatible IDs: `q2h-login-username`, `q2h-login-password`, `q2h-login-domain`, `q2h-login-submit`.

Uses Ant Design Form component. On success, stores JWT in httpOnly cookie (set by backend) or localStorage for dev.

---

### Task 5.3: App Layout & Routing

**Files:**
- Create: `frontend/src/layouts/MainLayout.tsx` — header with logo + nav tabs + user menu
- Create: `frontend/src/router.tsx` — routes for Overview, Trends, Admin, Monitoring, Profile
- Create: `frontend/src/contexts/AuthContext.tsx` — auth state management

Navigation: `[Overview] [Tendances] [Admin*] [Monitoring*] [Mon Profil]`

---

## Phase 6: Frontend - Overview Dashboard

> **Outcome:** Full overview page with KPI cards, charts, top 10 tables, all interactive.

### Task 6.1: KPI Cards Component

**Files:**
- Create: `frontend/src/components/dashboard/KPICards.tsx`

Displays: Total vulns, Affected hosts, Critical vulns (sev 4-5), Quick-wins count, Coherence indicator.

---

### Task 6.2: Charts (Severity Donut + Category Bar)

**Files:**
- Create: `frontend/src/components/dashboard/SeverityDonut.tsx`
- Create: `frontend/src/components/dashboard/CategoryBar.tsx`

Uses Recharts. Clickable segments drill down.

---

### Task 6.3: Top 10 Tables (Vulns + Hosts)

**Files:**
- Create: `frontend/src/components/dashboard/TopVulnsTable.tsx`
- Create: `frontend/src/components/dashboard/TopHostsTable.tsx`

Uses AG Grid. Row click navigates to Level 1 detail.

---

### Task 6.4: Filter Bar Component

**Files:**
- Create: `frontend/src/components/filters/FilterBar.tsx`
- Create: `frontend/src/components/filters/PresetSelector.tsx`
- Create: `frontend/src/contexts/FilterContext.tsx`

Persistent at top. Severity checkboxes, type filter, date range, report selector, preset dropdown.

---

### Task 6.5: Overview Page Assembly

**Files:**
- Create: `frontend/src/pages/Overview.tsx`

Composes all components, fetches data from API, respects filters.

---

## Phase 7: Frontend - Drill-Down Views (Level 1 & 2)

> **Outcome:** Click through from overview to vuln detail, host detail, and full detail.

### Task 7.1: Vulnerability Detail Page (Level 1)

**Files:**
- Create: `frontend/src/pages/VulnDetail.tsx`

Shows: QID info, CVSS scores, affected servers table, tracking method pie chart, detection timeline.

---

### Task 7.2: Host Detail Page (Level 1)

**Files:**
- Create: `frontend/src/pages/HostDetail.tsx`

Shows: Host info card, all vulns table (sortable), severity donut for this host, tracking methods.

---

### Task 7.3: Full Detail Page (Level 2)

**Files:**
- Create: `frontend/src/pages/FullDetail.tsx`

Shows: All raw Qualys fields, full Threat/Impact/Solution text, CVE list, scan Results, export button.

---

## Phase 8: Trends Section

> **Outcome:** Dedicated trends page with admin templates and custom trend builder.

### Task 8.1: Trends API Endpoints

**Files:**
- Create: `backend/src/q2h/api/trends.py`

Endpoints:
- `GET /api/trends/templates` — admin-defined trend templates
- `POST /api/trends/query` — execute a trend query (with timeout + window bounds)
- `GET /api/trends/config` — admin config (max window, timeout)
- `PUT /api/trends/config` — update (admin only)

Queries backed by materialized views, with `statement_timeout` enforced.

---

### Task 8.2: Trends Frontend Page

**Files:**
- Create: `frontend/src/pages/Trends.tsx`
- Create: `frontend/src/components/trends/TrendChart.tsx`
- Create: `frontend/src/components/trends/TrendBuilder.tsx`

Line charts over time. Custom builder: metric selector, grouping, filters, time window (bounded).

---

## Phase 9: Export (PDF + CSV)

> **Outcome:** Every view has PDF and CSV export buttons that work.

### Task 9.1: CSV Export Endpoint

**Files:**
- Create: `backend/src/q2h/api/export.py`

`GET /api/export/csv?view=overview&...filters` — streams CSV with current filters applied.

---

### Task 9.2: PDF Export Endpoint

Uses ReportLab. `GET /api/export/pdf?view=overview&...filters` — generates A4 landscape PDF.

Includes: logo (default or custom), date, filters applied, tables, charts rendered as images.

---

### Task 9.3: Frontend Export Buttons

Add export buttons (top-right) to every page: Overview, VulnDetail, HostDetail, FullDetail, Trends.

---

## Phase 10: File Watcher & Auto-Import

> **Outcome:** Background service watches configured folders and auto-imports new CSVs.

### Task 10.1: File Watcher Service

**Files:**
- Create: `backend/src/q2h/watcher/__init__.py`
- Create: `backend/src/q2h/watcher/service.py`

Uses `watchdog` library. Monitors paths from config (local + UNC). On new `.csv` file detected, triggers import via `QualysImporter` with `source="auto"`.

---

### Task 10.2: Import Status API + Frontend

**Files:**
- Create: `backend/src/q2h/api/imports.py`
- Create: `frontend/src/pages/admin/ImportManager.tsx`

Admin can: see import history, trigger manual import (file upload), monitor progress in real-time.

---

## Phase 11: Admin Panel

> **Outcome:** Full admin section: user management, enterprise rules, branding, config.

### Task 11.1: User Management API + Page

Endpoints: CRUD for users, profile assignment, AD group mapping.
Page: `frontend/src/pages/admin/UserManagement.tsx`

---

### Task 11.2: Enterprise Rules Config

Admin sets default severity filters, displayed presets.
Page: `frontend/src/pages/admin/EnterpriseRules.tsx`

---

### Task 11.3: Branding (Logo Upload + Template)

**Files:**
- Create: `backend/src/q2h/api/branding.py`
- Create: `frontend/src/pages/admin/Branding.tsx`
- Create: `data/branding/logo-default.svg`
- Create: `data/branding/logo-template.svg`

Endpoints:
- `GET /api/branding/logo` — returns current logo (default or custom)
- `POST /api/branding/logo` — upload custom logo (admin only)
- `DELETE /api/branding/logo` — restore default
- `GET /api/branding/template` — download SVG template

---

## Phase 12: Monitoring Dashboard

> **Outcome:** Health page for admins showing app + system status with proactive alerts.

### Task 12.1: Monitoring API

**Files:**
- Create: `backend/src/q2h/api/monitoring.py`

Returns: service statuses, DB connection pool, disk usage, CPU/RAM, uptime, connected users, last import, alerts based on configured thresholds.

---

### Task 12.2: Monitoring Frontend Page

**Files:**
- Create: `frontend/src/pages/Monitoring.tsx`

Cards: App health (green/orange/red per service), System metrics, Activity summary, Proactive alerts list.

---

## Phase 13: Dashboard Personalization

> **Outcome:** Users can drag & drop widgets, show/hide, save layout.

### Task 13.1: Draggable Widget System

**Files:**
- Modify: `frontend/src/pages/Overview.tsx`
- Create: `frontend/src/components/dashboard/WidgetGrid.tsx`

Uses `react-grid-layout` for drag & drop. Layout saved to user preferences via API.

---

### Task 13.2: User Preferences API

**Files:**
- Create: `backend/src/q2h/api/preferences.py`

Endpoints:
- `GET /api/user/preferences` — get current user layout + settings
- `PUT /api/user/preferences` — save layout
- `DELETE /api/user/preferences/layout` — reset to default

---

## Phase 14: Packaging & Installer

> **Outcome:** Single zip file that installs everything on a fresh Windows Server 2019+.

### Task 14.1: Build Scripts

**Files:**
- Create: `scripts/build.py` — builds frontend (npm run build), collects backend + deps
- Create: `scripts/package.py` — creates the offline zip with Python embedded + PostgreSQL portable

---

### Task 14.2: Installer

**Files:**
- Create: `installer/install.bat` — entry point
- Create: `installer/setup.py` — interactive installer (checks prereqs, creates services, initializes DB)
- Create: `installer/config-template.yaml`
- Create: `installer/README-INSTALL.txt`

---

### Task 14.3: Windows Service Integration

**Files:**
- Create: `backend/src/q2h/service.py` — NSSM wrapper for running as Windows service

---

## Phase 15: Documentation

### Task 15.1: README.md + MinimumRequirement.md

**Files:**
- Create: `README.md`
- Create: `MinimumRequirement.md`

---

### Task 15.2: In-App Help System

**Files:**
- Create: `frontend/src/components/help/HelpPanel.tsx`
- Create: `frontend/src/components/help/HelpTooltip.tsx`

Contextual `?` buttons on each section. Sliding help panel with relevant docs.

---

## Execution Order Summary

| Phase | Description | Dependencies |
|-------|-------------|--------------|
| 1 | Project scaffold + DB models | None |
| 2 | CSV parsing + ingestion | Phase 1 |
| 3 | Auth + user management | Phase 1 |
| 4 | Dashboard API | Phase 2, 3 |
| 5 | Frontend scaffold + login | Phase 3 |
| 6 | Overview dashboard | Phase 4, 5 |
| 7 | Drill-down views | Phase 6 |
| 8 | Trends section | Phase 4, 6 |
| 9 | Export PDF/CSV | Phase 6 |
| 10 | File watcher | Phase 2 |
| 11 | Admin panel | Phase 3, 5 |
| 12 | Monitoring | Phase 5 |
| 13 | Dashboard personalization | Phase 6 |
| 14 | Packaging + installer | All phases |
| 15 | Documentation | All phases |

**Parallelizable pairs:** Phase 2 + 3 (both depend on 1 only). Phase 8 + 9 + 10 (all depend on earlier phases but not each other). Phase 11 + 12 + 13 (independent frontend features).
