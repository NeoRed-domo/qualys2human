import { useState } from 'react';
import { Button, message } from 'antd';
import { FilePdfOutlined } from '@ant-design/icons';

interface PdfExportButtonProps {
  onExport: () => Promise<void>;
}

export default function PdfExportButton({ onExport }: PdfExportButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      await onExport();
      message.success('PDF généré avec succès');
    } catch (err: any) {
      console.error('PDF export error:', err);
      message.error('Erreur lors de la génération du PDF');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button icon={<FilePdfOutlined />} size="small" loading={loading} onClick={handleClick}>
      PDF
    </Button>
  );
}
