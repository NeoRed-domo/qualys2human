# File Watcher Admin — Design Document

**Date:** 2026-02-23
**Status:** Approved

## Goal

Expose the existing file watcher as a fully admin-configurable feature: multiple watched directories with glob patterns, recursive scanning, deduplication, and real-time UI management — all without service restart.

## Data Model

### New table: `watch_paths`

| Column     | Type         | Description                              |
|------------|--------------|------------------------------------------|
| id         | PK           |                                          |
| path       | Text, unique | Directory path (local or UNC)            |
| pattern    | String(100)  | Glob pattern, default `*.csv`            |
| recursive  | Boolean      | Scan subdirectories, default False       |
| enabled    | Boolean      | Per-path toggle, default True            |
| created_at | DateTime     | Auto                                     |
| updated_at | DateTime     | Auto on change                           |

No separate global toggle: if zero paths are enabled, the watcher idles.

### Deduplication

Before importing, parse the CSV header (first ~20 lines, a few KB) and extract `(report_date, asset_group, total_vulns_declared)`. Query `scan_reports` for a matching triplet. If found, skip the file and log a warning. No new table needed.

## Backend Changes

### 1. Model (`models.py`)

Add `WatchPath` SQLAlchemy model.

### 2. Migration (Alembic)

New migration: create `watch_paths` table.

### 3. API (`api/watcher.py`) — new file

| Endpoint                     | Method | Auth  | Purpose                          |
|------------------------------|--------|-------|----------------------------------|
| `/api/watcher/paths`         | GET    | admin | List all watch paths             |
| `/api/watcher/paths`         | POST   | admin | Add a new watch path             |
| `/api/watcher/paths/{id}`    | PUT    | admin | Update path/pattern/enabled/recursive |
| `/api/watcher/paths/{id}`    | DELETE | admin | Remove a watch path              |
| `/api/watcher/status`        | GET    | admin | Watcher running? + active path count |

### 4. Watcher service (`watcher/service.py`)

Refactor to:
- Read config from DB (query `watch_paths` where enabled=True) at each poll cycle instead of static config.
- Support `recursive` flag: use `rglob(pattern)` vs `glob(pattern)` per path.
- Apply glob pattern per watch path (currently hardcoded `.csv`).
- Add deduplication check: parse header, check `scan_reports` for matching fingerprint before importing.
- Remove dependency on `WatcherConfig.paths` from config.py (keep `poll_interval` and `stable_seconds` in config for now).

### 5. Import API (`api/imports.py`)

Add `report_date` to `ImportJobResponse` (join with `ScanReport.report_date`). Already available in DB, just not exposed.

## Frontend Changes

### ImportManager page (`pages/admin/ImportManager.tsx`)

Add a collapsible section **"Répertoires surveillés"** above the import history table:

- **Table** with columns: Chemin, Pattern, Récursif, Actif, Actions (edit/delete)
- **Add button** opens a modal/drawer with fields: path (text input), pattern (text input, default `*.csv`), recursive (switch), enabled (switch)
- **Inline toggle** for enabled/disabled per row
- **Watcher status indicator** at the top: green dot if running with active paths, grey if idle

### Import history table

Add column **"Date rapport"** showing `report_date` from `ScanReport` (the Qualys date, not the import date).

## Architecture Notes

- The watcher reloads its path list from DB every poll cycle (~10s). Admin changes take effect within one cycle, no restart needed.
- Deduplication runs before `QualysImporter.run()` to avoid unnecessary parsing of the full file.
- The watcher keeps its in-memory `known_files` dict for mtime-based fast skip within a single run. The DB deduplication is the authoritative check across restarts.
- UNC paths (`\\server\share`) work because we use `Path.glob()`/`rglob()` which handle them natively on Windows.
