import { Card, Empty } from 'antd';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const COLORS = ['#1677ff', '#cf1322', '#fa541c', '#faad14', '#52c41a', '#722ed1', '#13c2c2'];

interface DataPoint {
  date: string;
  value: number;
  group: string | null;
}

interface TrendChartProps {
  data: DataPoint[];
  title?: string;
}

export default function TrendChart({ data, title = 'Tendance' }: TrendChartProps) {
  if (data.length === 0) {
    return (
      <Card title={title} size="small">
        <Empty description="Aucune donnée pour cette période" />
      </Card>
    );
  }

  // Check if grouped data
  const groups = [...new Set(data.map((d) => d.group).filter(Boolean))] as string[];
  const isGrouped = groups.length > 1;

  if (!isGrouped) {
    // Simple single line
    const chartData = data.map((d) => ({ date: d.date, value: d.value }));
    return (
      <Card title={title} size="small">
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="value" stroke="#1677ff" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    );
  }

  // Grouped: pivot data by date, one column per group
  const dateMap: Record<string, Record<string, number>> = {};
  data.forEach((d) => {
    if (!dateMap[d.date]) dateMap[d.date] = {};
    if (d.group) dateMap[d.date][d.group] = d.value;
  });
  const chartData = Object.entries(dateMap)
    .map(([date, values]) => ({ date, ...values }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <Card title={title} size="small">
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Legend />
          {groups.map((group, i) => (
            <Line
              key={group}
              type="monotone"
              dataKey={group}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
