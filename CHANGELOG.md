# Changelog

Toutes les modifications notables du projet Qualys2Human sont documentees ici.

Format de version : `MAJOR.EVOLUTION.MINOR.BUILD`

---

## [1.0.4.0] - 2026-02-27

### Nouvelles fonctionnalites

- **Widget Repartitions triple donut** — Le dashboard affiche 3 donuts cote a cote : Criticites, Classe d'OS, Categorisation. Pleine largeur, responsive (empile en mobile).
- **Donut Classe d'OS** — Nouveau graphique repartition Windows / NIX / Autre, base sur `Host.os` avec CASE WHEN (12 patterns NIX). Endpoint `os_class_distribution` dans `/dashboard/overview`.
- **Drill-down Classe d'OS** — Clic sur une section du donut ouvre la nouvelle page `/hosts?os_class=X` avec la liste complete des serveurs de cette classe.
- **Drill-down Categorisation** — Clic sur une section du donut ouvre `/vulnerabilities?layer=X` avec la liste des vulns de cette categorisation.
- **Page Liste des serveurs** (`/hosts`) — Nouvelle page avec tableau AG Grid (IP, DNS, OS, Vulnerabilites), export PDF/CSV, clic ligne vers detail serveur.
- **Endpoint GET /hosts** — Liste de serveurs avec `vuln_count`, filtre `os_class` (windows, nix, autre).
- **Endpoint GET /vulnerabilities enrichi** — Nouveau filtre `layer` (0 = non classifie), colonnes `layer_name`/`layer_color` dans la reponse.

### Ameliorations

- **Layout dashboard flexbox** — Remplacement de react-grid-layout par un layout flexbox vertical avec `gap` uniforme. Espacement pixel-perfect, auto-dimensionnement des widgets. Drag-to-reorder conserve via HTML5 Drag & Drop.
- **Tableaux Top 10 auto-height** — AG Grid en `domLayout: autoHeight`, plus d'ascenseur. Les tableaux affichent toutes les lignes.
- **Tooltips donuts** — Affichent le nom de la section survolee (ex: "Urgent (5)", "Windows", nom de layer) au lieu du generique "Vulnerabilites".
- **KPI Quick-wins retire** — Le KPI Quick-wins (toujours a 0, non implemente) est retire du dashboard.
- **Tag Coherence retire** — Le tag "Coherence OK / Anomalies" est retire du dashboard (donnees toujours calculees cote backend pour usage futur).
- **Export PDF mis a jour** — Les 3 donuts (severite + OS class en paire, layer separement) sont inclus dans l'export PDF.
- **Colonne Categorisation dans VulnList** — La liste des vulnerabilites affiche desormais la categorisation avec badge couleur.
- **Card retiree des donuts** — SeverityDonut et LayerDonut n'ont plus de Card englobante (geree par le widget parent).

---

## [1.0.3.0] - 2026-02-26

### Nouvelles fonctionnalites

- **Export PDF par page (client-side)** — Bouton PDF sur chaque page (Overview, VulnList, VulnDetail, HostDetail, FullDetail, Trends). Generation 100% client-side via jsPDF + jspdf-autotable + html2canvas. Compatible offline/air-gapped. Inclut en-tete avec logo, KPIs, graphiques captures, tableaux programmatiques, blocs texte. Layout A4 portrait avec sauts de page automatiques et pieds de page.

---

## [1.0.3.0] - 2026-02-25

### Nouvelles fonctionnalites

- **Filtres per-user** — Chaque utilisateur conserve ses propres filtres dans un localStorage isole (`q2h_filters_{username}`). Login user A / logout / login user B : chacun retrouve ses filtres.
- **Bouton Regles entreprise** — Nouveau bouton (icone BankOutlined) dans la barre de filtres pour reappliquer le preset admin a jour en un clic. Re-fetch le preset depuis le backend pour avoir la derniere version.
- **Migration automatique** — L'ancienne cle partagee `q2h_filters` est automatiquement migree vers la cle per-user au premier login.

### Ameliorations

- **Zone de boutons FilterBar** — Les 2 colonnes (reset + presets) fusionnees en une seule colonne avec `Space`. Ordre : Reset, Regles entreprise, PresetSelector.

---

## [1.0.2.0] - 2026-02-25

### Nouvelles fonctionnalites

- **Drill-down interactif sur tous les graphiques** — Cliquer sur une section de camembert ou une barre filtre le tableau associe. Overview : filtre global par severite/categorie. VulnDetail : filtre par statut de detection. HostDetail : filtre par severite et methode de suivi.
- **Colonne Categorisation avec badge couleur** — Tous les tableaux de vulnerabilites (TopVulnsTable, HostDetail) affichent la categorisation avec un point de couleur.
- **Restriction profil monitoring** — Le profil monitoring n'a acces qu'a la page Monitoring. Backend `require_data_access` bloque l'acces aux donnees (403). Frontend `MonitoringGuard` redirige, navigation filtree.
- **Fraicheur integree dans Regles entreprise** — Les seuils de fraicheur (stale_days, hide_days) sont configurables depuis la page Regles entreprise. Page Parametres supprimee.

### Ameliorations

- **Logo reduit a 75%** — Le logo sur la page de connexion fait desormais 75% de sa taille precedente (`maxHeight: 135px`).
- **Page Parametres supprimee** — Fusionnee dans Regles entreprise. Tab et route retires.

### Corrections de bugs

- **Migration Alembic fiabilisee (BUG-005)** — Remplacement du driver asyncpg par psycopg2 synchrone pour les migrations Alembic, garantissant des transactions atomiques. Reecriture du rename avec un seul `UPDATE ... CASE WHEN` au lieu de multiple statements individuels. Corrige dans `backend/alembic/env.py`, `backend/alembic/versions/a1b2c3d4e5f6`, `installer/upgrade.py`.
- **Tooltip Top 10 cliquable** — Le tooltip du graphique Top 10 interceptait les clics (z-index eleve). Corrige avec `pointerEvents: 'none'` sur le wrapperStyle. Texte "Cliquer pour voir le detail" supprime.

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
