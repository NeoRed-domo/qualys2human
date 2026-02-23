import { Row, Col, Card, Statistic, Tag } from 'antd';
import {
  BugOutlined,
  DesktopOutlined,
  WarningOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  BarChartOutlined,
} from '@ant-design/icons';

interface KPICardsProps {
  totalVulns: number;
  hostCount: number;
  criticalCount: number;
  quickWinsCount?: number;
  coherenceOk: boolean;
}

export default function KPICards({
  totalVulns,
  hostCount,
  criticalCount,
  quickWinsCount = 0,
  coherenceOk,
}: KPICardsProps) {
  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} sm={12} lg={6}>
        <Card size="small">
          <Statistic
            title="Vulnérabilités totales"
            value={totalVulns}
            prefix={<BugOutlined />}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} lg={6}>
        <Card size="small">
          <Statistic
            title="Hôtes affectés"
            value={hostCount}
            prefix={<DesktopOutlined />}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} lg={6}>
        <Card size="small">
          <Statistic
            title="Critiques (sev. 4-5)"
            value={criticalCount}
            prefix={<WarningOutlined />}
            styles={{ content: { color: criticalCount > 0 ? '#cf1322' : '#3f8600' } }}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} lg={6}>
        <Card size="small">
          <Statistic
            title="Moy. vulns / serveur"
            value={hostCount > 0 ? (totalVulns / hostCount).toFixed(1) : 0}
            prefix={<BarChartOutlined />}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} lg={6}>
        <Card size="small">
          <Statistic
            title="Quick-wins"
            value={quickWinsCount}
            prefix={<ThunderboltOutlined />}
            styles={{ content: { color: '#1677ff' } }}
          />
        </Card>
      </Col>
      <Col xs={24}>
        <div style={{ textAlign: 'right' }}>
          {coherenceOk ? (
            <Tag icon={<CheckCircleOutlined />} color="success">
              Cohérence OK
            </Tag>
          ) : (
            <Tag icon={<ExclamationCircleOutlined />} color="warning">
              Anomalies de cohérence détectées
            </Tag>
          )}
        </div>
      </Col>
    </Row>
  );
}
