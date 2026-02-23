# Qualys2Human - Design Document

**Date**: 2026-02-22
**Author**: NeoRed
**Status**: Approved

---

## 1. Project Overview

**Qualys2Human** is a web application that ingests Qualys vulnerability scanner CSV reports (from a few MB up to 1-2 GB) and produces actionable dashboards for security operations teams. It highlights top vulnerabilities, quick-wins, most vulnerable servers, and enables drill-down from overview to individual vulnerability details.

### Key Characteristics
- **Offline deployment**: fully air-gapped Windows Server 2019+ environment
- **Volume**: 5,000 - 50,000 servers per report, hundreds of thousands of vulnerability rows
- **Users**: 10-50 concurrent users
- **Security-first**: encrypted database, AD authentication, audit logging

---

## 2. Architecture

### Approach: Modular Monolith

Single FastAPI backend process serving the React frontend as static files, plus PostgreSQL.

```
┌─────────────────────────────────────────────────┐
│              Windows Server 2019+                │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │        Qualys2Human Service (Windows)     │   │
│  │                                           │   │
│  │  ┌─────────────┐    ┌─────────────────┐  │   │
│  │  │  FastAPI     │    │  React Frontend │  │   │
│  │  │  (Backend)   │───>│  (Static files) │  │   │
│  │  │  Python 3.12 │    │  served by API  │  │   │
│  │  └──────┬───────┘    └─────────────────┘  │   │
│  │         │                                  │   │
│  │  ┌──────┴───────┐    ┌─────────────────┐  │   │
│  │  │  Background  │    │  File Watcher   │  │   │
│  │  │  Task Pool   │    │  (watchdog)     │  │   │
│  │  │  (CSV parse) │    │  Local + UNC    │  │   │
│  │  └──────┬───────┘    └────────┬────────┘  │   │
│  │         │                     │            │   │
│  │  ┌──────┴─────────────────────┴─────────┐ │   │
│  │  │         SQLAlchemy ORM               │ │   │
│  │  │    (+ Alembic migrations)            │ │   │
│  │  └──────────────┬───────────────────────┘ │   │
│  └─────────────────┼────────────────────────-┘   │
│                    │                              │
│  ┌─────────────────┴────────────────────────┐   │
│  │        PostgreSQL 18 (embedded)           │   │
│  │   Encryption: pgcrypto + master key       │   │
│  └───────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘
```

---

## 3. Technology Stack

| Component | Technology | Justification |
|-----------|------------|---------------|
| Backend API | Python 3.12 + FastAPI | Async, fast, excellent data ecosystem |
| CSV Parsing | Polars | 10-100x faster than pandas, lazy evaluation for large files |
| ORM | SQLAlchemy 2.0 + Alembic | Standard Python ORM, versioned migrations |
| AD Auth | python-ldap (LDAPS) + gssapi (Kerberos) | Both protocols supported |
| Local Auth | Passlib (bcrypt) + JWT (python-jose) | Stateless tokens, secure sessions |
| File Watcher | watchdog | Cross-platform, supports UNC paths |
| Frontend | React 18 + TypeScript | Modern SPA, rich component ecosystem |
| UI Framework | Ant Design (antd) | Enterprise design system |
| Charts | Recharts or Apache ECharts | Interactive dashboard charts |
| Tables | AG Grid Community | Sort, filter, paginate large datasets |
| PDF Export | ReportLab (backend) | Server-side PDF generation |
| CSV Export | Streaming CSV (backend) | Fast filtered data export |
| Database | PostgreSQL 18 | Volume, performance, encryption, improved parallel queries |
| Windows Service | pywin32 + NSSM | Python process as Windows service |

---

## 4. Data Model

### 4.1 Core Tables

**scan_reports**: Stores metadata for each imported Qualys CSV report.
- id, filename, imported_at, report_date, asset_group, total_vulns, avg_risk, source (auto/manual)

**hosts**: Unique servers/IPs discovered across reports.
- id, ip, dns, netbios, os, os_cpe, first_seen, last_seen

**vulnerabilities**: Individual vulnerability findings (one row per vuln per host per report).
- id, scan_report_id (FK), host_id (FK), qid, title, vuln_status, type, severity (0-5)
- port, protocol, fqdn, ssl, first_detected, last_detected, times_detected, date_last_fixed
- cve_ids (text[]), vendor_reference, bugtraq_id
- cvss_base, cvss_temporal, cvss3_base, cvss3_temporal
- threat (encrypted), impact (encrypted), solution (encrypted), results (encrypted)
- pci_vuln, ticket_state, tracking_method, category

**import_jobs**: Tracks CSV import progress.
- id, scan_report_id (FK), status (pending/processing/done/error), progress (0-100)
- started_at, ended_at, error_message, rows_processed, rows_total

### 4.2 Coherence Checks

**report_coherence_checks**: Detects mismatches between CSV header summaries and actual detail rows.
- id, scan_report_id (FK), check_type, entity, expected_value, actual_value, severity (warning/error), detected_at

