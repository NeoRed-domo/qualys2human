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
  layer_name: string | null;
  layer_color: string | null;
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

interface ChartItem {
  name: string;
  fullTitle: string;
  count: number;
  qid: number;
  severity: number;
  fill: string;
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  const item: ChartItem = payload[0].payload;
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #d9d9d9',
        borderRadius: 6,
        padding: '8px 12px',
        maxWidth: 360,
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 12, color: '#1677ff' }}>
        QID {item.qid}
      </div>
      <div
        style={{
          whiteSpace: 'normal',
          wordBreak: 'break-word',
          fontSize: 13,
          marginBottom: 6,
        }}
      >
        {item.fullTitle}
      </div>
      <div style={{ fontSize: 12, color: '#8c8c8c' }}>
        Occurrences : <strong style={{ color: item.fill }}>{item.count}</strong>
      </div>
    </div>
  );
}

/** Custom bar shape — native SVG rect with its own onClick.
 *  Only the colored bar rectangle is clickable, not the full chart row. */
function ClickableBar(props: any) {
  const { fill, x, y, width, height, payload, onBarClick } = props;
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      fill={fill}
      rx={4}
      ry={4}
      style={{ cursor: onBarClick ? 'pointer' : 'default' }}
      onClick={onBarClick ? () => onBarClick(payload.qid) : undefined}
    />
  );
}

export default function CategoryBar({ data, onClickBar }: CategoryBarProps) {
  const chartData: ChartItem[] = data.slice(0, 10).map((d) => ({
    name: d.title.length > 30 ? d.title.slice(0, 27) + '...' : d.title,
    fullTitle: d.title,
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
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" />
          <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 12 }} />
          <Tooltip
            content={<CustomTooltip />}
            cursor={false}
            wrapperStyle={{ pointerEvents: 'none' }}
          />
          <Bar dataKey="count" shape={(props: any) => <ClickableBar {...props} onBarClick={onClickBar} />}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
