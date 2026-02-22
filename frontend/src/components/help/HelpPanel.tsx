import { Drawer, Typography, Divider } from 'antd';

const { Title, Paragraph, Text } = Typography;

export type HelpTopic =
  | 'overview'
  | 'vuln-detail'
  | 'host-detail'
  | 'full-detail'
  | 'trends'
  | 'admin-imports'
  | 'admin-users'
  | 'admin-rules'
  | 'admin-branding'
  | 'monitoring'
  | 'filters';

const HELP_CONTENT: Record<HelpTopic, { title: string; content: React.ReactNode }> = {
  overview: {
    title: 'Tableau de bord',
    content: (
      <>
        <Paragraph>
          Le tableau de bord affiche un résumé de l'état de sécurité de votre parc.
        </Paragraph>
        <Title level={5}>Indicateurs clés (KPI)</Title>
        <Paragraph>
          <Text strong>Vulnérabilités totales</Text> — Nombre total de vulnérabilités détectées.<br />
          <Text strong>Serveurs</Text> — Nombre d'hôtes uniques analysés.<br />
          <Text strong>Critiques</Text> — Vulnérabilités de sévérité 4 et 5.<br />
          <Text strong>Cohérence</Text> — Vérifie que les données du rapport sont cohérentes.
        </Paragraph>
        <Title level={5}>Widgets</Title>
        <Paragraph>
          Vous pouvez réorganiser les widgets par glisser-déposer (drag & drop).
          Cliquez sur le bouton "Disposition par défaut" pour réinitialiser.
          Votre disposition est sauvegardée automatiquement.
        </Paragraph>
        <Title level={5}>Filtres</Title>
        <Paragraph>
          Utilisez la barre de filtres pour restreindre les données par sévérité,
          type de vulnérabilité, ou plage de dates.
        </Paragraph>
      </>
    ),
  },
  'vuln-detail': {
    title: 'Détail vulnérabilité',
    content: (
      <>
        <Paragraph>
          Cette page affiche les détails d'une vulnérabilité spécifique (QID).
        </Paragraph>
        <Paragraph>
          <Text strong>Informations</Text> — Type, catégorie, scores CVSS, références CVE.<br />
          <Text strong>Menace / Impact / Solution</Text> — Descriptions détaillées de Qualys.<br />
          <Text strong>Serveurs affectés</Text> — Liste des hôtes où cette vulnérabilité est présente.
          Cliquez sur une ligne pour voir le détail de l'hôte.
        </Paragraph>
      </>
    ),
  },
  'host-detail': {
    title: 'Détail hôte',
    content: (
      <>
        <Paragraph>
          Cette page affiche les informations d'un hôte et la liste de ses vulnérabilités.
        </Paragraph>
        <Paragraph>
          <Text strong>Graphique sévérités</Text> — Répartition des vulnérabilités par niveau.<br />
          <Text strong>Méthodes de suivi</Text> — Répartition par méthode de détection.<br />
          <Text strong>Tableau</Text> — Cliquez sur une vulnérabilité pour voir le détail complet.
        </Paragraph>
      </>
    ),
  },
  'full-detail': {
    title: 'Détail complet',
    content: (
      <>
        <Paragraph>
          Vue complète d'une vulnérabilité sur un hôte spécifique avec tous les champs
          bruts du rapport Qualys (~30 champs).
        </Paragraph>
        <Paragraph>
          Inclut les dates de détection, scores CVSS, références CVE, état du ticket,
          et les textes complets de menace, impact et solution.
        </Paragraph>
      </>
    ),
  },
  trends: {
    title: 'Tendances',
    content: (
      <>
        <Paragraph>
          Analysez l'évolution temporelle des métriques de sécurité.
        </Paragraph>
        <Title level={5}>Constructeur</Title>
        <Paragraph>
          <Text strong>Métrique</Text> — total_vulns, critical_count, ou host_count.<br />
          <Text strong>Grouper par</Text> — Optionnel : sévérité, catégorie, ou type.<br />
          <Text strong>Période</Text> — Plage de dates à analyser.
        </Paragraph>
        <Title level={5}>Modèles</Title>
        <Paragraph>
          Les administrateurs peuvent créer des modèles prédéfinis que tous les
          utilisateurs peuvent exécuter en un clic.
        </Paragraph>
      </>
    ),
  },
  'admin-imports': {
    title: 'Gestion des imports',
    content: (
      <>
        <Paragraph>
          Gérez les imports de rapports CSV Qualys.
        </Paragraph>
        <Paragraph>
          <Text strong>Import manuel</Text> — Cliquez sur "Importer un CSV" pour uploader un fichier.<br />
          <Text strong>Import automatique</Text> — Configurez le file watcher dans config.yaml pour
          surveiller des dossiers et importer automatiquement les nouveaux fichiers.<br />
          <Text strong>Historique</Text> — Consultez le statut de chaque import (en cours, terminé, erreur).
        </Paragraph>
      </>
    ),
  },
  'admin-users': {
    title: 'Gestion des utilisateurs',
    content: (
      <>
        <Paragraph>
          Créez, modifiez et supprimez les comptes utilisateurs.
        </Paragraph>
        <Paragraph>
          <Text strong>Profils</Text> — admin (accès complet), user (dashboard + export),
          monitoring (monitoring + dashboard).<br />
          <Text strong>Désactivation</Text> — Désactivez un compte sans le supprimer.<br />
          <Text strong>Mot de passe</Text> — Forcez le changement à la prochaine connexion.
        </Paragraph>
      </>
    ),
  },
  'admin-rules': {
    title: 'Règles entreprise',
    content: (
      <>
        <Paragraph>
          Définissez les filtres par défaut appliqués à tous les utilisateurs.
        </Paragraph>
        <Paragraph>
          <Text strong>Sévérités</Text> — Cochez les niveaux visibles par défaut (1 à 5).<br />
          <Text strong>Types</Text> — Filtrez par type de vulnérabilité (Vuln, Practice, Info).
          Si aucun type n'est sélectionné, tous sont affichés.
        </Paragraph>
      </>
    ),
  },
  'admin-branding': {
    title: 'Branding',
    content: (
      <>
        <Paragraph>
          Personnalisez le logo de l'application.
        </Paragraph>
        <Paragraph>
          <Text strong>Formats</Text> — SVG, PNG, JPG (max 500 Ko).<br />
          <Text strong>Taille recommandée</Text> — 200x50 pixels.<br />
          <Text strong>Gabarit</Text> — Téléchargez le template SVG pour créer votre logo.
        </Paragraph>
      </>
    ),
  },
  monitoring: {
    title: 'Monitoring',
    content: (
      <>
        <Paragraph>
          Surveillez la santé de l'application et du serveur.
        </Paragraph>
        <Paragraph>
          <Text strong>Services</Text> — État de PostgreSQL et de l'API.<br />
          <Text strong>Ressources</Text> — CPU, mémoire et disque avec seuils d'alerte.<br />
          <Text strong>Pool DB</Text> — Connexions actives et disponibles.<br />
          <Text strong>Alertes</Text> — Notifications automatiques si un seuil est dépassé
          (CPU/RAM/disque &gt; 80% = avertissement, &gt; 95% = critique).
        </Paragraph>
        <Paragraph>
          La page se rafraîchit automatiquement toutes les 30 secondes.
        </Paragraph>
      </>
    ),
  },
  filters: {
    title: 'Filtres',
    content: (
      <>
        <Paragraph>
          La barre de filtres permet de restreindre les données affichées.
        </Paragraph>
        <Paragraph>
          <Text strong>Sévérité</Text> — Cochez les niveaux à afficher (1=Minimal à 5=Urgent).<br />
          <Text strong>Type</Text> — Filtrez par type (Vuln, Practice, Info).<br />
          <Text strong>Dates</Text> — Restreignez à une plage de dates d'import.
        </Paragraph>
        <Paragraph>
          Les filtres s'appliquent en temps réel sur le tableau de bord et les exports.
        </Paragraph>
      </>
    ),
  },
};

interface HelpPanelProps {
  topic: HelpTopic | null;
  open: boolean;
  onClose: () => void;
}

export default function HelpPanel({ topic, open, onClose }: HelpPanelProps) {
  const help = topic ? HELP_CONTENT[topic] : null;

  return (
    <Drawer
      title={help?.title || 'Aide'}
      placement="right"
      width={420}
      open={open}
      onClose={onClose}
    >
      {help ? (
        <Typography>{help.content}</Typography>
      ) : (
        <Paragraph>Sélectionnez une section pour afficher l'aide.</Paragraph>
      )}
      <Divider />
      <Paragraph type="secondary" style={{ fontSize: 12 }}>
        Qualys2Human v1.0.0 — NeoRed
      </Paragraph>
    </Drawer>
  );
}