Check types:
- `total_vulns_mismatch`: Header "Total Vulnerabilities" vs actual row count
- `host_count_mismatch`: Header "Active Hosts" vs unique IPs in detail
- `host_risk_mismatch`: Per-IP summary risk vs calculated average from detail
- `missing_host`: IPs in summary but absent from detail (or vice versa)

Dashboard shows a coherence indicator (green/orange/red) per report with drill-down.

### 4.3 Indexes

- `severity`, `host_id`, `qid`, `vuln_status`, `scan_report_id` on vulnerabilities
- Materialized views for dashboard aggregations and trend pre-calculations

### 4.4 CSV Ingestion Process

1. **Detection**: File watcher detects new `.csv` in watched folder
2. **Validation**: Check Qualys headers, detect encoding (UTF-8/Latin1)
3. **Chunked parsing**: Polars lazy/streaming mode (~50K row chunks)
4. **Cleanup**: Handle multi-line fields, normalize dates, extract CVEs
5. **Smart upsert**: Hosts created/updated (key = IP), vulns inserted with report reference
6. **Encryption**: Sensitive fields encrypted via pgcrypto + master key before insert
7. **Coherence check**: Compare header summaries vs parsed detail, store mismatches
8. **Progress tracking**: import_jobs updated in real-time (%), visible in admin UI

**Performance targets**: 1 GB CSV (~200-500K rows) ingested in 2-5 minutes. Dashboard queries < 500ms.

---

## 5. Authentication, Profiles & Security

### 5.1 Authentication

Dual auth system: Local accounts + Active Directory (LDAPS + Kerberos).

Login form with CyberArk-compatible HTML IDs:
- `id="q2h-login-username"`
- `id="q2h-login-password"`
- `id="q2h-login-domain"` (dropdown: Local | AD domain)
- `id="q2h-login-submit"`

Flow:
1. Domain = "Local" -> bcrypt verification in local DB
2. Domain = AD -> LDAPS bind, fallback to Kerberos if configured
3. On success -> JWT (access token 15min + refresh token 8h)
4. AD group membership mapped to application profiles

### 5.2 Profiles

**Tables**: `profiles` (id, name, type, permissions JSONB, ad_group_dn, is_default) and `users` (id, username, password_hash, auth_type, profile_id, ad_domain, is_active, last_login, preferences JSONB).

Built-in profiles:

| Profile | Permissions |
|---------|-------------|
| admin | Everything: config, import, users, enterprise rules, monitoring, dashboard |
| user | Dashboard (read), custom filters, personal presets, export PDF/CSV |
| monitoring | App health dashboard, system metrics, logs |

Custom profiles can be created by admins with granular permissions. Each profile can be linked to an AD group.

### 5.3 Security Measures

| Measure | Implementation |
|---------|----------------|
| DB Encryption | pgcrypto + AES-256 master key (stored encrypted on filesystem, protected by Windows DPAPI) |
| HTTPS | Configurable TLS certificate (self-signed by default, replaceable with enterprise cert) |
| CSRF | Double-submit cookie pattern |
| XSS | Strict Content-Security-Policy, React auto-escaping |
| SQL Injection | SQLAlchemy ORM (parameterized queries only) |
| Rate limiting | Slowapi on auth endpoints (5 attempts/min) |
| Audit log | `audit_logs` table: all admin actions traced (who, what, when) |
| Sessions | JWT HttpOnly + Secure + SameSite=Strict |
| First boot | Default local admin created, mandatory password change |

---

## 6. Dashboard & Navigation UX

### 6.1 Navigation Structure

```
[Overview] [Tendances] [Admin*] [Monitoring*] [Mon Profil]
                                  * = visible by profile
```

### 6.2 Drill-Down Levels

**Level 0 - Overview**:
- Filter bar: Criticality preset, date range, report selector
- KPI cards: Total vulns, affected hosts, critical vulns (sev 4-5), quick-wins, report coherence indicator
- Charts: Severity distribution (donut), category breakdown (bar)
- Top 10 most common vulnerabilities (table + bar chart) -> click to Level 1
- Top 10 most vulnerable servers (table + bar chart) -> click to Level 1
- Quick-wins section -> click to Level 1

**Level 1 - Intermediate Detail**:
- Vulnerability detail (QID): description, CVSS scores, affected servers list, tracking method breakdown, timeline
- Server detail (IP): host info, all vulns table, severity distribution, tracking methods
- Click through to Level 2

**Level 2 - Full Detail**:
- Single vuln on a single server: all raw Qualys fields, Threat/Impact/Solution full text, CVE list, detection history, scan results, PDF export of this record

### 6.3 Filter System & Criticality Presets

Persistent filter bar at top of all views:
- **Preset selector**: Company Rules (admin-defined default) | Critical Only (sev 4-5) | Custom | User-saved presets
- **Severity toggles**: [0] [1] [2] [3] [4] [5] individually selectable
- **Type filter**: Vuln / Practice / Info
- **Date range**: configurable start/end dates
- **Report selector**: All reports or specific report
- **Actions**: Save preset / Reset to Company Rules

