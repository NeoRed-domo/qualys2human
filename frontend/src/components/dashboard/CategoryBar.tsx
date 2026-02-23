import { Card } from 'antd';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from 'recharts';

interface TopVuln {
  qid: number;
  title: string;
  severity: number;
  count: number;
}

interface CategoryBarProps {
  data: TopVuln[];
  onClickBar?: (qid: number) => void;
}

const SEVERITY_COLORS: Record<number, string> = {
  5: '#cf1322',
  4: '#fa541c',
  3: '#faad14',
  2: '#1677ff',
  1: '#52c41a',
};

export default function CategoryBar({ data, onClickBar }: CategoryBarProps) {
  const chartData = data.slice(0, 10).map((d) => ({
    name: d.title.length > 30 ? d.title.slice(0, 27) + '...' : d.title,
    count: d.count,
    qid: d.qid,
    severity: d.severity,
    fill: SEVERITY_COLORS[d.severity] || '#8c8c8c',
  }));

  return (
    <Card title="Top 10 vulnérabilités (fréquence)" size="small">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ left: 20, right: 20, top: 5, bottom: 5 }}
          onClick={(state: any) => {
            if (state?.activePayload?.[0]) {
              onClickBar?.(state.activePayload[0].payload.qid);
            }
          }}
          style={{ cursor: onClickBar ? 'pointer' : 'default' }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" />
          <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 12 }} />
          <Tooltip
            formatter={(value: number | undefined) => [value ?? 0, 'Occurrences']}
            labelFormatter={(label) => {
              const item = chartData.find((d) => d.name === label);
              return item ? `QID ${item.qid} — ${label}` : label;
            }}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
