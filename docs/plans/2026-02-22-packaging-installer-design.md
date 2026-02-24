# Qualys2Human — Packaging & Installer Design

**Date** : 2026-02-22
**Auteur** : NeoRed + Claude
**Statut** : Validé

---

## 1. Objectif

Produire un livrable `.exe` auto-extractible unique (~400 Mo) permettant d'installer Qualys2Human from scratch sur un Windows Server 2016+ offline (air-gapped), sans aucun prérequis sur le serveur. L'application tourne en service Windows transparent (pas de fenêtre console).

Inclut également les scripts de mise à jour (upgrade) et de désinstallation (uninstall).

---

## 2. Décisions validées

| Sujet | Décision |
|-------|----------|
| UX installeur | .exe auto-extractible (7-Zip SFX) + CLI interactive |
| Python | Embarqué (python-3.12-embed-amd64), libs pré-installées |
| PostgreSQL | Auto-install silencieux (bundled .exe) |
| Service Windows | WinSW (remplace NSSM, abandonné depuis 2017) |
| TLS | Certificat auto-signé généré à l'installation, remplaçable |
| Mise à jour | Upgrade in-place avec backup automatique |
| Désinstallation | Script uninstall.bat complet |
| Linux | Windows seul en V1, code structuré pour support Linux futur |
| Node.js | Non nécessaire sur le serveur (frontend pré-compilé) |

---

## 3. Contenu du package

```
Qualys2Human-1.0.0-win64-offline/
├── install.bat                      # Point d'entrée installation
├── upgrade.bat                      # Point d'entrée mise à jour
├── uninstall.bat                    # Point d'entrée désinstallation
├── VERSION                          # "1.0.0"
│
├── python/                          # Python 3.12 embedded (~30 Mo)
│   ├── python.exe
│   ├── python312.dll
│   ├── python312.zip                # stdlib compressée
│   └── Lib/site-packages/           # dépendances pré-installées au build
│
├── prerequisites/
│   ├── postgresql-18.2-1-windows-x64.exe
│   └── WinSW-x64.exe
│
├── installer/
│   ├── setup.py                     # Orchestrateur principal
│   ├── prereqs.py                   # Install PostgreSQL + TLS
│   ├── database.py                  # Init DB, user q2h, Alembic
│   ├── service.py                   # Création service via WinSW
│   ├── config.py                    # Génération config.yaml
│   ├── upgrade.py                   # Backup + upgrade in-place
│   ├── uninstall.py                 # Suppression propre
│   └── utils.py                     # Helpers (logs, prompts, passwords)
│
├── app/
│   ├── backend/                     # Source Python + alembic/
│   └── frontend/                    # Build Vite (HTML/JS/CSS statiques)
│
└── config-template.yaml             # Template de configuration
```

### Prérequis à télécharger (machine de dev uniquement)

| Fichier | Où le mettre | Source |
|---------|-------------|--------|
| `postgresql-18.2-1-windows-x64.exe` | `prerequisites/` | postgresql.org (déjà présent) |
| `WinSW-x64.exe` | `prerequisites/` | github.com/winsw/winsw/releases (déjà présent) |
| `python-3.12.x-embed-amd64.zip` | Décompressé dans `prerequisites/python-embed/` | python.org/downloads |
| 7-Zip | Installé sur la machine de dev | 7-zip.org |

---

## 4. Flux d'installation

