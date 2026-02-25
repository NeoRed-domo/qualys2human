# Qualys2Human — Instructions projet

## Langue
- Communiquer en **français** avec l'utilisateur.
- Code, commits, noms de variables/fonctions : **anglais**.

## Versioning — TOUJOURS appliquer (sans demander)
- **Format** : `MAJOR.EVOLUTION.MINOR.BUILD` (ex: v1.0.0.1)
  - MAJOR : refonte / breaking changes
  - EVOLUTION : grosse évolution de la version majeure
  - MINOR : petites améliorations, new features, UX tweaks
  - BUILD : corrections de bugs
- **Version actuelle** : v1.0.1.0
- **Fichiers à mettre à jour** quand la version change :
  - `backend/src/q2h/main.py` → `APP_VERSION` + `RELEASE_NOTES`
  - `CHANGELOG.md` (racine)
  - `scripts/package.py` → `VERSION` (nom du .zip et .exe doit refléter la version)

## Mises à jour obligatoires à chaque session
À la **fin de chaque session** (ou avant un commit), mettre à jour **sans que l'utilisateur le demande** :
1. **`CHANGELOG.md`** — Lister tous les bugs corrigés et améliorations de la session
2. **`memory/MEMORY.md`** — Mettre à jour si nouvelles features, règles d'architecture, ou changements structurels
3. **`memory/roadmap.md`** — Cocher `[x]` les features implémentées, ajouter les nouvelles idées
4. **`memory/bugs-and-fixes.md`** — Documenter chaque bug corrigé (fichier, symptôme, cause, fix)
5. **`RELEASE_NOTES`** dans `main.py` — Mettre à jour si des fixes/améliorations visibles par l'utilisateur ont été ajoutés

## Règles d'architecture critiques
- **Déduplication** : Toutes les requêtes de lecture utilisent `LatestVuln` (vue matérialisée), JAMAIS `Vulnerability` (table brute). Exception : `trends.py` (historique multi-rapports).
- **Refresh mat. view** : `REFRESH MATERIALIZED VIEW CONCURRENTLY latest_vulns` obligatoire après : import, reclassify, delete_layer, tout UPDATE bulk sur `vulnerabilities`.
- **Upgrade script** : `upgrade.py` DOIT passer `Q2H_DATABASE_URL` + `Q2H_CONFIG` en env vars au subprocess Alembic.

## Stack technique
- **Backend** : Python 3.12, FastAPI, SQLAlchemy 2.0, Alembic, Polars (analytics)
- **Frontend** : React 18, TypeScript, Ant Design, Recharts, AG Grid
- **DB** : PostgreSQL 18 (embedded/portable)
- **Cible** : Windows Server 2016+, totalement offline/air-gapped
- **API client** : `frontend/src/api/client.ts` (axios avec intercepteurs JWT)

## Release & Packaging — TOUJOURS appliquer (sans demander)
- Quand un build/package est fait, **toujours aligner** la version dans :
  - `scripts/package.py` → `VERSION` (contrôle les noms `Qualys2Human-X.X.X.zip` et `.exe`)
  - `backend/src/q2h/main.py` → `APP_VERSION`
  - `CHANGELOG.md`
- Après un push de release, **toujours fournir la commande `gh`** pour créer/uploader la release GitHub :
  ```
  gh release create vX.X.X.X "Qualys2Human-X.X.X.zip" "Qualys2Human-X.X.X.exe" --title "vX.X.X.X" --notes "..."
  ```

## Conventions code
- Backend : endpoints dans `backend/src/q2h/api/`, modèles dans `backend/src/q2h/db/models.py`
- Frontend : pages dans `frontend/src/pages/`, composants dans `frontend/src/components/`
- Pas de sur-ingénierie. Pas de features non demandées.
