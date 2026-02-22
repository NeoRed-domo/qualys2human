import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Responsive, WidthProvider, type Layout } from 'react-grid-layout';
import { Button, Tooltip } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import api from '../../api/client';
import 'react-grid-layout/css/styles.css';

const ResponsiveGridLayout = WidthProvider(Responsive);

export interface WidgetDef {
  key: string;
  label: string;
  content: ReactNode;
}

const DEFAULT_LAYOUT: Layout[] = [
  { i: 'kpi', x: 0, y: 0, w: 12, h: 3, isResizable: false },
  { i: 'severity', x: 0, y: 3, w: 6, h: 5 },
  { i: 'category', x: 6, y: 3, w: 6, h: 5 },
  { i: 'topVulns', x: 0, y: 8, w: 6, h: 5 },
  { i: 'topHosts', x: 6, y: 8, w: 6, h: 5 },
];

interface WidgetGridProps {
  widgets: WidgetDef[];
}

export default function WidgetGrid({ widgets }: WidgetGridProps) {
  const [layout, setLayout] = useState<Layout[]>(DEFAULT_LAYOUT);
  const [loaded, setLoaded] = useState(false);

  // Load saved layout from preferences
  useEffect(() => {
    api.get('/user/preferences')
      .then((resp) => {
        const saved = resp.data.layout;
        if (saved && Array.isArray(saved) && saved.length > 0) {
          setLayout(saved);
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const handleLayoutChange = useCallback((newLayout: Layout[]) => {
    setLayout(newLayout);
    // Debounce save — save after drag ends
    api.put('/user/preferences', { layout: newLayout }).catch(() => {});
  }, []);

  const handleReset = useCallback(() => {
    setLayout(DEFAULT_LAYOUT);
    api.delete('/user/preferences/layout').catch(() => {});
  }, []);

  const widgetMap = new Map(widgets.map((w) => [w.key, w]));

  if (!loaded) return null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
        <Tooltip title="Réinitialiser la disposition">
          <Button size="small" icon={<ReloadOutlined />} onClick={handleReset}>
            Disposition par défaut
          </Button>
        </Tooltip>
      </div>
      <ResponsiveGridLayout
        layouts={{ lg: layout }}
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480 }}
        cols={{ lg: 12, md: 12, sm: 6, xs: 1 }}
        rowHeight={60}
        onLayoutChange={(current) => handleLayoutChange(current)}
        draggableHandle=".widget-drag-handle"
        isResizable={false}
      >
        {layout.map((item) => {
          const widget = widgetMap.get(item.i);
          if (!widget) return <div key={item.i} />;
          return (
            <div key={item.i} style={{ overflow: 'hidden' }}>
              <div
                className="widget-drag-handle"
                style={{
                  cursor: 'grab',
                  padding: '2px 8px',
                  fontSize: 11,
                  color: '#8c8c8c',
                  borderBottom: '1px solid #f0f0f0',
                  background: '#fafafa',
                  borderRadius: '8px 8px 0 0',
                  userSelect: 'none',
                }}
              >
                &#9776; {widget.label}
              </div>
              <div style={{ padding: 0, height: 'calc(100% - 24px)', overflow: 'auto' }}>
                {widget.content}
              </div>
            </div>
          );
        })}
      </ResponsiveGridLayout>
    </div>
  );
}
