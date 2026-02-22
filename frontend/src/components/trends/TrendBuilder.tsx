import { Form, Select, DatePicker, Button, Card, Row, Col } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const METRICS = [
  { label: 'Total vulnérabilités', value: 'total_vulns' },
  { label: 'Vulnérabilités critiques', value: 'critical_count' },
  { label: 'Nombre d\'hôtes', value: 'host_count' },
];

const GROUP_BY_OPTIONS = [
  { label: 'Aucun', value: '' },
  { label: 'Sévérité', value: 'severity' },
  { label: 'Catégorie', value: 'category' },
  { label: 'Type', value: 'type' },
];

export interface TrendQueryParams {
  metric: string;
  group_by: string | null;
  date_from: string | null;
  date_to: string | null;
}

interface TrendBuilderProps {
  onQuery: (params: TrendQueryParams) => void;
  loading?: boolean;
}

export default function TrendBuilder({ onQuery, loading }: TrendBuilderProps) {
  const [form] = Form.useForm();

  const handleSubmit = (values: any) => {
    onQuery({
      metric: values.metric,
      group_by: values.group_by || null,
      date_from: values.date_range?.[0]?.format('YYYY-MM-DD') || null,
      date_to: values.date_range?.[1]?.format('YYYY-MM-DD') || null,
    });
  };

  return (
    <Card title="Constructeur de tendance" size="small" style={{ marginBottom: 16 }}>
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          metric: 'total_vulns',
          group_by: '',
          date_range: [dayjs().subtract(6, 'month'), dayjs()],
        }}
      >
        <Row gutter={16}>
          <Col xs={24} md={6}>
            <Form.Item name="metric" label="Métrique" rules={[{ required: true }]}>
              <Select options={METRICS} />
            </Form.Item>
          </Col>
          <Col xs={24} md={6}>
            <Form.Item name="group_by" label="Grouper par">
              <Select options={GROUP_BY_OPTIONS} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="date_range" label="Période">
              <DatePicker.RangePicker style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={4}>
            <Form.Item label=" ">
              <Button
                type="primary"
                htmlType="submit"
                icon={<SearchOutlined />}
                loading={loading}
                block
              >
                Analyser
              </Button>
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Card>
  );
}
