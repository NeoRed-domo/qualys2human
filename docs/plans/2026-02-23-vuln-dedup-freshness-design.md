# Design: Vulnerability Dedup & Freshness States

**Date**: 2026-02-23
**Status**: Approved

## Problem

Each weekly Qualys import creates new Vulnerability rows for every (host, QID) pair. After N weeks, the same vulnerability on the same server appears N times in the database. The dashboard counts them all, inflating KPIs and duplicating hosts in detail views.

## Decisions

### 1. Keep full history, deduplicate at query time

All imported rows are kept in `vulnerabilities` (1 row per report x host x QID). No upsert, no deletion. This preserves full history for the Trends section.

### 2. Materialized view `latest_vulns`

A PostgreSQL materialized view pre-computes the latest state for each (host_id, qid) pair:

```sql
CREATE MATERIALIZED VIEW latest_vulns AS
SELECT DISTINCT ON (v.host_id, v.qid)
    v.*
FROM vulnerabilities v
JOIN scan_reports sr ON sr.id = v.scan_report_id
ORDER BY v.host_id, v.qid, sr.report_date DESC NULLS LAST, v.id DESC;
```

Indexes on the view:
- `UNIQUE (host_id, qid)` — enables `REFRESH CONCURRENTLY`
- `(severity)`, `(qid)` — query performance

Refreshed automatically after each import completes (in `QualysImporter.run()`).

### 3. Three visual freshness states

Based on `last_detected` relative to now:

| State | Condition | Visual | Dashboard |
|-------|-----------|--------|-----------|
| **Active** | `last_detected >= NOW() - stale_days` | Normal display | Counted in KPIs |
| **Peut-etre obsolete** | `stale_days < age <= hide_days` | Greyed out row | Counted but visually distinct |
| **Hidden** | `age > hide_days` | Not shown by default | Excluded from default view |

Default thresholds: `stale_days = 7`, `hide_days = 30`. Configurable by admin.

### 4. Admin freshness settings

New admin section "Parametres d'affichage" with two configurable thresholds:
- "Seuil peut-etre obsolete" (days, default 7)
- "Seuil masquee" (days, default 30)

Stored in a new `app_settings` table (key-value) or added to existing config mechanism.

API: `GET/PUT /api/settings/freshness`

### 5. Uniqueness key

A vulnerability is uniquely identified by the pair **(host IP, QID)**. Port is not part of the key.

### 6. No automatic "fixed" inference

A vulnerability is never automatically marked as fixed by its absence from a report. Multiple complementary reports may cover different scopes. The freshness mechanism handles staleness gracefully without false positives.

### 7. Retention purge — deferred

Automatic purging of old data is deferred to a future version. The materialized view and freshness thresholds handle the display concern. Storage cleanup will be addressed when needed.

## API Impact

### Queries switching to `latest_vulns`:
- `GET /api/dashboard/overview` — all KPIs, top 10 vulns, top 10 hosts
- `GET /api/vulnerabilities/{qid}` — affected host count, host list
- `GET /api/vulnerabilities/{qid}/hosts` — deduplicated host list
- `GET /api/export/*` — CSV and PDF exports (current state)

### Queries staying on `vulnerabilities`:
- `GET /api/trends/*` — full historical data for trend analysis

### New endpoints:
- `GET /api/settings/freshness` — read thresholds
- `PUT /api/settings/freshness` — update thresholds (admin only)

### New query parameter:
- `freshness` on dashboard/vuln endpoints: `active` (default), `stale`, `all`

## Frontend Impact

### Overview page:
- KPIs reflect current state only (from `latest_vulns`)
- Rows with `last_detected` between stale and hide thresholds: greyed out with badge "Peut-etre obsolete"
- Freshness filter added to FilterBar
- Vulns beyond hide threshold excluded by default

### Detail pages (vuln, host):
- Deduplicated lists — 1 server per vuln, 1 vuln per server
- Visual badge on stale entries

### Admin page:
- New section for freshness threshold configuration

### Trends page:
- No change — continues to query full history

## Data Flow

```
CSV Import
    |
    v
vulnerabilities (append, all rows kept)
    |
    v
REFRESH MATERIALIZED VIEW latest_vulns
    |
    v
Dashboard queries read latest_vulns
    + freshness filter (stale_days / hide_days)
    |
    v
Frontend: Active / Peut-etre obsolete / Hidden
```
