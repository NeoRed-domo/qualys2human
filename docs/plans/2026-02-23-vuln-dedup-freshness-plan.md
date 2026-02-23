# Vulnerability Dedup & Freshness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deduplicate vulnerability display by creating a materialized view `latest_vulns` showing only the most recent state per (host, QID), with 3 configurable freshness visual states (active / peut-etre obsolete / hidden).

**Architecture:** Keep all imported rows in `vulnerabilities` (full history for trends). Add a PostgreSQL materialized view `latest_vulns` with `DISTINCT ON (host_id, qid)` ordered by report_date DESC. Dashboard/detail/export APIs query `latest_vulns` instead of `vulnerabilities`. Trends API stays on `vulnerabilities`. Admin-configurable freshness thresholds stored in `app_settings` table. Frontend adds freshness filter + visual greying. Also add `ignore_before` date field to `WatchPath` model.

**Tech Stack:** PostgreSQL materialized view, SQLAlchemy 2.0 (text SQL for view), Alembic migration, FastAPI, React/Ant Design.

**Design doc:** `docs/plans/2026-02-23-vuln-dedup-freshness-design.md`

---

### Task 1: Add `AppSettings` model + `ignore_before` on WatchPath

**Files:**
- Modify: `backend/src/q2h/db/models.py`

**Step 1: Add AppSettings model and WatchPath.ignore_before**

In `models.py`, add after the `WatchPath` class:

```python
class AppSettings(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
```

Add to `WatchPath` class, after the `enabled` field:

```python
    ignore_before: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
```

**Step 2: Commit**

```bash
git add backend/src/q2h/db/models.py
git commit -m "feat: add AppSettings model + WatchPath.ignore_before"
```

---

### Task 2: Alembic migration — app_settings table + latest_vulns materialized view + WatchPath.ignore_before

**Files:**
- Create: `backend/alembic/versions/f7b4c5d63a29_add_app_settings_and_latest_vulns.py`

**Step 1: Write the migration**

Chain: `e6f3a4d52b18` -> `f7b4c5d63a29`

```python
"""add app_settings table, latest_vulns materialized view, watch_paths.ignore_before

Revision ID: f7b4c5d63a29
Revises: e6f3a4d52b18
Create Date: 2026-02-23 20:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'f7b4c5d63a29'
down_revision: Union[str, None] = 'e6f3a4d52b18'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. app_settings table
    op.create_table(
        'app_settings',
        sa.Column('key', sa.String(100), primary_key=True),
        sa.Column('value', sa.Text(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )
    # Seed default freshness thresholds
    op.execute(
        "INSERT INTO app_settings (key, value) VALUES "
        "('freshness_stale_days', '7'), "
        "('freshness_hide_days', '30')"
    )

    # 2. Materialized view latest_vulns
    op.execute("""
        CREATE MATERIALIZED VIEW latest_vulns AS
        SELECT DISTINCT ON (v.host_id, v.qid)
            v.id, v.scan_report_id, v.host_id, v.qid, v.title,
            v.vuln_status, v.type, v.severity, v.port, v.protocol,
            v.fqdn, v.ssl, v.first_detected, v.last_detected,
            v.times_detected, v.date_last_fixed, v.cve_ids,
            v.vendor_reference, v.bugtraq_id,
            v.cvss_base, v.cvss_temporal, v.cvss3_base, v.cvss3_temporal,
            v.threat, v.impact, v.solution, v.results,
            v.pci_vuln, v.ticket_state, v.tracking_method,
            v.category, v.layer_id
        FROM vulnerabilities v
        JOIN scan_reports sr ON sr.id = v.scan_report_id
        ORDER BY v.host_id, v.qid, sr.report_date DESC NULLS LAST, v.id DESC
    """)
    op.execute("CREATE UNIQUE INDEX ix_latest_vulns_host_qid ON latest_vulns (host_id, qid)")
    op.execute("CREATE INDEX ix_latest_vulns_severity ON latest_vulns (severity)")
    op.execute("CREATE INDEX ix_latest_vulns_qid ON latest_vulns (qid)")
    op.execute("CREATE INDEX ix_latest_vulns_layer_id ON latest_vulns (layer_id)")
    op.execute("CREATE INDEX ix_latest_vulns_last_detected ON latest_vulns (last_detected)")

    # 3. WatchPath.ignore_before
    op.add_column('watch_paths', sa.Column('ignore_before', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('watch_paths', 'ignore_before')
    op.execute("DROP MATERIALIZED VIEW IF EXISTS latest_vulns")
    op.drop_table('app_settings')
```

**Step 2: Commit**

