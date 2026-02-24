import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Card,
  Table,
  Tag,
  Button,
  Upload,
  message,
  Progress,
  Space,
  Typography,
  Popconfirm,
  Modal,
  Input,
  notification,
  Switch,
  Form,
  Badge,
  DatePicker,
} from 'antd';
import dayjs from 'dayjs';
import {
  UploadOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  PlusOutlined,
  EditOutlined,
  EyeOutlined,
  FolderOpenOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { UploadProps } from 'antd';
import api from '../../api/client';

const { Text } = Typography;

// --- Watch path types ---

interface WatchPath {
  id: number;
  path: string;
  pattern: string;
  recursive: boolean;
  enabled: boolean;
  ignore_before: string | null;
  created_at: string;
  updated_at: string;
}

interface WatcherStatus {
  running: boolean;
  active_paths: number;
  known_files: number;
  scanning: boolean;
  importing: string | null;
  last_import: string | null;
  last_error: string | null;
  import_count: number;
}

// --- Import job types ---

interface ImportJob {
  id: number;
  scan_report_id: number;
  filename: string;
  source: string;
  report_date: string | null;
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
  // --- Watch paths state ---
  const [watchPaths, setWatchPaths] = useState<WatchPath[]>([]);
  const [watcherStatus, setWatcherStatus] = useState<WatcherStatus | null>(null);
  const [wpLoading, setWpLoading] = useState(false);
  const [wpModalOpen, setWpModalOpen] = useState(false);
  const [editingWp, setEditingWp] = useState<WatchPath | null>(null);
  const [wpForm] = Form.useForm();

  // --- Import jobs state ---
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');

  // --- Watch paths API ---

  const fetchWatchPaths = useCallback(async () => {
    setWpLoading(true);
    try {
      const [pathsResp, statusResp] = await Promise.all([
        api.get('/watcher/paths'),
        api.get('/watcher/status'),
      ]);
      setWatchPaths(pathsResp.data);
      setWatcherStatus(statusResp.data);
    } catch {
      // User may not be admin — silently ignore
    } finally {
      setWpLoading(false);
    }
  }, []);

  const handleCreateOrUpdateWp = async () => {
    try {
      const values = await wpForm.validateFields();
      const payload = {
        ...values,
        ignore_before: values.ignore_before ? values.ignore_before.toISOString() : null,
      };
      if (editingWp) {
        await api.put(`/watcher/paths/${editingWp.id}`, payload);
        message.success('Répertoire mis à jour');
      } else {
        await api.post('/watcher/paths', payload);
        message.success('Répertoire ajouté');
      }
      setWpModalOpen(false);
      setEditingWp(null);
      wpForm.resetFields();
      fetchWatchPaths();
    } catch (err: any) {
      const detail = err.response?.data?.detail || err.message || 'Erreur';
      message.error(detail);
    }
  };

  const handleToggleWp = async (wp: WatchPath, enabled: boolean) => {
    try {
      await api.put(`/watcher/paths/${wp.id}`, { enabled });
      fetchWatchPaths();
    } catch {
      message.error('Erreur lors de la mise à jour');
    }
  };

  const handleDeleteWp = async (id: number) => {
    try {
      await api.delete(`/watcher/paths/${id}`);
      message.success('Répertoire supprimé');
      fetchWatchPaths();
    } catch {
      message.error('Erreur lors de la suppression');
    }
  };

  const openEditWp = (wp: WatchPath) => {
    setEditingWp(wp);
    wpForm.setFieldsValue({
      path: wp.path,
      pattern: wp.pattern,
      recursive: wp.recursive,
      enabled: wp.enabled,
      ignore_before: wp.ignore_before ? dayjs(wp.ignore_before) : null,
    });
    setWpModalOpen(true);
  };

  const openCreateWp = () => {
    setEditingWp(null);
    wpForm.resetFields();
    wpForm.setFieldsValue({ pattern: '*.csv', recursive: false, enabled: true });
    setWpModalOpen(true);
  };

  // --- Import jobs API ---

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
    fetchWatchPaths();
    fetchJobs();
  }, [fetchWatchPaths, fetchJobs]);

  // Auto-refresh if any job is still processing
  useEffect(() => {
    const hasProcessing = jobs.some((j) => j.status === 'processing');
    if (!hasProcessing) return;
    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, [jobs, fetchJobs]);

  // Auto-refresh watcher status while scanning or importing (every 3s)
  const watcherActiveRef = useRef(false);
  watcherActiveRef.current = !!(watcherStatus?.scanning || watcherStatus?.importing);
  useEffect(() => {
    if (!watcherActiveRef.current) return;
    const interval = setInterval(async () => {
      try {
        const resp = await api.get('/watcher/status');
        setWatcherStatus(resp.data);
        // If import just finished, also refresh jobs list
        if (!resp.data.scanning && !resp.data.importing) {
          fetchJobs();
        }
      } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [watcherStatus?.scanning, watcherStatus?.importing, fetchJobs]);

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
        notification.error({
          message: "Erreur d'import",
          description: err.message || "Erreur lors de l'upload",
          duration: 0,
        });
        onError?.(err);
      } finally {
        setUploading(false);
      }
    },
  };

  const handleDeleteReport = async (reportId: number) => {
    try {
      await api.delete(`/imports/report/${reportId}`);
      message.success('Rapport supprimé avec succès');
      fetchJobs();
    } catch (err: any) {
      const detail = err.response?.data?.detail || 'Erreur lors de la suppression';
      message.error(detail);
    }
  };

  const handleResetAll = async () => {
    try {
      await api.delete('/imports/reset-all');
      message.success('Base réinitialisée avec succès');
      setResetModalOpen(false);
      setResetConfirmText('');
      fetchJobs();
    } catch (err: any) {
      const detail = err.response?.data?.detail || 'Erreur lors de la réinitialisation';
      message.error(detail);
    }
  };

  // --- Watch paths columns ---

  const wpColumns: ColumnsType<WatchPath> = [
    {
      title: 'Chemin',
      dataIndex: 'path',
      width: '40%',
      ellipsis: true,
      render: (p: string) => (
        <Space>
          <FolderOpenOutlined />
          <Text copyable style={{ fontFamily: 'monospace', fontSize: 12 }}>{p}</Text>
        </Space>
      ),
    },
    {
      title: 'Pattern',
      dataIndex: 'pattern',
      width: 150,
      render: (p: string) => <Text code>{p}</Text>,
    },
    {
      title: 'Récursif',
      dataIndex: 'recursive',
      width: 90,
      align: 'center',
      render: (r: boolean) => (r ? <Tag color="blue">Oui</Tag> : <Tag>Non</Tag>),
    },
    {
      title: 'Ignorer avant',
      dataIndex: 'ignore_before',
      width: 130,
      render: (dt: string | null) => {
        if (!dt) return '\u2014';
        try {
          return new Date(dt).toLocaleDateString('fr-FR');
        } catch {
          return dt;
        }
      },
    },
    {
      title: 'Actif',
      dataIndex: 'enabled',
      width: 80,
      align: 'center',
      render: (enabled: boolean, record: WatchPath) => (
        <Switch
          checked={enabled}
          size="small"
          onChange={(checked) => handleToggleWp(record, checked)}
        />
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_: unknown, record: WatchPath) => (
        <Space size="small">
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEditWp(record)}
          />
          <Popconfirm
            title="Supprimer ce répertoire surveillé ?"
            onConfirm={() => handleDeleteWp(record.id)}
            okText="Supprimer"
            okType="danger"
            cancelText="Annuler"
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // --- Import jobs columns ---

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
      title: 'Date rapport',
      dataIndex: 'report_date',
      width: 130,
      render: (dt: string | null) => {
        if (!dt) return '—';
        try {
          return new Date(dt).toLocaleDateString('fr-FR');
        } catch {
          return dt;
        }
      },
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
      render: (_: unknown, record: ImportJob) => {
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
      title: 'Date import',
      dataIndex: 'started_at',
      width: 170,
      render: (dt: string | null) => dt || '—',
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 80,
      render: (_: unknown, record: ImportJob) => (
        <Popconfirm
          title="Supprimer ce rapport et toutes ses vulnérabilités associées ?"
          onConfirm={() => handleDeleteReport(record.scan_report_id)}
          okText="Supprimer"
          okType="danger"
          cancelText="Annuler"
        >
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            disabled={record.status === 'processing'}
          />
        </Popconfirm>
      ),
    },
  ];

  // --- Watcher status badge ---
  const statusBadge = watcherStatus ? (
    <Space direction="vertical" size={0} style={{ lineHeight: 1.4 }}>
      {watcherStatus.importing ? (
        <Badge
          status="warning"
          text={
            <span>
              <SyncOutlined spin style={{ color: '#fa8c16', marginRight: 4 }} />
              Import en cours : <Text strong style={{ fontSize: 12 }}>{watcherStatus.importing}</Text>
            </span>
          }
        />
      ) : watcherStatus.scanning ? (
        <Badge
          status="processing"
          text={
            <span>
              <SyncOutlined spin style={{ color: '#1890ff', marginRight: 4 }} />
              Scan en cours...
            </span>
          }
        />
      ) : watcherStatus.active_paths > 0 ? (
        <Badge
          status="success"
          text={
            <span>
              <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 4 }} />
              {watcherStatus.active_paths} répertoire(s) actif(s) — {watcherStatus.import_count} import(s)
            </span>
          }
        />
      ) : (
        <Badge status="default" text="Aucun répertoire surveillé" />
      )}
      {watcherStatus.last_error && (
        <Text type="danger" style={{ fontSize: 11 }}>
          Dernier échec : {watcherStatus.last_error}
        </Text>
      )}
    </Space>
  ) : null;

  return (
    <div>
      {/* Watch paths section */}
      <Card
        title={
          <Space>
            <EyeOutlined />
            <span>Répertoires surveillés</span>
          </Space>
        }
        extra={
          <Space>
            {statusBadge}
            <Button
              type="primary"
              icon={<PlusOutlined />}
              size="small"
              onClick={openCreateWp}
            >
              Ajouter un répertoire
            </Button>
          </Space>
        }
        style={{ marginBottom: 16 }}
        size="small"
      >
        <Table<WatchPath>
          dataSource={watchPaths}
          columns={wpColumns}
          rowKey="id"
          loading={wpLoading}
          size="small"
          pagination={false}
          locale={{ emptyText: 'Aucun répertoire surveillé' }}
        />
      </Card>

      {/* Import history section */}
      <Card
        title="Gestion des imports"
        extra={
          <Space>
            <Upload {...uploadProps}>
              <Button icon={<UploadOutlined />} loading={uploading} type="primary">
                Importer un CSV
              </Button>
            </Upload>
            <Button icon={<ReloadOutlined />} onClick={() => { fetchJobs(); fetchWatchPaths(); }} loading={loading}>
              Actualiser
            </Button>
            <Button
              danger
              icon={<ExclamationCircleOutlined />}
              onClick={() => setResetModalOpen(true)}
            >
              Réinitialiser toute la base
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

      {/* Reset modal */}
      <Modal
        title="Réinitialiser toute la base"
        open={resetModalOpen}
        onCancel={() => {
          setResetModalOpen(false);
          setResetConfirmText('');
        }}
        okText="Réinitialiser"
        okType="danger"
        okButtonProps={{ disabled: resetConfirmText !== 'CONFIRMER' }}
        onOk={handleResetAll}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text type="danger" strong>
            Attention : cette action va supprimer TOUS les rapports, vulnérabilités et hôtes
            importés. Cette action est irréversible.
          </Text>
          <Text>
            Tapez <Text code>CONFIRMER</Text> pour valider :
          </Text>
          <Input
            value={resetConfirmText}
            onChange={(e) => setResetConfirmText(e.target.value)}
            placeholder="CONFIRMER"
          />
        </Space>
      </Modal>

      {/* Watch path create/edit modal */}
      <Modal
        title={editingWp ? 'Modifier le répertoire' : 'Ajouter un répertoire surveillé'}
        open={wpModalOpen}
        onCancel={() => {
          setWpModalOpen(false);
          setEditingWp(null);
          wpForm.resetFields();
        }}
        onOk={handleCreateOrUpdateWp}
        okText={editingWp ? 'Enregistrer' : 'Ajouter'}
      >
        <Form form={wpForm} layout="vertical">
          <Form.Item
            name="path"
            label="Chemin du répertoire"
            rules={[{ required: true, message: 'Chemin requis' }]}
          >
            <Input placeholder="C:\Qualys\Reports ou \\serveur\partage\qualys" />
          </Form.Item>
          <Form.Item name="pattern" label="Pattern de fichier">
            <Input placeholder="*.csv" />
          </Form.Item>
          <Form.Item name="recursive" label="Scan récursif" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="ignore_before" label="Ignorer les fichiers avant">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="enabled" label="Actif" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
