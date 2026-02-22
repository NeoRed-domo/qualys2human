# Qualys2Human

Application web pour ingérer les rapports CSV de vulnérabilités Qualys et produire des tableaux de bord interactifs destinés aux équipes d'exploitation sécurité.

**Auteur :** NeoRed
**Licence :** Privée
**Version :** 1.0.0

---

## Fonctionnalités

- **Dashboard interactif** — KPIs, répartition par sévérité, Top 10 vulnérabilités/serveurs
- **Drill-down 3 niveaux** — Vue d'ensemble > Détail vulnérabilité/hôte > Détail complet
- **Widgets personnalisables** — Drag & drop pour réorganiser le tableau de bord
- **Import CSV** — Manuel (upload) ou automatique (file watcher sur dossiers locaux/UNC)
- **Contrôles de cohérence** — Détection des écarts entre en-tête et détails du rapport
- **Tendances** — Graphiques temporels avec templates prédéfinis et constructeur personnalisé
- **Filtres & presets** — Règles entreprise (admin) + presets utilisateur personnalisés
- **Export** — PDF et CSV sur chaque vue
- **Administration** — Gestion utilisateurs, règles entreprise, branding (logo personnalisé)
- **Monitoring** — Tableau de bord santé (CPU, RAM, disque, pool DB, alertes proactives)
- **Authentification** — JWT avec support local + AD (LDAPS/Kerberos prévu)
- **Service Windows** — Déploiement via NSSM, installateur interactif

## Architecture

```
┌─────────────────────────────────────────────┐
│             Navigateur (React)              │
│  Ant Design + Recharts + AG Grid            │
└────────────────┬────────────────────────────┘
                 │ HTTPS (JWT)
┌────────────────▼────────────────────────────┐
│           FastAPI (Python)                   │
│  API REST + File Watcher + PDF/CSV Export    │
└────────────────┬────────────────────────────┘
                 │ asyncpg
┌────────────────▼────────────────────────────┐
│           PostgreSQL 16                      │
│  Modèles : hosts, vulns, reports, users...   │
└─────────────────────────────────────────────┘
```

### Stack technique

| Couche | Technologies |
|--------|-------------|
| Backend | Python 3.12+, FastAPI, SQLAlchemy 2.0 (async), Alembic, ReportLab, psutil |
| Frontend | React 18, TypeScript, Vite, Ant Design, Recharts, AG Grid, react-grid-layout |
| Base de données | PostgreSQL 16+, asyncpg |
| Service | NSSM (Windows), Uvicorn |

## Démarrage rapide (développement)

### Prérequis

- Python 3.12+
- Node.js 18+
- PostgreSQL 16+

### Backend

```bash
cd backend
pip install -e ".[dev]"
alembic upgrade head
uvicorn q2h.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

L'application sera accessible sur `http://localhost:3000` (proxy vers le backend sur le port 8000).

### Identifiants par défaut

- **Utilisateur :** `admin`
- **Mot de passe :** `Qualys2Human!`

## Déploiement (production)

Voir le [guide d'installation](installer/README-INSTALL.txt) pour le déploiement sur Windows Server.

```bash
# Build
python scripts/build.py

# Package (zip offline)
python scripts/package.py

# Installer
installer\install.bat
```

## Structure du projet

```
qualys2human/
├── backend/
│   ├── src/q2h/
│   │   ├── api/           # Endpoints FastAPI
│   │   ├── auth/          # Authentification + JWT
│   │   ├── db/            # Modèles SQLAlchemy + migrations
│   │   ├── ingestion/     # Parseur CSV + Importer
│   │   ├── watcher/       # File watcher (auto-import)
│   │   ├── config.py      # Configuration YAML
│   │   ├── main.py        # Application FastAPI
│   │   └── service.py     # Entry point Windows service
│   ├── tests/             # Tests pytest
│   ├── alembic/           # Migrations
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   │   ├── api/           # Client Axios + intercepteurs
│   │   ├── components/    # Composants réutilisables
│   │   ├── contexts/      # AuthContext, FilterContext
│   │   ├── layouts/       # MainLayout, AdminLayout
│   │   └── pages/         # Pages de l'application
│   └── vite.config.ts
├── data/branding/         # Logos (défaut + template)
├── installer/             # Scripts d'installation
├── scripts/               # Scripts de build/package
└── docs/plans/            # Design + plan d'implémentation
```

## Tests

```bash
cd backend
pytest -v
```

## API

L'API REST est documentée automatiquement via Swagger UI :
- Développement : `http://localhost:8000/docs`
- Production : `https://<serveur>:8443/docs`

### Endpoints principaux

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/auth/login` | Authentification |
| GET | `/api/dashboard/overview` | KPIs et résumé |
| GET | `/api/vulnerabilities/{qid}` | Détail vulnérabilité |
| GET | `/api/hosts/{ip}` | Détail hôte |
| GET | `/api/hosts/{ip}/vulnerabilities/{qid}` | Détail complet |
| POST | `/api/trends/query` | Requête tendances |
| GET | `/api/export/csv` | Export CSV |
| GET | `/api/export/pdf` | Export PDF |
| GET | `/api/imports` | Historique imports |
| POST | `/api/imports/upload` | Import manuel CSV |
| GET | `/api/monitoring` | Santé système |
| GET/PUT | `/api/user/preferences` | Préférences utilisateur |
