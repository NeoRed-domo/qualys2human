import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spin, Alert, Card, Row, Col } from 'antd';
import api from '../api/client';
import { useFilters } from '../contexts/FilterContext';
import FilterBar from '../components/filters/FilterBar';
import KPICards from '../components/dashboard/KPICards';
import SeverityDonut from '../components/dashboard/SeverityDonut';
import OsClassDonut from '../components/dashboard/OsClassDonut';
import LayerDonut from '../components/dashboard/LayerDonut';
import CategoryBar from '../components/dashboard/CategoryBar';
import TopVulnsTable from '../components/dashboard/TopVulnsTable';
import TopHostsTable from '../components/dashboard/TopHostsTable';
import WidgetGrid, { type WidgetDef } from '../components/dashboard/WidgetGrid';
import HelpTooltip from '../components/help/HelpTooltip';
import PdfExportButton from '../components/PdfExportButton';
import { PdfReport } from '../utils/pdfExport';
import { getLogoDataUrl } from '../utils/pdfLogo';

interface OverviewData {
  total_vulns: number;
  host_count: number;
  critical_count: number;
  severity_distribution: { severity: number; count: number }[];
  top_vulns: { qid: number; title: string; severity: number; count: number; layer_name: string | null; layer_color: string | null }[];
  top_hosts: { ip: string; dns: string | null; os: string | null; host_count: number }[];
  coherence_checks: { check_type: string; severity: string }[];
  layer_distribution: { id: number | null; name: string | null; color: string | null; count: number }[];
  os_class_distribution: { name: string; count: number }[];
  freshness_stale_days: number;
  freshness_hide_days: number;
}

