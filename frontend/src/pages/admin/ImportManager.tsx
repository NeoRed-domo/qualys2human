import { useEffect, useState, useCallback } from 'react';
import { Card, Table, Tag, Button, Upload, message, Progress, Space, Typography } from 'antd';
import {
  UploadOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { UploadProps } from 'antd';
import api from '../../api/client';

const { Text } = Typography;

interface ImportJob {
  id: number;
  scan_report_id: number;
  filename: string;
  source: string;
  status: string;
  progress: number;
  rows_processed: number;
  rows_total: number;
  started_at: string | null;
  ended_at: string | null;
  error_message: string | null;
}

const STATUS_TAG: Record<string, { color: string; icon: React.ReactNode }> = {
  done: { color: 'success', icon: <CheckCircleOutlined /> },
  processing: { color: 'processing', icon: <SyncOutlined spin /> },
  pending: { color: 'default', icon: <ClockCircleOutlined /> },
  error: { color: 'error', icon: <CloseCircleOutlined /> },
};

export default function ImportManager() {
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await api.get(`/imports?page=${page}&page_size=15`);
      setJobs(resp.data.items);
      setTotal(resp.data.total);
    } catch {
      message.error('Erreur lors du chargement des imports');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Auto-refresh if any job is still processing
  useEffect(() => {
    const hasProcessing = jobs.some((j) => j.status === 'processing');
    if (!hasProcessing) return;
    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, [jobs, fetchJobs]);

  const uploadProps: UploadProps = {
    name: 'file',
    accept: '.csv',
    showUploadList: false,
    customRequest: async (options) => {
      const { file, onSuccess, onError } = options;
      setUploading(true);
      const formData = new FormData();
      formData.append('file', file as Blob);
      try {
        const token = localStorage.getItem('access_token');
        const resp = await fetch('/api/imports/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        if (!resp.ok) {
          const err = await resp.json();
          throw new Error(err.detail || 'Upload failed');
        }
        const data = await resp.json();
        message.success(`Import terminé — ${data.rows_processed} lignes traitées`);
        onSuccess?.(data);
        fetchJobs();
      } catch (err: any) {
        message.error(err.message || "Erreur lors de l'upload");
        onError?.(err);
      } finally {
        setUploading(false);
      }
    },
  };

  const columns: ColumnsType<ImportJob> = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 60,
    },
    {
      title: 'Fichier',
      dataIndex: 'filename',
      ellipsis: true,
    },
    {
      title: 'Source',
      dataIndex: 'source',
      width: 90,
      render: (s: string) => (
        <Tag color={s === 'auto' ? 'blue' : 'green'}>{s === 'auto' ? 'Auto' : 'Manuel'}</Tag>
      ),
    },
    {
      title: 'Statut',
      dataIndex: 'status',
      width: 120,
      render: (status: string) => {
        const cfg = STATUS_TAG[status] || STATUS_TAG.pending;
        return (
          <Tag icon={cfg.icon} color={cfg.color}>
            {status}
          </Tag>
        );
      },
    },
    {
      title: 'Progression',
      key: 'progress',
      width: 180,
      render: (_: any, record: ImportJob) => {
        if (record.status === 'done') {
          return <Text type="success">{record.rows_processed} lignes</Text>;
        }
        if (record.status === 'error') {
          return <Text type="danger">{record.error_message || 'Erreur'}</Text>;
        }
        return (
          <Progress
            percent={record.progress}
            size="small"
            format={() => `${record.rows_processed}/${record.rows_total}`}
          />
        );
      },
    },
    {
      title: 'Rapport',
      dataIndex: 'scan_report_id',
      width: 80,
      render: (id: number) => `#${id}`,
    },
    {
      title: 'Date',
      dataIndex: 'started_at',
      width: 170,
      render: (dt: string | null) => dt || '—',
    },
  ];

  return (
    <div>
      <Card
        title="Gestion des imports"
        extra={
          <Space>
            <Upload {...uploadProps}>
              <Button icon={<UploadOutlined />} loading={uploading} type="primary">
                Importer un CSV
              </Button>
            </Upload>
            <Button icon={<ReloadOutlined />} onClick={fetchJobs} loading={loading}>
              Actualiser
            </Button>
          </Space>
        }
      >
        <Table<ImportJob>
          dataSource={jobs}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{
            current: page,
            total,
            pageSize: 15,
            showSizeChanger: false,
            onChange: setPage,
          }}
        />
      </Card>
    </div>
  );
}