```
install.bat
  │  Vérifie droits administrateur
  │  Lance python\python.exe installer\setup.py
  ▼
setup.py (orchestrateur)
  │  Prompts : dossier (C:\Q2H), port (8443), mdp admin
  │
  ├─► prereqs.py
  │     • Vérifie Windows Server 2016+
  │     • Vérifie espace disque (>2 Go) et port disponible
  │     • Installe PostgreSQL en mode silencieux
  │     • Copie WinSW
  │     • Génère certificat TLS auto-signé (Python ssl)
  │
  ├─► config.py
  │     • Génère config.yaml depuis le template
  │     • Génère mot de passe aléatoire pour user DB q2h
  │     • Génère JWT secret aléatoire
  │     • Crée master key (DPAPI)
  │
  ├─► Copie des fichiers
  │     • app/ → C:\Q2H\app\
  │     • python/ → C:\Q2H\python\
  │     • config.yaml → C:\Q2H\config.yaml
  │     • certs/ → C:\Q2H\certs\
  │
  ├─► database.py
  │     • Crée rôle PostgreSQL q2h (mdp aléatoire)
  │     • Crée base qualys2human + active pgcrypto
  │     • Lance Alembic upgrade head
  │     • Crée l'utilisateur admin avec le mdp saisi
  │
  ├─► service.py
  │     • Génère WinSW XML config (Qualys2Human.xml)
  │     • Commande : python\python.exe -m q2h.service
  │     • Working dir : C:\Q2H\app\backend
  │     • Démarrage auto, restart on failure
  │     • Installe et démarre le service
  │
  └─► Vérification finale
        • Health check : GET https://localhost:{port}/api/health
        • Affiche URL d'accès + rappel changement mdp
        • Log complet dans install.log
```

### Gestion des erreurs

Chaque étape affiche `[OK]` ou `[ERREUR]` avec un message explicatif. En cas d'erreur, l'installeur s'arrête immédiatement. Un fichier `install.log` capture toute la sortie pour diagnostic.

---

## 5. Flux de mise à jour

```
upgrade.bat
  │  Vérifie droits admin + installation existante
  │  Lance python\python.exe installer\upgrade.py
  ▼
upgrade.py
  │
  ├─► Backup automatique
  │     • Stoppe le service Qualys2Human
  │     • Sauvegarde : config.yaml, certs/, keys/, data/branding/
  │     • pg_dump de la base qualys2human
  │     • Tout dans C:\Q2H\backups\YYYY-MM-DD-HHmm\
  │
  ├─► Mise à jour des fichiers
  │     • Remplace app/ et python/
  │     • Préserve config.yaml, certs/, keys/, data/
  │
  ├─► Migration DB
  │     • Alembic upgrade head
  │     • Si échec → rollback via backup
  │
  └─► Redémarrage + vérification
        • Démarre le service
        • Health check
        • Si échec → rollback complet
```

---

## 6. Flux de désinstallation

```
uninstall.bat
  │  Vérifie droits admin
  │  Lance python\python.exe installer\uninstall.py
  ▼
uninstall.py
  │
  ├─► Confirmation : "Voulez-vous conserver la base de données ?"
  │
  ├─► Stoppe et supprime le service Qualys2Human (WinSW)
  │
  ├─► Si "supprimer la DB" :
  │     • DROP DATABASE qualys2human
  │     • DROP ROLE q2h
  │     (PostgreSQL lui-même reste installé)
  │
  └─► Supprime le dossier C:\Q2H\
```

---

## 7. WinSW — Configuration du service

WinSW utilise un fichier XML pour décrire le service. Il sera généré par `installer/service.py` :

```xml
<service>
  <id>Qualys2Human</id>
  <name>Qualys2Human</name>
  <description>Qualys2Human vulnerability dashboard</description>
  <executable>C:\Q2H\python\python.exe</executable>
  <arguments>-m q2h.service</arguments>
  <workingdirectory>C:\Q2H\app\backend</workingdirectory>
  <startmode>Automatic</startmode>
  <onfailure action="restart" delay="10 sec" />
  <onfailure action="restart" delay="30 sec" />
  <onfailure action="none" />
  <log mode="roll-by-size">
    <sizeThreshold>10240</sizeThreshold>
    <keepFiles>5</keepFiles>
  </log>
  <env name="Q2H_CONFIG" value="C:\Q2H\config.yaml" />
</service>
```

Commandes :
- `WinSW-x64.exe install Qualys2Human.xml` — installe le service
- `WinSW-x64.exe start Qualys2Human.xml` — démarre
- `WinSW-x64.exe stop Qualys2Human.xml` — stoppe
- `WinSW-x64.exe uninstall Qualys2Human.xml` — désinstalle

