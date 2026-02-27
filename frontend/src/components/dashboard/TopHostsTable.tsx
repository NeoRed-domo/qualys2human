import { useNavigate } from 'react-router-dom';
import { Button, Card } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, type ColDef } from 'ag-grid-community';
import { exportToCsv } from '../../utils/csvExport';

ModuleRegistry.registerModules([AllCommunityModule]);

interface TopHost {
  ip: string;
  dns: string | null;
  os: string | null;
  host_count: number;
}

interface TopHostsTableProps {
  data: TopHost[];
}

export default function TopHostsTable({ data }: TopHostsTableProps) {
  const navigate = useNavigate();

  const colDefs: ColDef<TopHost>[] = [
    { field: 'ip', headerName: 'IP', width: 140 },
    { field: 'dns', headerName: 'DNS', flex: 1, minWidth: 180 },
    { field: 'os', headerName: 'OS', flex: 1, minWidth: 150 },
    { field: 'host_count', headerName: 'Vulnérabilités', width: 130, sort: 'desc' },
  ];

  return (
    <Card
      title="Top 10 hôtes"
      size="small"
      extra={
        <Button
          icon={<DownloadOutlined />}
          size="small"
          onClick={() => exportToCsv(colDefs, data, 'top-hotes.csv')}
        >
          CSV
        </Button>
      }
    >
      <AgGridReact<TopHost>
        rowData={data}
        columnDefs={colDefs}
        domLayout="autoHeight"
        rowHeight={36}
        headerHeight={38}
        onRowClicked={(e) => {
          if (e.data) navigate(`/hosts/${e.data.ip}`);
        }}
        rowStyle={{ cursor: 'pointer' }}
      />
    </Card>
  );
}
