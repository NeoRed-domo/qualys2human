import { useNavigate } from 'react-router-dom';
import { Card } from 'antd';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const SEVERITY_COLORS: Record<number, string> = {
  5: '#cf1322',
  4: '#fa541c',
  3: '#faad14',
  2: '#1677ff',
  1: '#52c41a',
  0: '#8c8c8c',
};

const SEVERITY_LABELS: Record<number, string> = {
  5: 'Urgent (5)',
  4: 'Critique (4)',
  3: 'Sérieux (3)',
  2: 'Moyen (2)',
  1: 'Minimal (1)',
  0: 'Info (0)',
};

interface SeverityItem {
  severity: number;
  count: number;
}

interface SeverityDonutProps {
  data: SeverityItem[];
  onClickSeverity?: (severity: number) => void;
}

export default function SeverityDonut({ data, onClickSeverity }: SeverityDonutProps) {
  const chartData = data.map((d) => ({
    name: SEVERITY_LABELS[d.severity] || `Sev ${d.severity}`,
    value: d.count,
    severity: d.severity,
  }));

  return (
    <Card title="Répartition par sévérité" size="small">
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            dataKey="value"
            nameKey="name"
            onClick={(entry) => onClickSeverity?.(entry.severity)}
            style={{ cursor: onClickSeverity ? 'pointer' : 'default' }}
          >
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={SEVERITY_COLORS[entry.severity] || '#8c8c8c'}
              />
            ))}
          </Pie>
          <Tooltip formatter={(value: number) => [value, 'Vulnérabilités']} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </Card>
  );
}
