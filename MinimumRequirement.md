# Qualys2Human — Configuration minimale requise

## Serveur cible

| Composant | Minimum | Recommandé |
|-----------|---------|------------|
| **OS** | Windows Server 2019 | Windows Server 2022 |
| **CPU** | 4 cores | 8 cores |
| **RAM** | 8 Go | 16 Go |
| **Disque** | 50 Go libres | 100 Go SSD |
| **Réseau** | 100 Mbps | 1 Gbps |

## Logiciels requis

| Logiciel | Version minimale | Notes |
|----------|-----------------|-------|
| **Python** | 3.12 | Inclus dans le package offline (embedded) |
| **PostgreSQL** | 16 | Portable ou installé en service |
| **NSSM** | 2.24+ | Pour le service Windows |
| **Node.js** | 18+ | Uniquement pour le développement |

## Dimensionnement

### Petite installation (< 5 000 serveurs/rapport)

- 4 CPU, 8 Go RAM
- PostgreSQL avec 100 connexions max
- ~5 Go de stockage par an de rapports

### Installation moyenne (5 000 - 20 000 serveurs/rapport)

- 8 CPU, 16 Go RAM
- PostgreSQL avec 200 connexions max, shared_buffers = 4 Go
- ~20 Go de stockage par an

### Grande installation (20 000 - 50 000 serveurs/rapport)

- 8+ CPU, 32 Go RAM
- PostgreSQL dédié, shared_buffers = 8 Go, work_mem = 256 Mo
- ~50 Go de stockage par an
- Envisager un disque SSD NVMe pour la base

## Réseau

| Port | Protocole | Usage |
|------|-----------|-------|
| **8443** | HTTPS | Interface web (configurable) |
| **5432** | TCP | PostgreSQL (local uniquement par défaut) |

## Sécurité

- **TLS** : Certificat requis pour la production (auto-signé ou PKI entreprise)
- **Authentification** : JWT (HS256) — AD (LDAPS/Kerberos) prévu
- **Chiffrement DB** : pgcrypto + clé maître AES-256 (protection DPAPI)
- **Réseau** : Fonctionnement 100% offline (air-gapped compatible)

## Navigateurs supportés

| Navigateur | Version minimale |
|------------|-----------------|
| Chrome / Edge | 90+ |
| Firefox | 90+ |
| Safari | 15+ |

## Utilisateurs concurrents

- Charge testée : 10-50 utilisateurs simultanés
- Pool de connexions DB : 20 par défaut (configurable)
- Recommandation : 1 Go RAM par tranche de 10 utilisateurs actifs

## Fichiers CSV Qualys

- **Taille max testée** : 2 Go par fichier
- **Format** : CSV Qualys standard (en-tête + résumé hôtes + détails)
- **Encodage** : UTF-8 ou Latin-1 (détection automatique)
- **Colonnes** : ~37 colonnes standard Qualys (IP, QID, Title, Severity, etc.)
