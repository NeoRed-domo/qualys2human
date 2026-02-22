import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Row, Col, Spin, Alert } from 'antd';
import api from '../api/client';
import { useFilters } from '../contexts/FilterContext';
import FilterBar from '../components/filters/FilterBar';
import KPICards from '../components/dashboard/KPICards';
import SeverityDonut from '../components/dashboard/SeverityDonut';
import CategoryBar from '../components/dashboard/CategoryBar';
import TopVulnsTable from '../components/dashboard/TopVulnsTable';
import TopHostsTable from '../components/dashboard/TopHostsTable';
import ExportButtons from '../components/ExportButtons';

interface OverviewData {
  total_vulns: number;
  host_count: number;
  critical_count: number;
  severity_distribution: { severity: number; count: number }[];
  top_vulns: { qid: number; title: string; severity: number; count: number }[];
  top_hosts: { ip: string; dns: string | null; os: string | null; host_count: number }[];
  coherence_checks: { check_type: string; severity: string }[];
}

export default function Overview() {
  const navigate = useNavigate();
  const { toQueryString, severities, types, dateFrom, dateTo, reportId } = useFilters();
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
  }, [severities, types, dateFrom, dateTo, reportId, toQueryString]);

  if (error) {
    return <Alert message="Erreur" description={error} type="error" showIcon />;
  }

  const exportQs = `view=overview${toQueryString() ? '&' + toQueryString() : ''}`;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <FilterBar />
        <ExportButtons queryString={exportQs} />
      </div>

      <Spin spinning={loading}>
        {data && (
          <>
            <KPICards
              totalVulns={data.total_vulns}
              hostCount={data.host_count}
              criticalCount={data.critical_count}
              coherenceOk={data.coherence_checks.length === 0}
            />

            <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
              <Col xs={24} lg={12}>
                <SeverityDonut data={data.severity_distribution} />
              </Col>
              <Col xs={24} lg={12}>
                <CategoryBar
                  data={data.top_vulns}
                  onClickBar={(qid) => navigate(`/vulnerabilities/${qid}`)}
                />
              </Col>
            </Row>

            <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
              <Col xs={24} lg={12}>
                <TopVulnsTable data={data.top_vulns} />
              </Col>
              <Col xs={24} lg={12}>
                <TopHostsTable data={data.top_hosts} />
              </Col>
            </Row>
          </>
        )}
      </Spin>
    </div>
  );
}