```bash
git add backend/alembic/versions/f7b4c5d63a29_add_app_settings_and_latest_vulns.py
git commit -m "feat: migration for app_settings, latest_vulns view, watch_paths.ignore_before"
```

---

### Task 3: Add refresh helper + call it after import

**Files:**
- Modify: `backend/src/q2h/ingestion/importer.py:184`

**Step 1: Add refresh call at end of `run()` method**

After line 184 (`await self.session.commit()`), before the return:

```python
        # 8. Refresh materialized view for dedup
        await self.session.execute(
            text("REFRESH MATERIALIZED VIEW CONCURRENTLY latest_vulns")
        )
        await self.session.commit()
```

Add `from sqlalchemy import text` to imports (line 5 area).

**Step 2: Commit**

```bash
git add backend/src/q2h/ingestion/importer.py
git commit -m "feat: refresh latest_vulns materialized view after import"
```

---

### Task 4: Freshness settings API

**Files:**
- Create: `backend/src/q2h/api/settings.py`
- Modify: `backend/src/q2h/main.py` (register router)

**Step 1: Create settings API**

```python
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
```

**Step 2: Register in main.py**

Add import and `app.include_router(settings_router)` after watcher_router.

**Step 3: Commit**

```bash
git add backend/src/q2h/api/settings.py backend/src/q2h/main.py
git commit -m "feat: add freshness settings API (GET/PUT /api/settings/freshness)"
```

---

### Task 5: Switch dashboard API to latest_vulns

**Files:**
- Modify: `backend/src/q2h/api/dashboard.py`

**Step 1: Create a LatestVuln mapped class**

At the top of `dashboard.py`, after imports, add a mapped class for the materialized view. Since SQLAlchemy doesn't auto-map views, we use a lightweight approach: query `latest_vulns` via `text()` or create a selectable. Simplest approach — define a Table object pointing to the view, then use it exactly like `Vulnerability`:

In `models.py`, add after the `Vulnerability` class:

```python
# Materialized view — same columns as Vulnerability, read-only
from sqlalchemy import Table, MetaData
latest_vulns_table = Table("latest_vulns", Base.metadata, autoload_with=None,
    *[c.copy() for c in Vulnerability.__table__.columns])
```

Actually, simpler approach: just use `text()` for the FROM clause substitution. Even simpler: create a helper in dashboard.py that replaces `Vulnerability` references.

**Best approach**: Create a module-level variable `LatestVuln` that mirrors `Vulnerability` but points to `latest_vulns` table. Add to `models.py`:

```python
from sqlalchemy.orm import aliased
from sqlalchemy import Table

# After Vulnerability class definition:
_latest_vulns_table = Table(
    "latest_vulns", Base.metadata,
    *[c.copy() for c in Vulnerability.__table__.columns],
    extend_existing=True,
)

class LatestVuln(Base):
    __table__ = _latest_vulns_table
    __mapper_args__ = {"primary_key": [_latest_vulns_table.c.id]}
```

**Step 2: In `dashboard.py`, replace `Vulnerability` with `LatestVuln`**

- Add `LatestVuln` to imports from `q2h.db.models`
- In `_apply_filters()` and all queries in `dashboard_overview()`: replace every `Vulnerability.xxx` with `LatestVuln.xxx`
- Add `freshness` query parameter (`active`, `stale`, `all`, default `active`)
- Before filters, add freshness filter:

```python
    # Freshness filter
    freshness_settings = await _get_freshness_thresholds(db)
    if freshness != "all":
        stmt = stmt.where(LatestVuln.last_detected >= func.now() - text(f"interval '{freshness_settings['hide_days']} days'"))
        if freshness == "active":
            stmt = stmt.where(LatestVuln.last_detected >= func.now() - text(f"interval '{freshness_settings['stale_days']} days'"))
```

Helper to load thresholds (cached per request):
```python
async def _get_freshness_thresholds(db: AsyncSession) -> dict:
    from q2h.db.models import AppSettings
    stale = (await db.execute(select(AppSettings.value).where(AppSettings.key == "freshness_stale_days"))).scalar() or "7"
    hide = (await db.execute(select(AppSettings.value).where(AppSettings.key == "freshness_hide_days"))).scalar() or "30"
    return {"stale_days": int(stale), "hide_days": int(hide)}
```

**Step 3: Commit**

```bash
git add backend/src/q2h/db/models.py backend/src/q2h/api/dashboard.py
git commit -m "feat: switch dashboard to latest_vulns materialized view with freshness filter"
```

---

### Task 6: Switch vulnerabilities API to latest_vulns

**Files:**
- Modify: `backend/src/q2h/api/vulnerabilities.py`

**Step 1: Replace Vulnerability with LatestVuln**

