import { Button, Space, message } from 'antd';
import { FileExcelOutlined, FilePdfOutlined } from '@ant-design/icons';

interface ExportButtonsProps {
  /** Query string to append (e.g. "view=overview&severities=4,5") */
  queryString: string;
}

function downloadFile(url: string) {
  const token = localStorage.getItem('access_token');
  const fullUrl = `/api/export/${url}`;

  fetch(fullUrl, {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then((resp) => {
      if (!resp.ok) throw new Error('Export failed');
      const disposition = resp.headers.get('content-disposition');
      const match = disposition?.match(/filename="(.+)"/);
      const filename = match?.[1] || 'export';
      return resp.blob().then((blob) => ({ blob, filename }));
    })
    .then(({ blob, filename }) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    })
    .catch(() => {
      message.error("Erreur lors de l'export");
    });
}

export default function ExportButtons({ queryString }: ExportButtonsProps) {
  return (
    <Space>
      <Button
        icon={<FileExcelOutlined />}
        size="small"
        onClick={() => downloadFile(`csv?${queryString}`)}
      >
        CSV
      </Button>
      <Button
        icon={<FilePdfOutlined />}
        size="small"
        onClick={() => downloadFile(`pdf?${queryString}`)}
      >
        PDF
      </Button>
    </Space>
  );
}
