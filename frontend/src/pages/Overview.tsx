import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spin, Alert } from 'antd';
import api from '../api/client';
import { useFilters } from '../contexts/FilterContext';
import FilterBar from '../components/filters/FilterBar';
import KPICards from '../components/dashboard/KPICards';
import SeverityDonut from '../components/dashboard/SeverityDonut';
import LayerDonut from '../components/dashboard/LayerDonut';
import CategoryBar from '../components/dashboard/CategoryBar';
import TopVulnsTable from '../components/dashboard/TopVulnsTable';
import TopHostsTable from '../components/dashboard/TopHostsTable';
import ExportButtons from '../components/ExportButtons';
import WidgetGrid, { type WidgetDef } from '../components/dashboard/WidgetGrid';
import HelpTooltip from '../components/help/HelpTooltip';

interface OverviewData {
  total_vulns: number;
  host_count: number;
  critical_count: number;
  severity_distribution: { severity: number; count: number }[];
  top_vulns: { qid: number; title: string; severity: number; count: number }[];
  top_hosts: { ip: string; dns: string | null; os: string | null; host_count: number }[];
  coherence_checks: { check_type: string; severity: string }[];
  layer_distribution: { name: string | null; color: string | null; count: number }[];
}

export default function Overview() {
  const navigate = useNavigate();
  const { toQueryString, severities, types, layers, osClasses, freshness, dateFrom, dateTo, reportId, ready } = useFilters();
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (error) {
    return <Alert message="Erreur" description={error} type="error" showIcon />;
  }

  const exportQs = `view=overview${toQueryString() ? '&' + toQueryString() : ''}`;

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
              coherenceOk={data.coherence_checks.length === 0}
            />
          ),
        },
        {
          key: 'severity',
          label: 'Répartition par sévérité',
          content: <SeverityDonut data={data.severity_distribution} />,
        },
        {
          key: 'layer',
          label: 'Répartition par catégorisation',
          content: <LayerDonut data={data.layer_distribution} />,
        },
        {
          key: 'category',
          label: 'Top vulnérabilités (graphique)',
          content: (
            <CategoryBar
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ExportButtons queryString={exportQs} />
          <HelpTooltip topic="overview" />
        </div>
      } />

      <Spin spinning={loading}>
        {data && <WidgetGrid widgets={widgets} />}
      </Spin>
    </div>
  );
}