- Import `LatestVuln` from models
- In `vulnerability_detail()`:
  - Line 57-58: `select(LatestVuln).where(LatestVuln.qid == qid).limit(1)`
  - Lines 65-67: `select(func.count(func.distinct(LatestVuln.host_id))).where(LatestVuln.qid == qid)` — now `func.distinct` is redundant since latest_vulns is already 1 per (host,qid), but keep it for safety
  - Lines 70-71: `total_occurrences` = count from `LatestVuln` (now represents actual affected hosts)
- In `vulnerability_hosts()`:
  - Lines 100, 105-116: Replace `Vulnerability` with `LatestVuln`
  - Total count: `select(func.count(LatestVuln.id)).where(LatestVuln.qid == qid)`

**Step 2: Commit**

```bash
git add backend/src/q2h/api/vulnerabilities.py
git commit -m "feat: switch vuln detail/hosts API to latest_vulns"
```

---

### Task 7: Switch export API to latest_vulns

**Files:**
- Modify: `backend/src/q2h/api/export.py`

**Step 1: Replace Vulnerability with LatestVuln in _query_vulns()**

- Import `LatestVuln` from models
- In `_query_vulns()` (lines 28-83): replace all `Vulnerability.xxx` with `LatestVuln.xxx`
- The join `Host, Vulnerability.host_id == Host.id` becomes `Host, LatestVuln.host_id == Host.id`

**Step 2: Commit**

```bash
git add backend/src/q2h/api/export.py
git commit -m "feat: switch export API to latest_vulns"
```

---

### Task 8: Update WatchPath API + service for ignore_before

**Files:**
- Modify: `backend/src/q2h/api/watcher.py`
- Modify: `backend/src/q2h/watcher/service.py`

**Step 1: Add ignore_before to Pydantic schemas**

In `watcher.py`:
- `WatchPathCreate`: add `ignore_before: str | None = None`
- `WatchPathUpdate`: add `ignore_before: str | None = None`
- `WatchPathResponse`: add `ignore_before: str | None`
- Update create/update/list handlers to pass `ignore_before` through

**Step 2: Update service to filter by ignore_before**

In `service.py`, in `_scan_directories()` and `_initial_scan()`, after getting matches:

```python
# Filter by file modification time vs ignore_before
if ignore_before:
    mtime = csv_file.stat().st_mtime
    if datetime.fromtimestamp(mtime) < ignore_before:
        continue
```

Update `_load_paths_from_db()` to also select `WatchPath.ignore_before` and return it as 4th tuple element.

**Step 3: Commit**

```bash
git add backend/src/q2h/api/watcher.py backend/src/q2h/watcher/service.py
git commit -m "feat: add ignore_before date filter to watch paths"
```

---

### Task 9: Frontend — add freshness filter to FilterContext + FilterBar

**Files:**
- Modify: `frontend/src/contexts/FilterContext.tsx`
- Modify: `frontend/src/components/filters/FilterBar.tsx`

**Step 1: Add freshness to FilterContext**

In `FilterContext.tsx`:
- Add to `FilterState`: `freshness: string;` (values: "active", "stale", "all")
- Add to `FilterContextValue`: `setFreshness: (f: string) => void;`
- Add useState: `const [freshness, setFreshness] = useState<string>('active');`
- Add to `resetFilters`: `setFreshness('active');`
- Add to `toQueryString`: `if (freshness !== 'active') params.set('freshness', freshness);`
- Add to Provider value

**Step 2: Add freshness selector to FilterBar**

In `FilterBar.tsx`, add a `Select` component after the OS class filter:

```tsx
<Col xs={24} md={2}>
  <div style={{ marginBottom: 4, fontWeight: 500, fontSize: 12 }}>Fraîcheur</div>
  <Select
    style={{ width: '100%' }}
    value={freshness}
    onChange={setFreshness}
    options={[
      { label: 'Actives', value: 'active' },
      { label: 'Peut-être obsolètes', value: 'stale' },
      { label: 'Tout', value: 'all' },
    ]}
  />
</Col>
```

**Step 3: Commit**

```bash
git add frontend/src/contexts/FilterContext.tsx frontend/src/components/filters/FilterBar.tsx
git commit -m "feat: add freshness filter to FilterBar"
```

---

### Task 10: Frontend — freshness visual states on Overview

**Files:**
- Modify: `frontend/src/pages/Overview.tsx`
- Modify: `frontend/src/components/dashboard/TopVulnsTable.tsx` (if it exists — add `last_detected` and greying)
- Modify: `frontend/src/components/dashboard/TopHostsTable.tsx` (same)

**Step 1: Update Overview useEffect**

The Overview already uses `toQueryString()` which now includes `freshness`. No change needed in the fetch logic — it's automatic.

