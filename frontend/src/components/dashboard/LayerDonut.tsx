import { Card } from 'antd';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface LayerItem {
  name: string | null;
  color: string | null;
  count: number;
}

interface LayerDonutProps {
  data: LayerItem[];
}

const UNCLASSIFIED_COLOR = '#8c8c8c';

export default function LayerDonut({ data }: LayerDonutProps) {
  const chartData = data.map((d) => ({
    name: d.name || 'Autre',
    value: d.count,
    color: d.color || UNCLASSIFIED_COLOR,
  }));

  return (
    <Card title="Répartition par catégorisation" size="small">
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
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip formatter={(value: number | undefined) => [value ?? 0, 'Vulnérabilités']} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </Card>
  );
}