Enterprise Rules (admin): default filter for all users, stored in DB, editable in admin panel.
User presets: stored in `users.preferences` (JSONB).

### 6.4 Dashboard Personalization

Users can:
- Reorder widgets via drag & drop
- Show/hide widgets
- Save personal layout (stored in `users.preferences`)
- Personal layout loads automatically on login
- "Reset to default" button available

### 6.5 Export (Every View)

- **PDF**: Server-side generation (ReportLab), reflects current view with applied filters, A4 landscape for tables
- **CSV**: Filtered data export, Excel-compatible

---

## 7. Trends & Time Evolution (Dedicated Section)

### 7.1 Admin Configuration

- `max_time_window_days`: maximum allowed time window (e.g., 90, 180, 365 days)
- `query_timeout_seconds`: timeout on trend queries (e.g., 30s) - exceeded queries are cancelled with user message
- `standard_templates`: predefined trend views visible to all users (e.g., global vuln evolution by severity, top 10 servers over time, remediation rate)

### 7.2 User Features

- View admin-defined standard trend templates
- Custom trend builder: choose metric (vuln count, severity avg, etc.), grouping (severity, server, QID), filters (IP, sev range, category)
- Configurable time window (bounded by admin max)
- Save personal trend views
- Export trend charts as PDF/CSV

### 7.3 Performance Protection

- Time window bounded by admin-configured maximum
- Query timeout with graceful error message
- Aggregations use pre-calculated materialized views (refreshed on each import)

---

## 8. Monitoring (Admin + Monitoring Profile)

### 8.1 Application Health

- API Backend status + latency
- PostgreSQL status + connection count
- File Watcher status + watched folder accessibility
- Last import time + status
- Disk space usage (DB + data)

### 8.2 System Metrics

- CPU, RAM, disk usage, uptime

### 8.3 Activity

- Connected users count
- Total imported reports
- Last error
- Imports in progress

### 8.4 Proactive Alerts

Configurable thresholds (table `monitoring_thresholds`):
- Disk usage warning
- No report received for N days
- TLS certificate expiration
- DB connection pool saturation

---

## 9. Branding

- **Default logo**: Qualys2Human SVG logo (vectorial, adapts to all sizes)
- **Present on**: app header, login page, PDF exports, favicon
- **Admin customization**: upload custom logo (PNG/SVG, max 2 MB) in Admin > Branding panel
- **SVG template**: downloadable template with dimension guides and safe zones for designers
- **Storage**: custom logo on filesystem (`data/branding/logo-custom.*`) + reference in DB config
- **Preview**: admin can preview logo in header, favicon, login, and PDF contexts before applying
- **Reset**: "Restore default logo" button available

---

## 10. Packaging & Offline Installation

### 10.1 Package Structure

```
Qualys2Human-v1.0.0-win64-offline.zip
├── install.bat
├── setup/
│   ├── installer.py
│   ├── python-3.12-embed-win64/
│   ├── postgresql-16-win64/
│   ├── app/
│   ├── dependencies/           (pre-downloaded Python wheels)
│   └── config-template.yaml
└── README-INSTALL.txt
```

### 10.2 Installation Process

1. Check prerequisites (Windows 2019+, disk space, available ports)
2. Interactive questions: install path, HTTP/HTTPS port, initial admin password
3. Install PostgreSQL as Windows service (configurable port)
4. Initialize DB + run Alembic migrations
5. Install application as Windows service (via NSSM)
6. Generate self-signed TLS certificate (replaceable later)
7. Configure file watcher paths
8. Start services
9. Display access URL: `https://localhost:8443`

### 10.3 Configuration File (config.yaml)

```yaml
server:
  host: 0.0.0.0
  port: 8443
  tls_cert: ./certs/server.crt
  tls_key: ./certs/server.key

database:
  host: localhost
  port: 5433
  name: qualys2human
  encryption_key_file: ./keys/master.key

auth:
  jwt_secret_file: ./keys/jwt.secret
  token_expiry_minutes: 15
  refresh_expiry_hours: 8
  ldap:
    enabled: false
    server: ldaps://dc.corp.local:636
    base_dn: DC=corp,DC=local
    bind_dn: CN=svc_q2h,OU=Services,DC=corp,DC=local
  kerberos:
    enabled: false
    realm: CORP.LOCAL

file_watcher:
  enabled: true
  paths:
    - D:\QualysReports
  poll_interval_seconds: 60

monitoring:
  disk_warning_percent: 75
  no_report_warning_days: 10

trends:
  max_time_window_days: 90
  query_timeout_seconds: 30
```

---

## 11. Documentation

| Type | Content | Format |
|------|---------|--------|
| GitHub README.md | Project presentation, screenshots, quick start | Markdown |
| MinimumRequirement.md | OS (Windows Server 2019+), CPU (4+ cores), RAM (8+ GB), Disk (50+ GB) | Markdown |
| In-app help | Tooltips on widgets, contextual `?` button per section, sliding help panel | React components |
| PDF documentation | Admin guide + user guide | ReportLab-generated |
