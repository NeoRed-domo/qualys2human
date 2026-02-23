import { useEffect, useState, useCallback } from 'react';
import { Card, Row, Col, Spin, Alert, Tag, Progress, Statistic, List, Button, Descriptions, Typography } from 'antd';
import {
  CheckCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  DatabaseOutlined,
  CloudServerOutlined,
  HddOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import api from '../api/client';
import HelpTooltip from '../components/help/HelpTooltip';

const { Text } = Typography;

interface ServiceStatus {
  name: string;
  status: string;
  detail: string | null;
}

interface SystemMetrics {
  cpu_percent: number;
  memory_percent: number;
  memory_used_mb: number;
  memory_total_mb: number;
  disk_percent: number;
  disk_used_gb: number;
  disk_total_gb: number;
}

interface DbPoolInfo {
  pool_size: number;
  checked_out: number;
  overflow: number;
  checked_in: number;
}

interface ActivitySummary {
  total_reports: number;
  total_users: number;
  last_import_filename: string | null;
  last_import_date: string | null;
  last_import_status: string | null;
}

interface AlertItem {
  level: string;
  message: string;
}

interface MonitoringData {
  uptime_seconds: number;
  platform: string;
  python_version: string;
  services: ServiceStatus[];
  system: SystemMetrics;
  db_pool: DbPoolInfo | null;
  activity: ActivitySummary;
  alerts: AlertItem[];
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (d > 0) parts.push(`${d}j`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}min`);
  return parts.join(' ');
}

function statusIcon(status: string) {
  if (status === 'ok') return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
  if (status === 'warning') return <WarningOutlined style={{ color: '#faad14' }} />;
  return <CloseCircleOutlined style={{ color: '#cf1322' }} />;
}

function metricColor(percent: number): string {
  if (percent >= 90) return '#cf1322';
  if (percent >= 75) return '#faad14';
  return '#52c41a';
}

export default function Monitoring() {
  const [data, setData] = useState<MonitoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await api.get('/monitoring');
      setData(resp.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, [fetchData]);

  if (error) return <Alert message="Erreur" description={error} type="error" showIcon />;
  if (!data && loading) return <Spin style={{ display: 'block', margin: '80px auto' }} size="large" />;
  if (!data) return null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text type="secondary">
          <ClockCircleOutlined /> Uptime : {formatUptime(data.uptime_seconds)} | {data.platform} | Python {data.python_version}
        </Text>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <HelpTooltip topic="monitoring" />
          <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
            Actualiser
          </Button>
        </div>
      </div>

      {/* Alerts */}
      {data.alerts.length > 0 && (
        <Card title="Alertes" size="small" style={{ marginBottom: 16 }}>
          <List
            size="small"
            dataSource={data.alerts}
            renderItem={(alert) => (
              <List.Item>
                <Tag
                  color={alert.level === 'error' ? 'error' : 'warning'}
                  icon={alert.level === 'error' ? <CloseCircleOutlined /> : <WarningOutlined />}
                >
                  {alert.level.toUpperCase()}
                </Tag>
                {alert.message}
              </List.Item>
            )}
          />
        </Card>
      )}

      <Row gutter={[16, 16]}>
        {/* Services */}
        <Col xs={24} lg={8}>
          <Card title={<><CloudServerOutlined /> Services</>} size="small">
            <List
              size="small"
              dataSource={data.services}
              renderItem={(svc) => (
                <List.Item>
                  <List.Item.Meta
                    avatar={statusIcon(svc.status)}
                    title={svc.name}
                    description={svc.detail}
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>

        {/* System Metrics */}
        <Col xs={24} lg={8}>
          <Card title={<><HddOutlined /> Ressources système</>} size="small">
            <div style={{ marginBottom: 16 }}>
              <Text>CPU</Text>
              <Progress
                percent={Math.round(data.system.cpu_percent)}
                strokeColor={metricColor(data.system.cpu_percent)}
                size="small"
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <Text>Mémoire ({data.system.memory_used_mb} / {data.system.memory_total_mb} Mo)</Text>
              <Progress
                percent={Math.round(data.system.memory_percent)}
                strokeColor={metricColor(data.system.memory_percent)}
                size="small"
              />
            </div>
            <div>
              <Text>Disque ({data.system.disk_used_gb} / {data.system.disk_total_gb} Go)</Text>
              <Progress
                percent={Math.round(data.system.disk_percent)}
                strokeColor={metricColor(data.system.disk_percent)}
                size="small"
              />
            </div>
          </Card>
        </Col>

        {/* DB Pool */}
        <Col xs={24} lg={8}>
          <Card title={<><DatabaseOutlined /> Pool de connexions</>} size="small">
            {data.db_pool ? (
              <Descriptions column={1} size="small">
                <Descriptions.Item label="Taille du pool">{data.db_pool.pool_size}</Descriptions.Item>
                <Descriptions.Item label="Connexions actives">{data.db_pool.checked_out}</Descriptions.Item>
                <Descriptions.Item label="Disponibles">{data.db_pool.checked_in}</Descriptions.Item>
                <Descriptions.Item label="Overflow">{data.db_pool.overflow}</Descriptions.Item>
              </Descriptions>
            ) : (
              <Text type="secondary">Information non disponible</Text>
            )}
          </Card>
        </Col>
      </Row>

      {/* Activity Summary */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <Card title="Activité" size="small">
            <Row gutter={16}>
              <Col xs={12} sm={6}>
                <Statistic title="Rapports importés" value={data.activity.total_reports} />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic title="Utilisateurs" value={data.activity.total_users} />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic
                  title="Dernier import"
                  value={data.activity.last_import_filename || '—'}
                  styles={{ content: { fontSize: 14 } }}
                />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic
                  title="Statut dernier import"
                  value={data.activity.last_import_status || '—'}
                  styles={{
                    content: {
                      fontSize: 14,
                      color: data.activity.last_import_status === 'done' ? '#52c41a' : undefined,
                    },
                  }}
                />
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
