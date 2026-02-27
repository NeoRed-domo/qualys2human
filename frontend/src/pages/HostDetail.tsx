import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Card, Descriptions, Tag, Row, Col, Spin, Alert } from 'antd';
import { ArrowLeftOutlined, CloseCircleOutlined, DownloadOutlined } from '@ant-design/icons';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, type ColDef } from 'ag-grid-community';
import api from '../api/client';
import { exportToCsv } from '../utils/csvExport';
import PdfExportButton from '../components/PdfExportButton';
import { PdfReport } from '../utils/pdfExport';
import { getLogoDataUrl } from '../utils/pdfLogo';

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
  layer_name: string | null;
  layer_color: string | null;
}

export default function HostDetail() {
  const { ip } = useParams<{ ip: string }>();
  const navigate = useNavigate();
  const [info, setInfo] = useState<HostInfo | null>(null);
  const [vulns, setVulns] = useState<VulnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sevFilter, setSevFilter] = useState<number | null>(null);
  const [trackFilter, setTrackFilter] = useState<string | null>(null);
  const sevChartRef = useRef<HTMLDivElement>(null);
  const trackChartRef = useRef<HTMLDivElement>(null);

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

  // Apply local filters from pie chart clicks
  let filteredVulns = vulns;
  if (sevFilter !== null) {
    filteredVulns = filteredVulns.filter((v) => v.severity === sevFilter);
  }
  if (trackFilter !== null) {
    filteredVulns = filteredVulns.filter((v) => (v.tracking_method || 'Inconnu') === trackFilter);
  }

  const hasFilter = sevFilter !== null || trackFilter !== null;

  const vulnCols: ColDef<VulnRow>[] = [
    { field: 'qid', headerName: 'QID', width: 90 },
    { field: 'title', headerName: 'Titre', flex: 1, minWidth: 200 },
    {
      field: 'severity', headerName: 'Sévérité', width: 120,
      valueFormatter: (p) => {
        const t = SEVERITY_TAG[p.value as number];
        return t ? t.label : String(p.value ?? '');
      },
      cellRenderer: (p: any) => {
        const t = SEVERITY_TAG[p.value];
        return t ? <Tag color={t.color}>{t.label}</Tag> : p.value;
      },
      sort: 'desc',
    },
    {
      field: 'layer_name', headerName: 'Catégorisation', width: 180,
      valueFormatter: (p) => (p.data as VulnRow)?.layer_name || '',
      cellRenderer: (p: any) => {
        const name = p.data?.layer_name;
        const color = p.data?.layer_color || '#8c8c8c';
        if (!name) return <span style={{ color: '#8c8c8c' }}>—</span>;
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
              background: color, flexShrink: 0,
            }} />
            {name}
          </span>
        );
      },
    },
    { field: 'port', headerName: 'Port', width: 80 },
    { field: 'vuln_status', headerName: 'Statut', width: 110 },
    { field: 'last_detected', headerName: 'Dernière détection', width: 160 },
  ];

  const filterTags = (
    <span>
      {sevFilter !== null && (
        <Tag color="blue" closable onClose={() => setSevFilter(null)}>
          {SEVERITY_LABELS[sevFilter] || `Sev ${sevFilter}`}
        </Tag>
      )}
      {trackFilter !== null && (
        <Tag color="blue" closable onClose={() => setTrackFilter(null)}>
          {trackFilter}
        </Tag>
      )}
    </span>
  );

  const tableTitle = hasFilter
    ? <span>Vulnérabilités — filtre : {filterTags}</span>
    : 'Vulnérabilités';

  const handlePdfExport = async () => {
    const logo = await getLogoDataUrl();
    const pdf = new PdfReport(`Hôte ${info.ip}`, logo);

    pdf.addDescriptions([
      { label: 'IP', value: info.ip },
      { label: 'DNS', value: info.dns || '—' },
      { label: 'NetBIOS', value: info.netbios || '—' },
      { label: 'OS', value: info.os || '—' },
      { label: 'OS CPE', value: info.os_cpe || '—' },
      { label: 'Vulnérabilités', value: String(info.vuln_count) },
      { label: 'Premier scan', value: info.first_seen || '—' },
      { label: 'Dernier scan', value: info.last_seen || '—' },
    ]);

    await pdf.addChartPair(sevChartRef.current, trackChartRef.current);

    pdf.addSectionTitle('Vulnérabilités');
    pdf.addTable(
      [
        { header: 'QID', dataKey: 'qid' },
        { header: 'Titre', dataKey: 'title' },
        { header: 'Sévérité', dataKey: 'severityLabel' },
        { header: 'Catégorisation', dataKey: 'layer_name' },
        { header: 'Port', dataKey: 'port' },
        { header: 'Statut', dataKey: 'vuln_status' },
        { header: 'Dernière détection', dataKey: 'last_detected' },
      ],
      filteredVulns.map((v) => ({
        ...v,
        severityLabel: SEVERITY_TAG[v.severity]?.label || String(v.severity),
      })),
    );

    pdf.save(`hote-${info.ip}.pdf`);
  };

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Button icon={<ArrowLeftOutlined />} type="link" onClick={() => navigate(-1)} style={{ padding: 0 }}>
          Retour
        </Button>
        <PdfExportButton onExport={handlePdfExport} />
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
          <div ref={sevChartRef}>
          <Card title="Sévérités" size="small">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={sevData}
                  cx="50%" cy="50%"
                  innerRadius={50} outerRadius={85}
                  dataKey="value" nameKey="name"
                  onClick={(entry) => {
                    setSevFilter((prev) => prev === entry.severity ? null : entry.severity);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  {sevData.map((entry, i) => (
                    <Cell key={i} fill={SEVERITY_COLORS[entry.severity] || '#8c8c8c'} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend
                  content={() => (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
                      {sevData.map((entry) => (
                        <span key={entry.severity} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                          <span style={{
                            display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                            background: SEVERITY_COLORS[entry.severity] || '#8c8c8c',
                          }} />
                          {entry.name}
                        </span>
                      ))}
                    </div>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
            {sevFilter !== null && (
              <div style={{ textAlign: 'center', marginTop: 4 }}>
                <Button size="small" icon={<CloseCircleOutlined />} onClick={() => setSevFilter(null)}>
                  Réinitialiser
                </Button>
              </div>
            )}
          </Card>
          </div>
        </Col>
        <Col xs={24} lg={12}>
          {trackData.length > 0 && (
            <div ref={trackChartRef}>
            <Card title="Méthodes de suivi" size="small">
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={trackData}
                    cx="50%" cy="50%"
                    outerRadius={85}
                    dataKey="value" nameKey="name"
                    label
                    onClick={(entry) => {
                      setTrackFilter((prev) => prev === entry.name ? null : entry.name);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {trackData.map((_, i) => (
                      <Cell key={i} fill={TRACKING_COLORS[i % TRACKING_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend
                    content={() => (
                      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
                        {trackData.map((entry, i) => (
                          <span key={entry.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                            <span style={{
                              display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                              background: TRACKING_COLORS[i % TRACKING_COLORS.length],
                            }} />
                            {entry.name}
                          </span>
                        ))}
                      </div>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
              {trackFilter !== null && (
                <div style={{ textAlign: 'center', marginTop: 4 }}>
                  <Button size="small" icon={<CloseCircleOutlined />} onClick={() => setTrackFilter(null)}>
                    Réinitialiser
                  </Button>
                </div>
              )}
            </Card>
            </div>
          )}
        </Col>
      </Row>

      <Card
        title={tableTitle}
        size="small"
        extra={
          <Button
            icon={<DownloadOutlined />}
            size="small"
            onClick={() => exportToCsv(vulnCols, filteredVulns, `vulnerabilites-${ip}.csv`)}
          >
            CSV
          </Button>
        }
      >
        <div style={{ height: 400 }}>
          <AgGridReact<VulnRow>
            rowData={filteredVulns}
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