**Step 2: Update OverviewResponse to include freshness info**

In `dashboard.py`, add `freshness_thresholds` to the response so frontend knows the thresholds:

```python
class OverviewResponse(BaseModel):
    ...
    freshness_stale_days: int
    freshness_hide_days: int
```

Populate from DB at the end of the endpoint.

**Step 3: Update Overview.tsx OverviewData interface**

Add:
```typescript
freshness_stale_days: number;
freshness_hide_days: number;
```

**Step 4: Commit**

```bash
git add frontend/src/pages/Overview.tsx backend/src/q2h/api/dashboard.py
git commit -m "feat: pass freshness thresholds to frontend in overview response"
```

---

### Task 11: Frontend — admin freshness settings page

**Files:**
- Create or modify: `frontend/src/pages/admin/Settings.tsx` (or add to existing admin page)

**Step 1: Check if admin settings page exists**

Look for existing admin pages in `frontend/src/pages/admin/`. Add a freshness settings card — either in a new `Settings.tsx` or inside an existing admin page.

The card should have:
- InputNumber for "Seuil peut-être obsolète (jours)" — default 7
- InputNumber for "Seuil masquée (jours)" — default 30
- Save button calling `PUT /api/settings/freshness`
- Load current values on mount via `GET /api/settings/freshness`

**Step 2: Add route if new page**

In `App.tsx` or router config, add the route for the settings page.

**Step 3: Commit**

```bash
git add frontend/src/pages/admin/
git commit -m "feat: add admin freshness settings page"
```

---

### Task 12: Frontend — update ImportManager for ignore_before

**Files:**
- Modify: `frontend/src/pages/admin/ImportManager.tsx`

**Step 1: Add ignore_before to WatchPath interface**

```typescript
interface WatchPath {
  ...
  ignore_before: string | null;
}
```

**Step 2: Add DatePicker to watch path modal form**

```tsx
<Form.Item name="ignore_before" label="Ignorer les fichiers avant">
  <DatePicker style={{ width: '100%' }} />
</Form.Item>
```

**Step 3: Add column to watch paths table**

```tsx
{
  title: 'Ignorer avant',
  dataIndex: 'ignore_before',
  width: 130,
  render: (dt: string | null) => dt ? new Date(dt).toLocaleDateString('fr-FR') : '—',
},
```

**Step 4: Commit**

```bash
git add frontend/src/pages/admin/ImportManager.tsx
git commit -m "feat: add ignore_before field to watch path UI"
```

---

### Task 13: Update dashboard freshness query param

**Files:**
- Modify: `backend/src/q2h/api/dashboard.py`

**Step 1: Add freshness parameter to dashboard_overview endpoint**

Add query parameter:
```python
freshness: Optional[str] = Query("active", description="Freshness filter: active, stale, all"),
```

Add freshness filtering logic after getting thresholds:
```python
async def _apply_freshness(stmt, freshness: str, db: AsyncSession, model=LatestVuln):
    """Apply freshness filter based on last_detected and admin thresholds."""
    thresholds = await _get_freshness_thresholds(db)
    if freshness == "all":
        return stmt
    if freshness == "stale":
        # Show stale only (between stale and hide thresholds)
        return stmt.where(
            model.last_detected < func.now() - text(f"interval '{thresholds['stale_days']} days'"),
            model.last_detected >= func.now() - text(f"interval '{thresholds['hide_days']} days'"),
        )
    # Default: active (within stale threshold)
    return stmt.where(
        model.last_detected >= func.now() - text(f"interval '{thresholds['stale_days']} days'")
    )
```

Apply to each query in `dashboard_overview()` alongside `_apply_filters()`.

**Step 2: Commit**

```bash
git add backend/src/q2h/api/dashboard.py
git commit -m "feat: implement freshness query filter on dashboard endpoint"
```

---

### Task 14: TypeScript check + test run

**Step 1: Run TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

**Step 2: Run backend tests**

```bash
cd backend && python -m pytest tests/test_watcher.py -v
```

Expected: all pass (watcher tests use mocks, not real DB).

**Step 3: Manual verification checklist**

- [ ] Import a CSV manually → check `latest_vulns` view is refreshed
- [ ] Import same CSV again → check dedup (same data in latest_vulns)
- [ ] Dashboard shows deduplicated counts
- [ ] Vuln detail shows 1 host per (host, QID), not N
- [ ] Freshness filter works: active / stale / all
- [ ] Admin can change freshness thresholds
- [ ] Watch path ignore_before filters old files
- [ ] Export CSV/PDF uses deduplicated data
- [ ] Trends still uses full history

**Step 4: Final commit**

```bash
git add -A
git commit -m "fix: resolve any remaining TS or test issues"
```
