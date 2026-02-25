import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Tag, Row, Col, Spin, Alert, Button, Typography } from 'antd';
import { ArrowLeftOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, type ColDef } from 'ag-grid-community';
import api from '../api/client';
import ExportButtons from '../components/ExportButtons';

ModuleRegistry.registerModules([AllCommunityModule]);

const SEVERITY_TAG: Record<number, { color: string; label: string }> = {
  5: { color: 'red', label: 'Urgent (5)' },
  4: { color: 'orange', label: 'Critique (4)' },
  3: { color: 'gold', label: 'Sérieux (3)' },
  2: { color: 'blue', label: 'Moyen (2)' },
  1: { color: 'green', label: 'Minimal (1)' },
};

const TRACKING_COLORS = ['#1677ff', '#52c41a', '#faad14', '#cf1322', '#722ed1', '#8c8c8c'];

interface VulnInfo {
  qid: number;
  title: string;
  severity: number;
  type: string | null;
  category: string | null;
  cvss_base: string | null;
  cvss3_base: string | null;
  threat: string | null;
  impact: string | null;
  solution: string | null;
  vendor_reference: string | null;
  cve_ids: string[] | null;
  affected_host_count: number;
  total_occurrences: number;
}

interface HostRow {
  ip: string;
  dns: string | null;
  os: string | null;
  port: number | null;
  protocol: string | null;
  vuln_status: string | null;
  first_detected: string | null;
  last_detected: string | null;
}

export default function VulnDetail() {
  const { qid } = useParams<{ qid: string }>();
  const navigate = useNavigate();
  const [info, setInfo] = useState<VulnInfo | null>(null);
  const [hosts, setHosts] = useState<HostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  useEffect(() => {
    if (!qid) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [infoResp, hostsResp] = await Promise.all([
          api.get(`/vulnerabilities/${qid}`),
          api.get(`/vulnerabilities/${qid}/hosts?page_size=500`),
        ]);
        if (!cancelled) {
          setInfo(infoResp.data);
          setHosts(hostsResp.data.items);
        }
      } catch (err: any) {
        if (!cancelled) setError(err.response?.data?.detail || 'Erreur de chargement');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [qid]);

  if (loading) return <Spin style={{ display: 'block', margin: '80px auto' }} size="large" />;
  if (error) return <Alert message="Erreur" description={error} type="error" showIcon />;
  if (!info) return null;

  const tag = SEVERITY_TAG[info.severity];

  // Tracking method distribution from hosts
  const trackingMap: Record<string, number> = {};
  hosts.forEach((h) => {
    const key = h.vuln_status || 'Inconnu';
    trackingMap[key] = (trackingMap[key] || 0) + 1;
  });
  const trackingData = Object.entries(trackingMap).map(([name, value]) => ({ name, value }));

  // Filter hosts by selected pie slice
  const filteredHosts = statusFilter
    ? hosts.filter((h) => (h.vuln_status || 'Inconnu') === statusFilter)
    : hosts;

  const hostCols: ColDef<HostRow>[] = [
    { field: 'ip', headerName: 'IP', width: 140 },
    { field: 'dns', headerName: 'DNS', flex: 1, minWidth: 180 },
    { field: 'os', headerName: 'OS', flex: 1, minWidth: 150 },
    { field: 'port', headerName: 'Port', width: 80 },
    { field: 'protocol', headerName: 'Proto', width: 80 },
    { field: 'vuln_status', headerName: 'Statut', width: 120 },
    { field: 'last_detected', headerName: 'Dernière détection', width: 160 },
  ];

  const tableTitle = statusFilter
    ? (
      <span>
        Serveurs affectés — filtre : <Tag color="blue" closable onClose={() => setStatusFilter(null)}>{statusFilter}</Tag>
      </span>
    )
    : 'Serveurs affectés';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Button icon={<ArrowLeftOutlined />} type="link" onClick={() => navigate(-1)} style={{ padding: 0 }}>
          Retour
        </Button>
        <ExportButtons queryString={`view=vulnerability&qid=${qid}`} />
      </div>

      <Card
        title={
          <span>
            QID {info.qid} — {info.title}{' '}
            {tag && <Tag color={tag.color}>{tag.label}</Tag>}
          </span>
        }
        style={{ marginBottom: 16 }}
      >
        <Descriptions column={{ xs: 1, sm: 2, lg: 3 }} size="small">
          <Descriptions.Item label="Type">{info.type || '—'}</Descriptions.Item>
          <Descriptions.Item label="Catégorie">{info.category || '—'}</Descriptions.Item>
          <Descriptions.Item label="CVSS Base">{info.cvss_base || '—'}</Descriptions.Item>
          <Descriptions.Item label="CVSS3 Base">{info.cvss3_base || '—'}</Descriptions.Item>
          <Descriptions.Item label="Hôtes affectés">{info.affected_host_count}</Descriptions.Item>
          <Descriptions.Item label="Occurrences totales">{info.total_occurrences}</Descriptions.Item>
          <Descriptions.Item label="Référence vendeur">{info.vendor_reference || '—'}</Descriptions.Item>
          <Descriptions.Item label="CVE" span={2}>
            {info.cve_ids?.length ? info.cve_ids.join(', ') : '—'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {(info.threat || info.impact || info.solution) && (
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          {info.threat && (
            <Col xs={24} lg={8}>
              <Card title="Menace" size="small">
                <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                  {info.threat}
                </Typography.Paragraph>
              </Card>
            </Col>
          )}
          {info.impact && (
            <Col xs={24} lg={8}>
              <Card title="Impact" size="small">
                <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                  {info.impact}
                </Typography.Paragraph>
              </Card>
            </Col>
          )}
          {info.solution && (
            <Col xs={24} lg={8}>
              <Card title="Solution" size="small">
                <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                  {info.solution}
                </Typography.Paragraph>
              </Card>
            </Col>
          )}
        </Row>
      )}

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={16}>
          <Card title={tableTitle} size="small">
            <div style={{ height: 360 }}>
              <AgGridReact<HostRow>
                rowData={filteredHosts}
                columnDefs={hostCols}
                domLayout="normal"
                rowHeight={36}
                headerHeight={38}
                onRowClicked={(e) => {
                  if (e.data) navigate(`/hosts/${e.data.ip}`);
                }}
                rowStyle={{ cursor: 'pointer' }}
              />
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          {trackingData.length > 0 && (
            <Card title="Statut de détection" size="small">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={trackingData}
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    dataKey="value"
                    nameKey="name"
                    label
                    onClick={(entry) => {
                      setStatusFilter((prev) => prev === entry.name ? null : entry.name);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {trackingData.map((_, i) => (
                      <Cell key={i} fill={TRACKING_COLORS[i % TRACKING_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
              {statusFilter && (
                <div style={{ textAlign: 'center', marginTop: 4 }}>
                  <Button size="small" icon={<CloseCircleOutlined />} onClick={() => setStatusFilter(null)}>
                    Réinitialiser
                  </Button>
                </div>
              )}
            </Card>
          )}
        </Col>
      </Row>
    </div>
  );
}
