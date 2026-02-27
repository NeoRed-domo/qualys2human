import { useState, useEffect, useRef } from 'react';
import { Card, List, Button, Spin, message } from 'antd';
import { PlayCircleOutlined } from '@ant-design/icons';
import api from '../api/client';
import TrendBuilder, { type TrendQueryParams } from '../components/trends/TrendBuilder';
import TrendChart from '../components/trends/TrendChart';
import HelpTooltip from '../components/help/HelpTooltip';
import PdfExportButton from '../components/PdfExportButton';
import { PdfReport } from '../utils/pdfExport';
import { getLogoDataUrl } from '../utils/pdfLogo';

interface DataPoint {
  date: string;
  value: number;
  group: string | null;
}

interface Template {
  id: number;
  name: string;
  metric: string;
  group_by: string | null;
  filters: Record<string, any>;
}

export default function Trends() {
  const [series, setSeries] = useState<DataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [chartTitle, setChartTitle] = useState('Tendance');
  const trendChartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get('/trends/templates').then((r) => setTemplates(r.data)).catch(() => {});
  }, []);

  const runQuery = async (params: TrendQueryParams, title?: string) => {
    setLoading(true);
    try {
      const resp = await api.post('/trends/query', params);
      setSeries(resp.data.series);
      setChartTitle(title || `Tendance — ${params.metric}`);
    } catch (err: any) {
      message.error(err.response?.data?.detail || 'Erreur lors de l\'analyse');
    } finally {
      setLoading(false);
    }
  };

  const runTemplate = (t: Template) => {
    runQuery(
      {
        metric: t.metric,
        group_by: t.group_by,
        date_from: null,
        date_to: null,
      },
      t.name,
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
        {series.length > 0 && (
          <PdfExportButton onExport={async () => {
            const logo = await getLogoDataUrl();
            const pdf = new PdfReport(chartTitle, logo);
            await pdf.addChartCapture(trendChartRef.current);
            pdf.save('tendances.pdf');
          }} />
        )}
        <HelpTooltip topic="trends" />
      </div>
      <TrendBuilder onQuery={runQuery} loading={loading} />

      {templates.length > 0 && (
        <Card title="Modèles prédéfinis" size="small" style={{ marginBottom: 16 }}>
          <List
            size="small"
            dataSource={templates}
            renderItem={(t) => (
              <List.Item
                actions={[
                  <Button
                    key="run"
                    type="link"
                    icon={<PlayCircleOutlined />}
                    onClick={() => runTemplate(t)}
                  >
                    Exécuter
                  </Button>,
                ]}
              >
                <List.Item.Meta title={t.name} description={`Métrique: ${t.metric}`} />
              </List.Item>
            )}
          />
        </Card>
      )}

      <Spin spinning={loading}>
        <TrendChart ref={trendChartRef} data={series} title={chartTitle} />
      </Spin>
    </div>
  );
}