export default function Overview() {
  const navigate = useNavigate();
  const { toQueryString, severities, types, layers, osClasses, freshness, dateFrom, dateTo, reportId, ready } = useFilters();
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sevChartRef = useRef<HTMLDivElement>(null);
  const osChartRef = useRef<HTMLDivElement>(null);
  const layerChartRef = useRef<HTMLDivElement>(null);
  const categoryChartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ready) return; // Wait for enterprise rules to load before fetching
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const qs = toQueryString();
        const url = qs ? `/dashboard/overview?${qs}` : '/dashboard/overview';
        const resp = await api.get(url);
        if (!cancelled) setData(resp.data);
      } catch (err: any) {
        if (!cancelled) setError(err.response?.data?.detail || 'Erreur de chargement');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => { cancelled = true; };
  }, [severities, types, layers, osClasses, freshness, dateFrom, dateTo, reportId, toQueryString, ready]);

  const handlePdfExport = async () => {
    if (!data) return;
    const logo = await getLogoDataUrl();
    const pdf = new PdfReport('Vue d\'ensemble', logo);

    // Filter summary
    const filterParts: string[] = [];
    if (severities.length) filterParts.push(`Sévérités: ${severities.join(', ')}`);
    if (types.length) filterParts.push(`Types: ${types.join(', ')}`);
    if (layers.length) {
      const layerNames = layers.map((id) => {
        const found = data.layer_distribution.find((l) => l.id === id);
        return found?.name || (id === 0 ? 'Autre' : String(id));
      });
      filterParts.push(`Catégorisation: ${layerNames.join(', ')}`);
    }
    if (freshness !== 'all') filterParts.push(`Fraîcheur: ${freshness === 'active' ? 'Actives' : 'Peut-être obsolètes'}`);
    if (filterParts.length) pdf.addFilterSummary(filterParts.join(' | '));

    // KPIs
    const avg = data.host_count > 0 ? (data.total_vulns / data.host_count).toFixed(1) : '0';
    pdf.addKpis([
      { label: 'Vulns totales', value: data.total_vulns },
      { label: 'Hôtes', value: data.host_count },
      { label: 'Critiques (4-5)', value: data.critical_count },
      { label: 'Moy. / serveur', value: avg },
    ]);

    // Charts
    await pdf.addChartPair(sevChartRef.current, osChartRef.current);
    await pdf.addChartCapture(layerChartRef.current);
    await pdf.addChartCapture(categoryChartRef.current);

    // Top vulns table
    pdf.addSectionTitle('Top 10 vulnérabilités');
    pdf.addTable(
      [
        { header: 'QID', dataKey: 'qid' },
        { header: 'Titre', dataKey: 'title' },
        { header: 'Sévérité', dataKey: 'severity' },
        { header: 'Catégorisation', dataKey: 'layer_name' },
        { header: 'Occurrences', dataKey: 'count' },
      ],
      data.top_vulns,
    );

    // Top hosts table
    pdf.addSectionTitle('Top 10 hôtes');
    pdf.addTable(
      [
        { header: 'IP', dataKey: 'ip' },
        { header: 'DNS', dataKey: 'dns' },
        { header: 'OS', dataKey: 'os' },
        { header: 'Vulnérabilités', dataKey: 'host_count' },
      ],
      data.top_hosts,
    );

    pdf.save('vue-ensemble.pdf');
  };

  if (error) {
    return <Alert message="Erreur" description={error} type="error" showIcon />;
  }

  const widgets: WidgetDef[] = data
    ? [
        {
          key: 'kpi',
          label: 'Indicateurs clés',
          content: (
            <KPICards
              totalVulns={data.total_vulns}
              hostCount={data.host_count}
              criticalCount={data.critical_count}
            />
          ),
        },
        {
          key: 'distributions',
          label: 'Répartitions',
          content: (
            <Card size="small" styles={{ body: { padding: '12px 8px' } }}>
              <Row gutter={16}>
                <Col xs={24} lg={8}>
                  <div style={{ fontWeight: 600, textAlign: 'center', marginBottom: 4 }}>Criticités</div>
                  <SeverityDonut
                    ref={sevChartRef}
                    data={data.severity_distribution}
                    onClickSeverity={(sev) => {
                      navigate(`/vulnerabilities?severity=${sev}&freshness=${freshness}`);
                    }}
                  />
                </Col>
                <Col xs={24} lg={8}>
                  <div style={{ fontWeight: 600, textAlign: 'center', marginBottom: 4 }}>Classe d'OS</div>
                  <OsClassDonut
                    ref={osChartRef}
                    data={data.os_class_distribution}
                    onClickClass={(cls) => {
                      navigate(`/hosts?os_class=${cls.toLowerCase()}`);
                    }}
                  />
                </Col>
                <Col xs={24} lg={8}>
                  <div style={{ fontWeight: 600, textAlign: 'center', marginBottom: 4 }}>Catégorisation</div>
                  <LayerDonut
                    ref={layerChartRef}
                    data={data.layer_distribution}
                    onClickLayer={(layerId) => {
                      const id = layerId ?? 0;
                      const layer = data.layer_distribution.find((l) => (l.id ?? 0) === id);
                      const name = layer?.name || 'Autre';
                      navigate(`/vulnerabilities?layer=${id}&layer_name=${encodeURIComponent(name)}&freshness=${freshness}`);
                    }}
                  />
                </Col>
              </Row>
            </Card>
          ),
        },
        {
          key: 'category',
          label: 'Top vulnérabilités (graphique)',
          content: (
            <CategoryBar
              ref={categoryChartRef}
              data={data.top_vulns}
              onClickBar={(qid) => navigate(`/vulnerabilities/${qid}`)}
            />
          ),
        },
        {
          key: 'topVulns',
          label: 'Top vulnérabilités (tableau)',
          content: <TopVulnsTable data={data.top_vulns} />,
        },
        {
          key: 'topHosts',
          label: 'Top serveurs',
          content: <TopHostsTable data={data.top_hosts} />,
        },
      ]
    : [];

  return (
    <div>
      <FilterBar extra={
        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {data && <PdfExportButton onExport={handlePdfExport} />}
          <HelpTooltip topic="overview" />
        </span>
      } />

      <Spin spinning={loading}>
        {data && <WidgetGrid widgets={widgets} />}
      </Spin>
    </div>
  );
}