---

## 8. Pipeline de build (machine de dev)

Le développeur produit le livrable depuis sa machine de dev (qui a Python 3.12, Node.js 20+, 7-Zip).

### scripts/build.py (amélioré)

1. Compile le frontend React : `npm install && vite build`
2. Copie le backend source + alembic
3. Prépare Python embedded :
   - Décompresse `prerequisites/python-embed/python-3.12.x-embed-amd64.zip`
   - Active pip dans l'embedded Python (uncomment `import site` dans `python312._pth`)
   - Installe les dépendances backend dans `python/Lib/site-packages/`
4. Copie les data assets (branding)
5. Output : `dist/`

### scripts/package.py (amélioré)

1. Appelle `build.py` si nécessaire
2. Assemble la structure finale (dist/ + installer/ + prerequisites/ + VERSION)
3. Crée le `.zip`
4. Crée le `.exe` SFX via 7-Zip :
   ```
   copy /b 7zS2.sfx + config.txt + archive.7z Qualys2Human-1.0.0.exe
   ```
5. Output : `Qualys2Human-1.0.0.exe`

---

## 9. Structure installée sur le serveur

```
C:\Q2H\                              (configurable à l'installation)
├── python\                          # Python 3.12 embedded
├── app\
│   ├── backend\
│   │   ├── src\q2h\                 # Code applicatif
│   │   ├── alembic\                 # Migrations DB
│   │   └── alembic.ini
│   └── frontend\                    # Fichiers statiques
├── data\
│   └── branding\                    # Logo, settings
├── certs\
│   ├── server.crt                   # Certificat TLS
│   └── server.key
├── keys\
│   └── master.key                   # Clé de chiffrement (DPAPI)
├── logs\
│   └── q2h.log                      # Logs applicatifs
├── backups\                         # Backups auto (upgrade)
├── config.yaml                      # Configuration
├── Qualys2Human.xml                 # Config WinSW
└── WinSW-x64.exe                    # Service manager
```

---

## 10. Modules installer/ — responsabilités

| Module | Responsabilité |
|--------|---------------|
| `utils.py` | Logging (fichier + console), prompts interactifs, génération mots de passe aléatoires, vérification version Windows |
| `prereqs.py` | Vérif OS/disque/port, install silencieux PostgreSQL, copie WinSW, génération certificat TLS auto-signé |
| `config.py` | Génération config.yaml (YAML templating), génération JWT secret, création master key DPAPI |
| `database.py` | Connexion PostgreSQL via psql, CREATE ROLE/DATABASE, pgcrypto, Alembic migrations, seed admin user |
| `service.py` | Génération XML WinSW, installation/démarrage/arrêt/suppression du service |
| `setup.py` | Orchestrateur : banner, prompts, appelle les modules dans l'ordre, health check final, log |
| `upgrade.py` | Arrêt service, backup (config + DB), remplacement fichiers, migrations, redémarrage, rollback si échec |
| `uninstall.py` | Arrêt service, suppression service, drop DB optionnel, suppression fichiers |

---

## 11. Sécurité

- Mot de passe admin : **obligatoire** à l'installation (jamais de défaut faible en production)
- Mot de passe DB q2h : **généré aléatoirement** (32 caractères), jamais exposé à l'utilisateur
- JWT secret : **généré aléatoirement** (64 caractères)
- Master key : protégée par DPAPI Windows
- Certificat TLS : auto-signé par défaut, remplaçable
- `install.bat` : vérifie les droits administrateur

---

## 12. Préparation Linux (V2)

Le code sera structuré pour faciliter le support Linux :
- Modules séparés par responsabilité (pas de hardcode Windows)
- `service.py` : abstraction pour WinSW (Windows) vs systemd (Linux)
- `prereqs.py` : détection OS pour adapter les commandes
- Les paths utilisent `pathlib.Path` (cross-platform)
