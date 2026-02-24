# Changelog

Toutes les modifications notables du projet Qualys2Human sont documentees ici.

Format de version : `MAJOR.EVOLUTION.MINOR.BUILD`

---

## [1.0.1.0] - 2026-02-24

### Nouvelles fonctionnalites

- **Filtre fraicheur (freshness)** — Nouveau filtre frontend/backend pour distinguer les vulns actives, obsoletes ou toutes. Seuils configurables par admin (freshness_stale_days). Endpoints dashboard, vulns et export utilisent desormais la vue `latest_vulns`.
- **Page admin Freshness Settings** — Interface admin pour configurer les seuils de fraicheur et le champ `ignore_before` des watchers (DatePicker).
- **Modele AppSettings** — Table cle/valeur pour les parametres applicatifs globaux (freshness, etc). Migration Alembic `f7b4c5d63a29`.
- **Watcher : ignore_before** — Chaque watch_path supporte un champ `ignore_before` pour filtrer les fichiers CSV par date de modification. Expose dans l'API watcher.
- **Watcher : status enrichi** — Le status du watcher expose desormais : scanning, importing, last_import, last_error, import_count.
- **Popup "Nouveautes" apres login** — A la premiere connexion sur une nouvelle version, un modal affiche les corrections et ameliorations. Persiste par utilisateur via `last_seen_version` dans les preferences JSONB. Endpoint `GET /api/version` pour les release notes. Nouveau composant `WhatsNewModal.tsx`.

### Ameliorations

- **Header sticky** — Le menu de navigation reste visible au scroll. Modifie dans `frontend/src/layouts/MainLayout.tsx`.
- **Nouvelles categories de vulnerabilites** — Remplacement des 4 categories par defaut (OS / Middleware / Applicatif / Reseau) par : OS / Middleware-OS / Middleware-Application / Application. Migration Alembic `a1b2c3d4e5f6`.
- **Affichage de la version** — Version affichee dans le footer, recuperee depuis `/api/health`. Modifie dans `frontend/src/components/AppFooter.tsx`.
- **Import : report_date expose** — La date du rapport est desormais visible dans l'historique des imports.
- **Import : rollback sur erreur** — En cas d'echec d'import, la transaction est correctement annulee (rollback explicite).
- **Preferences : last_seen_version** — Le champ `last_seen_version` est persiste dans les preferences utilisateur JSONB.
- **Migrations host dates** — Les champs `first_seen`/`last_seen` des hosts sont recalcules depuis `report_date`. Migration `d5a2b3c41f07`.
- **Table watch_paths** — Nouvelle table pour configurer les chemins surveilles en BDD. Migration `e6f3a4d52b18`.
- **Favicons** — Ajout de favicons (32px, 192px, .ico) dans `frontend/public/`.
- **Securisation .gitignore** — Ajout de `data/`, `backend/config.yaml`, `memory/` aux exclusions.

### Corrections de bugs

- **upgrade.bat : crash des migrations Alembic** — Le script d'upgrade ne passait pas `Q2H_DATABASE_URL` au subprocess Alembic. Corrige dans `installer/upgrade.py`.
- **Categorisation non effective apres reclassification** — La vue materialisee `latest_vulns` n'etait pas rafraichie apres `_run_reclassify()` et `delete_layer()`. Corrige dans `backend/src/q2h/api/layers.py`.
- **Doublons de vulnerabilites par serveur** — Les endpoints hosts interrogeaient `Vulnerability` au lieu de `LatestVuln`. Corrige dans `backend/src/q2h/api/hosts.py`.
- **Preset entreprise non applique par defaut** — Ajout persistence localStorage (`q2h_filters`). Premier visit = enterprise preset, retour = preferences sauvegardees, reset = retour enterprise. Corrige dans `frontend/src/contexts/FilterContext.tsx`.
- **Tooltip Top 10 vulnerabilites non fonctionnel** — Remplace par le `<Tooltip content={...}>` natif Recharts. Corrige dans `frontend/src/components/dashboard/CategoryBar.tsx`.
- **Watcher : timezone ignore_before** — Suppression du timezone dans `ignore_before` pour eviter les comparaisons invalides.
- **Watcher : chemins UNC** — Autorisation des chemins UNC (`\\server\share`) sans validation de chemin local.
- **Installer : pipeline, login loop, branding paths, erreurs TS** — Corrections multiples du pipeline d'installation et du frontend.
- **Migration rename layers crash asyncpg** — L'utilisation de `op.execute()` avec des strings bruts causait un crash asyncpg. Remplace par `conn.execute(text(...))` explicite. Protection `COALESCE` sur le `setval` pour eviter NULL. Corrige dans `backend/alembic/versions/a1b2c3d4e5f6`.
- **Migration rename layers : UniqueViolationError** — Apres un echec partiel, la migration tentait de renommer des layers deja renommes. Migration rendue idempotente avec noms temporaires (`__tmp_N`). Corrige dans `backend/alembic/versions/a1b2c3d4e5f6`.
- **upgrade.py : erreur migrations tronquee** — Le message d'erreur des migrations etait tronque a 500 caracteres, masquant l'erreur PostgreSQL reelle. Affiche desormais les 30 dernieres lignes de stderr. Corrige dans `installer/upgrade.py`.
- **upgrade.py : rollback ne restaurait pas la DB** — Le rollback ne restaurait que les fichiers, pas la base de donnees. Ajout de la restauration du dump SQL (DROP SCHEMA + psql -f). Corrige dans `installer/upgrade.py`.
- **uninstall.py : PostgreSQL non supprime** — La desinstallation ne supprimait pas le service PostgreSQL (`postgresql-q2h`), bloquant la reinstallation (mot de passe superuser inconnu). Desormais, si on supprime la DB, le service PostgreSQL est aussi arrete et supprime. Corrige dans `installer/uninstall.py`.

---

## [1.0.0.0] - 2026-02-22

### Version initiale (V1)

- Dashboard Overview avec KPIs, Top 10 vulns/hosts, repartition severite et categories
- Drill-down 3 niveaux (overview -> vuln -> host)
- Import CSV Qualys (header, summary, detail) avec coherence checks
- File watcher : surveillance locale + UNC, auto-import
- Vue materialisee `latest_vulns` pour deduplication (host_id, qid)
- Systeme de categorisation par layers avec regles de pattern matching
- Filtres : severite, type, categorie, OS, fraicheur, dates, rapport
- Presets entreprise (admin) + presets utilisateur
- Authentification LDAPS + Kerberos (AD) + local bcrypt + JWT
- Profils : admin, user, monitoring, custom
- Export PDF + CSV sur chaque vue
- Tendances : templates admin + builder utilisateur
- Branding : logo custom + texte footer configurable
- Monitoring : health dashboard
- Installateur offline Windows + script d'upgrade avec backup/rollback
