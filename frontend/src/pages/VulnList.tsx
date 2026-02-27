import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button, Card, Spin, Alert, Tag } from 'antd';
import { ArrowLeftOutlined, DownloadOutlined } from '@ant-design/icons';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, type ColDef } from 'ag-grid-community';
import api from '../api/client';
import { exportToCsv } from '../utils/csvExport';
import PdfExportButton from '../components/PdfExportButton';
import { PdfReport } from '../utils/pdfExport';
import { getLogoDataUrl } from '../utils/pdfLogo';

ModuleRegistry.registerModules([AllCommunityModule]);

const SEVERITY_TAG: Record<number, { color: string; label: string }> = {
  5: { color: 'red', label: 'Urgent (5)' },
  4: { color: 'orange', label: 'Critique (4)' },
  3: { color: 'gold', label: 'Sérieux (3)' },
  2: { color: 'blue', label: 'Moyen (2)' },
  1: { color: 'green', label: 'Minimal (1)' },
};

const FRESHNESS_LABELS: Record<string, string> = {
  active: 'actives',
  stale: 'peut-être obsolètes',
  all: 'toutes',
};

interface VulnRow {
  qid: number;
  title: string;
  severity: number;
  type: string | null;
  category: string | null;
  host_count: number;
  occurrence_count: number;
  layer_name: string | null;
  layer_color: string | null;
}

export default function VulnList() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [data, setData] = useState<VulnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const severity = searchParams.get('severity');
  const layer = searchParams.get('layer');
  const layerName = searchParams.get('layer_name');
  const freshness = searchParams.get('freshness') || 'active';

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (severity) params.set('severity', severity);
        if (layer) params.set('layer', layer);
        params.set('freshness', freshness);
        const qs = params.toString();
        const resp = await api.get(`/vulnerabilities${qs ? '?' + qs : ''}`);
        if (!cancelled) setData(resp.data.items);
      } catch (err: any) {
        if (!cancelled) setError(err.response?.data?.detail || 'Erreur de chargement');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [severity, layer, freshness]);

  const sevTag = severity ? SEVERITY_TAG[Number(severity)] : null;
  const freshnessLabel = FRESHNESS_LABELS[freshness] || freshness;

  const filterLabel = layerName
    ? <> — catégorisation <Tag>{layerName}</Tag></>
    : null;

  const title = sevTag
    ? <>Vulnérabilités <Tag color={sevTag.color}>{sevTag.label}</Tag>{filterLabel} — {freshnessLabel} ({data.length})</>
    : <>Toutes les vulnérabilités{filterLabel} — {freshnessLabel} ({data.length})</>;

  const colDefs: ColDef<VulnRow>[] = [
    { field: 'qid', headerName: 'QID', width: 90 },
    { field: 'title', headerName: 'Titre', flex: 1, minWidth: 300 },
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
    },
    { field: 'type', headerName: 'Type', width: 120 },
    { field: 'category', headerName: 'Catégorie', width: 160 },
    {
      field: 'layer_name', headerName: 'Catégorisation', width: 180,
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
    { field: 'host_count', headerName: 'Hôtes', width: 100, sort: 'desc' },
    { field: 'occurrence_count', headerName: 'Occurrences', width: 120 },
  ];

  if (error) return <Alert message="Erreur" description={error} type="error" showIcon />;

  return (
    <div>
      <Button
        icon={<ArrowLeftOutlined />}
        type="link"
        onClick={() => navigate('/')}
        style={{ padding: 0, marginBottom: 12 }}
      >
        Retour à la vue d'ensemble
      </Button>

      <Spin spinning={loading}>
        <Card
          title={title}
          size="small"
          extra={
            <span style={{ display: 'flex', gap: 8 }}>
              <PdfExportButton onExport={async () => {
                const logo = await getLogoDataUrl();
                const titleText = sevTag
                  ? `Vulnérabilités ${sevTag.label} — ${freshnessLabel}`
                  : `Toutes les vulnérabilités — ${freshnessLabel}`;
                const pdf = new PdfReport(titleText, logo);
                pdf.addTable(
                  [
                    { header: 'QID', dataKey: 'qid' },
                    { header: 'Titre', dataKey: 'title' },
                    { header: 'Sévérité', dataKey: 'severityLabel' },
                    { header: 'Type', dataKey: 'type' },
                    { header: 'Catégorie', dataKey: 'category' },
                    { header: 'Hôtes', dataKey: 'host_count' },
                    { header: 'Occurrences', dataKey: 'occurrence_count' },
                  ],
                  data.map((r) => ({
                    ...r,
                    severityLabel: SEVERITY_TAG[r.severity]?.label || String(r.severity),
                  })),
                );
                pdf.save('vulnerabilites.pdf');
              }} />
              <Button
                icon={<DownloadOutlined />}
                size="small"
                onClick={() => exportToCsv(colDefs, data, 'vulnerabilites.csv')}
              >
                CSV
              </Button>
            </span>
          }
        >
          <div style={{ height: 'calc(100vh - 220px)', minHeight: 400 }}>
            <AgGridReact<VulnRow>
              rowData={data}
              columnDefs={colDefs}
              domLayout="normal"
              rowHeight={36}
              headerHeight={38}
              onRowClicked={(e) => {
                if (e.data) navigate(`/vulnerabilities/${e.data.qid}`);
              }}
              rowStyle={{ cursor: 'pointer' }}
            />
          </div>
        </Card>
      </Spin>
    </div>
  );
}
