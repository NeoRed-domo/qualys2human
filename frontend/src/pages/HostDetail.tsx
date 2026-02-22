import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Tag, Row, Col, Spin, Alert, Button } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, type ColDef } from 'ag-grid-community';
import api from '../api/client';
import ExportButtons from '../components/ExportButtons';

ModuleRegistry.registerModules([AllCommunityModule]);

const SEVERITY_COLORS: Record<number, string> = {
  5: '#cf1322', 4: '#fa541c', 3: '#faad14', 2: '#1677ff', 1: '#52c41a',
};
const SEVERITY_LABELS: Record<number, string> = {
  5: 'Urgent (5)', 4: 'Critique (4)', 3: 'Sérieux (3)', 2: 'Moyen (2)', 1: 'Minimal (1)',
};
const SEVERITY_TAG: Record<number, { color: string; label: string }> = {
  5: { color: 'red', label: 'Urgent' }, 4: { color: 'orange', label: 'Critique' },
  3: { color: 'gold', label: 'Sérieux' }, 2: { color: 'blue', label: 'Moyen' },
  1: { color: 'green', label: 'Minimal' },
};
const TRACKING_COLORS = ['#1677ff', '#52c41a', '#faad14', '#cf1322', '#722ed1', '#8c8c8c'];

interface HostInfo {
  ip: string;
  dns: string | null;
  netbios: string | null;
  os: string | null;
  os_cpe: string | null;
  first_seen: string | null;
  last_seen: string | null;
  vuln_count: number;
}

interface VulnRow {
  qid: number;
  title: string;
  severity: number;
  type: string | null;
  category: string | null;
  vuln_status: string | null;
  port: number | null;
  protocol: string | null;
  first_detected: string | null;
  last_detected: string | null;
  tracking_method: string | null;
}

export default function HostDetail() {
  const { ip } = useParams<{ ip: string }>();
  const navigate = useNavigate();
  const [info, setInfo] = useState<HostInfo | null>(null);
  const [vulns, setVulns] = useState<VulnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ip) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [infoResp, vulnsResp] = await Promise.all([
          api.get(`/hosts/${ip}`),
          api.get(`/hosts/${ip}/vulnerabilities?page_size=500`),
        ]);
        if (!cancelled) {
          setInfo(infoResp.data);
          setVulns(vulnsResp.data.items);
        }
      } catch (err: any) {
        if (!cancelled) setError(err.response?.data?.detail || 'Erreur de chargement');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [ip]);

  if (loading) return <Spin style={{ display: 'block', margin: '80px auto' }} size="large" />;
  if (error) return <Alert message="Erreur" description={error} type="error" showIcon />;
  if (!info) return null;

  // Severity distribution for this host
  const sevMap: Record<number, number> = {};
  vulns.forEach((v) => { sevMap[v.severity] = (sevMap[v.severity] || 0) + 1; });
  const sevData = Object.entries(sevMap)
    .map(([sev, count]) => ({
      name: SEVERITY_LABELS[Number(sev)] || `Sev ${sev}`,
      value: count,
      severity: Number(sev),
    }))
    .sort((a, b) => b.severity - a.severity);

  // Tracking method distribution
  const trackMap: Record<string, number> = {};
  vulns.forEach((v) => {
    const key = v.tracking_method || 'Inconnu';
    trackMap[key] = (trackMap[key] || 0) + 1;
  });
  const trackData = Object.entries(trackMap).map(([name, value]) => ({ name, value }));

  const vulnCols: ColDef<VulnRow>[] = [
    { field: 'qid', headerName: 'QID', width: 90 },
    { field: 'title', headerName: 'Titre', flex: 1, minWidth: 200 },
    {
      field: 'severity', headerName: 'Sévérité', width: 120,
      cellRenderer: (p: any) => {
        const t = SEVERITY_TAG[p.value];
        return t ? <Tag color={t.color}>{t.label}</Tag> : p.value;
      },
      sort: 'desc',
    },
    { field: 'category', headerName: 'Catégorie', width: 140 },
    { field: 'port', headerName: 'Port', width: 80 },
    { field: 'vuln_status', headerName: 'Statut', width: 110 },
    { field: 'last_detected', headerName: 'Dernière détection', width: 160 },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Button icon={<ArrowLeftOutlined />} type="link" onClick={() => navigate(-1)} style={{ padding: 0 }}>
          Retour
        </Button>
        <ExportButtons queryString={`view=host&ip=${ip}`} />
      </div>

      <Card title={`Hôte ${info.ip}`} style={{ marginBottom: 16 }}>
        <Descriptions column={{ xs: 1, sm: 2, lg: 3 }} size="small">
          <Descriptions.Item label="IP">{info.ip}</Descriptions.Item>
          <Descriptions.Item label="DNS">{info.dns || '—'}</Descriptions.Item>
          <Descriptions.Item label="NetBIOS">{info.netbios || '—'}</Descriptions.Item>
          <Descriptions.Item label="OS">{info.os || '—'}</Descriptions.Item>
          <Descriptions.Item label="OS CPE">{info.os_cpe || '—'}</Descriptions.Item>
          <Descriptions.Item label="Vulnérabilités">{info.vuln_count}</Descriptions.Item>
          <Descriptions.Item label="Premier scan">{info.first_seen || '—'}</Descriptions.Item>
          <Descriptions.Item label="Dernier scan">{info.last_seen || '—'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="Sévérités" size="small">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={sevData} cx="50%" cy="50%" innerRadius={50} outerRadius={85} dataKey="value" nameKey="name">
                  {sevData.map((entry, i) => (
                    <Cell key={i} fill={SEVERITY_COLORS[entry.severity] || '#8c8c8c'} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          {trackData.length > 0 && (
            <Card title="Méthodes de suivi" size="small">
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={trackData} cx="50%" cy="50%" outerRadius={85} dataKey="value" nameKey="name" label>
                    {trackData.map((_, i) => (
                      <Cell key={i} fill={TRACKING_COLORS[i % TRACKING_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          )}
        </Col>
      </Row>

      <Card title="Vulnérabilités" size="small">
        <div style={{ height: 400 }}>
          <AgGridReact<VulnRow>
            rowData={vulns}
            columnDefs={vulnCols}
            domLayout="normal"
            rowHeight={36}
            headerHeight={38}
            onRowClicked={(e) => {
              if (e.data && ip) navigate(`/hosts/${ip}/vulnerabilities/${e.data.qid}`);
            }}
            rowStyle={{ cursor: 'pointer' }}
          />
        </div>
      </Card>
    </div>
  );
}
