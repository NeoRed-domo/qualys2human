import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Tag, Row, Col, Spin, Alert, Button, Typography, Divider } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import api from '../api/client';
import ExportButtons from '../components/ExportButtons';

const { Paragraph } = Typography;

const SEVERITY_TAG: Record<number, { color: string; label: string }> = {
  5: { color: 'red', label: 'Urgent (5)' },
  4: { color: 'orange', label: 'Critique (4)' },
  3: { color: 'gold', label: 'Sérieux (3)' },
  2: { color: 'blue', label: 'Moyen (2)' },
  1: { color: 'green', label: 'Minimal (1)' },
};

interface FullDetailData {
  ip: string;
  dns: string | null;
  os: string | null;
  qid: number;
  title: string;
  severity: number;
  type: string | null;
  category: string | null;
  vuln_status: string | null;
  port: number | null;
  protocol: string | null;
  fqdn: string | null;
  ssl: boolean | null;
  first_detected: string | null;
  last_detected: string | null;
  times_detected: number | null;
  date_last_fixed: string | null;
  cve_ids: string[] | null;
  vendor_reference: string | null;
  bugtraq_id: string | null;
  cvss_base: string | null;
  cvss_temporal: string | null;
  cvss3_base: string | null;
  cvss3_temporal: string | null;
  threat: string | null;
  impact: string | null;
  solution: string | null;
  results: string | null;
  pci_vuln: boolean | null;
  ticket_state: string | null;
  tracking_method: string | null;
}

function TextBlock({ title, content }: { title: string; content: string | null }) {
  if (!content) return null;
  return (
    <Card title={title} size="small" style={{ marginBottom: 16 }}>
      <Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{content}</Paragraph>
    </Card>
  );
}

export default function FullDetail() {
  const { ip, qid } = useParams<{ ip: string; qid: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<FullDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ip || !qid) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const resp = await api.get(`/hosts/${ip}/vulnerabilities/${qid}`);
        if (!cancelled) setData(resp.data);
      } catch (err: any) {
        if (!cancelled) setError(err.response?.data?.detail || 'Erreur de chargement');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [ip, qid]);

  if (loading) return <Spin style={{ display: 'block', margin: '80px auto' }} size="large" />;
  if (error) return <Alert message="Erreur" description={error} type="error" showIcon />;
  if (!data) return null;

  const tag = SEVERITY_TAG[data.severity];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Button icon={<ArrowLeftOutlined />} type="link" onClick={() => navigate(-1)} style={{ padding: 0 }}>
          Retour
        </Button>
        <ExportButtons queryString={`view=detail&ip=${ip}&qid=${qid}`} />
      </div>

      <Card
        title={
          <span>
            {data.ip} — QID {data.qid}: {data.title}{' '}
            {tag && <Tag color={tag.color}>{tag.label}</Tag>}
          </span>
        }
        style={{ marginBottom: 16 }}
      >
        <Descriptions column={{ xs: 1, sm: 2, lg: 3 }} size="small" bordered>
          <Descriptions.Item label="IP">{data.ip}</Descriptions.Item>
          <Descriptions.Item label="DNS">{data.dns || '—'}</Descriptions.Item>
          <Descriptions.Item label="OS">{data.os || '—'}</Descriptions.Item>
          <Descriptions.Item label="QID">{data.qid}</Descriptions.Item>
          <Descriptions.Item label="Type">{data.type || '—'}</Descriptions.Item>
          <Descriptions.Item label="Catégorie">{data.category || '—'}</Descriptions.Item>
          <Descriptions.Item label="Statut">{data.vuln_status || '—'}</Descriptions.Item>
          <Descriptions.Item label="Port">{data.port ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Protocole">{data.protocol || '—'}</Descriptions.Item>
          <Descriptions.Item label="FQDN">{data.fqdn || '—'}</Descriptions.Item>
          <Descriptions.Item label="SSL">{data.ssl != null ? (data.ssl ? 'Oui' : 'Non') : '—'}</Descriptions.Item>
          <Descriptions.Item label="Méthode de suivi">{data.tracking_method || '—'}</Descriptions.Item>

          <Divider />

          <Descriptions.Item label="Première détection">{data.first_detected || '—'}</Descriptions.Item>
          <Descriptions.Item label="Dernière détection">{data.last_detected || '—'}</Descriptions.Item>
          <Descriptions.Item label="Nb détections">{data.times_detected ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Dernière correction">{data.date_last_fixed || '—'}</Descriptions.Item>
          <Descriptions.Item label="Ticket">{data.ticket_state || '—'}</Descriptions.Item>
          <Descriptions.Item label="PCI">{data.pci_vuln != null ? (data.pci_vuln ? 'Oui' : 'Non') : '—'}</Descriptions.Item>

          <Divider />

          <Descriptions.Item label="CVSS Base">{data.cvss_base || '—'}</Descriptions.Item>
          <Descriptions.Item label="CVSS Temporal">{data.cvss_temporal || '—'}</Descriptions.Item>
          <Descriptions.Item label="CVSS3 Base">{data.cvss3_base || '—'}</Descriptions.Item>
          <Descriptions.Item label="CVSS3 Temporal">{data.cvss3_temporal || '—'}</Descriptions.Item>
          <Descriptions.Item label="Référence vendeur">{data.vendor_reference || '—'}</Descriptions.Item>
          <Descriptions.Item label="Bugtraq ID">{data.bugtraq_id || '—'}</Descriptions.Item>

          <Descriptions.Item label="CVE" span={3}>
            {data.cve_ids?.length
              ? data.cve_ids.map((cve) => <Tag key={cve}>{cve}</Tag>)
              : '—'
            }
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <TextBlock title="Menace" content={data.threat} />
        </Col>
        <Col xs={24} lg={8}>
          <TextBlock title="Impact" content={data.impact} />
        </Col>
        <Col xs={24} lg={8}>
          <TextBlock title="Solution" content={data.solution} />
        </Col>
      </Row>

      <TextBlock title="Résultats du scan" content={data.results} />
    </div>
  );
}
