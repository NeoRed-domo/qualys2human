import { useNavigate } from 'react-router-dom';
import { Card, Tag } from 'antd';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, type ColDef } from 'ag-grid-community';

ModuleRegistry.registerModules([AllCommunityModule]);

interface TopVuln {
  qid: number;
  title: string;
  severity: number;
  count: number;
}

interface TopVulnsTableProps {
  data: TopVuln[];
}

const SEVERITY_TAG: Record<number, { color: string; label: string }> = {
  5: { color: 'red', label: 'Urgent' },
  4: { color: 'orange', label: 'Critique' },
  3: { color: 'gold', label: 'Sérieux' },
  2: { color: 'blue', label: 'Moyen' },
  1: { color: 'green', label: 'Minimal' },
};

export default function TopVulnsTable({ data }: TopVulnsTableProps) {
  const navigate = useNavigate();

  const colDefs: ColDef<TopVuln>[] = [
    { field: 'qid', headerName: 'QID', width: 90 },
    { field: 'title', headerName: 'Titre', flex: 1, minWidth: 200 },
    {
      field: 'severity',
      headerName: 'Sévérité',
      width: 120,
      cellRenderer: (params: any) => {
        const tag = SEVERITY_TAG[params.value];
        return tag ? <Tag color={tag.color}>{tag.label}</Tag> : params.value;
      },
    },
    { field: 'count', headerName: 'Occurrences', width: 120, sort: 'desc' },
  ];

  return (
    <Card title="Top 10 vulnérabilités" size="small">
      <div style={{ height: 360 }}>
        <AgGridReact<TopVuln>
          rowData={data}
          columnDefs={colDefs}
          domLayout="normal"
          rowHeight={36}
          headerHeight={38}
          onRowClicked={(e) => {
            if (e.data) navigate(`/vulnerabilities/${e.data.qid}`);
          }}
          rowStyle={{ cursor: 'pointer' }}
        />
      </div>
    </Card>
  );
}
