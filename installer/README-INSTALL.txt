=====================================================
  Qualys2Human - Guide d'installation rapide
  NeoRed (c) 2026
=====================================================

PREREQUIS
---------
- Windows Server 2019 ou superieur
- Python 3.12+ (inclus dans prerequisites/ ou installe separement)
- PostgreSQL 16+ (installe et demarre)
- NSSM (Non-Sucking Service Manager) pour le service Windows
  (inclus dans prerequisites/ ou telecharge depuis nssm.cc)

INSTALLATION
------------
1. Extraire l'archive dans un dossier temporaire

2. Executer l'installateur en tant qu'administrateur:
   > install.bat

3. Suivre les instructions a l'ecran:
   - Repertoire d'installation (defaut: C:\Qualys2Human)
   - Connexion PostgreSQL (hote, port, base, utilisateur, mot de passe)
   - Port de l'application (defaut: 8443)
   - Nom du service Windows (defaut: Qualys2Human)

4. L'installateur va:
   - Copier les fichiers dans le repertoire choisi
   - Generer la configuration (config.yaml)
   - Executer les migrations de base de donnees
   - Creer le service Windows via NSSM

PREMIER LANCEMENT
-----------------
- Demarrer le service: nssm start Qualys2Human
- Ouvrir dans un navigateur: https://localhost:8443
- Identifiants par defaut:
    Utilisateur: admin
    Mot de passe: Qualys2Human!
- IMPORTANT: Changez le mot de passe a la premiere connexion!

CONFIGURATION
-------------
Le fichier de configuration se trouve dans:
  <repertoire>\backend\config.yaml

Sections principales:
- server: port, certificats TLS
- database: connexion PostgreSQL
- watcher: surveillance automatique de dossiers pour import CSV

FILE WATCHER (Import automatique)
---------------------------------
Pour activer l'import automatique de fichiers CSV:
1. Editer config.yaml
2. Mettre watcher.enabled a true
3. Ajouter les chemins a surveiller dans watcher.paths
4. Redemarrer le service

CERTIFICATS TLS
---------------
Par defaut, l'application cherche:
  ./certs/server.crt
  ./certs/server.key

Generez un certificat auto-signe ou utilisez un certificat d'entreprise.

SUPPORT
-------
Repository: https://github.com/NeoRed-domo/Qualys2Human
