import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Card, Table, Button, Modal, Form, Input, InputNumber, Select,
  ColorPicker, Popconfirm, message, Space, Typography, Progress, Tag,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SyncOutlined, CheckCircleOutlined, WarningOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import api from '../../api/client';

const { Text } = Typography;

interface Layer {
  id: number;
  name: string;
  color: string;
  position: number;
}

interface Rule {
  id: number;
  layer_id: number;
  match_field: string;
  pattern: string;
  priority: number;
}

export default function LayerRules() {
  const [layers, setLayers] = useState<Layer[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);

  // Reclassify state
  const [reclassifying, setReclassifying] = useState(false);
  const [reclassifyProgress, setReclassifyProgress] = useState(0);
  const [reclassifyInfo, setReclassifyInfo] = useState('');
  const [dirty, setDirty] = useState<boolean | null>(null); // null = unknown
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Layer modal state
  const [layerModalOpen, setLayerModalOpen] = useState(false);
  const [editingLayer, setEditingLayer] = useState<Layer | null>(null);
  const [layerForm] = Form.useForm();

  // Rule modal state
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [ruleForm] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    try {
      const layersResp = await api.get('/layers');
      setLayers(layersResp.data);

      // Load rules for all layers in parallel
      const ruleResponses = await Promise.all(
        layersResp.data.map((layer: Layer) => api.get(`/layers/${layer.id}/rules`))
      );
      const allRules: Rule[] = ruleResponses.flatMap((r) => r.data);
      allRules.sort((a, b) => b.priority - a.priority);
      setRules(allRules);
    } catch {
      message.error('Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  const loadDirtyStatus = async () => {
    try {
      const resp = await api.get('/layers/reclassify/status');
      setDirty(resp.data.dirty);
    } catch { /* ignore */ }
  };

  useEffect(() => { loadData(); loadDirtyStatus(); }, []);

  // --- Layer CRUD ---

  const openLayerCreate = () => {
    setEditingLayer(null);
    layerForm.resetFields();
    layerForm.setFieldsValue({ color: '#1677ff', position: layers.length });
    setLayerModalOpen(true);
  };

  const openLayerEdit = (layer: Layer) => {
    setEditingLayer(layer);
    layerForm.setFieldsValue({ name: layer.name, color: layer.color, position: layer.position });
    setLayerModalOpen(true);
  };

  const handleLayerSave = async () => {
    try {
      const values = await layerForm.validateFields();
      const color = typeof values.color === 'string' ? values.color : values.color?.toHexString?.() || '#1677ff';
      const payload = { name: values.name, color, position: values.position };
      if (editingLayer) {
        await api.put(`/layers/${editingLayer.id}`, payload);
        message.success('Catégorisation modifiée');
      } else {
        await api.post('/layers', payload);
        message.success('Catégorisation créée');
      }
      setLayerModalOpen(false);
      setDirty(true);
      loadData();
    } catch (err: any) {
      if (err.response) message.error(err.response.data?.detail || 'Erreur');
    }
  };

  const handleLayerDelete = async (id: number) => {
    try {
      await api.delete(`/layers/${id}`);
      message.success('Catégorisation supprimée');
      setDirty(true);
      loadData();
    } catch (err: any) {
      message.error(err.response?.data?.detail || 'Erreur');
    }
  };

  // --- Rule CRUD ---

  const openRuleCreate = () => {
    setEditingRule(null);
    ruleForm.resetFields();
    ruleForm.setFieldsValue({ match_field: 'title', priority: 0 });
    setRuleModalOpen(true);
  };

  const openRuleEdit = (rule: Rule) => {
    setEditingRule(rule);
    ruleForm.setFieldsValue({
      match_field: rule.match_field,
      pattern: rule.pattern,
      priority: rule.priority,
      layer_id: rule.layer_id,
    });
    setRuleModalOpen(true);
  };

  const handleRuleSave = async () => {
    try {
      const values = await ruleForm.validateFields();
      if (editingRule) {
        await api.put(`/layers/rules/${editingRule.id}`, {
          match_field: values.match_field,
          pattern: values.pattern,
          priority: values.priority,
          layer_id: values.layer_id,
        });
        message.success('Règle modifiée');
      } else {
        await api.post(`/layers/${values.layer_id}/rules`, {
          match_field: values.match_field,
          pattern: values.pattern,
          priority: values.priority,
        });
        message.success('Règle créée');
      }
      setRuleModalOpen(false);
      setDirty(true);
      loadData();
    } catch (err: any) {
      if (err.response) message.error(err.response.data?.detail || 'Erreur');
    }
  };

  const handleRuleDelete = async (id: number) => {
    try {
      await api.delete(`/layers/rules/${id}`);
      message.success('Règle supprimée');
      setDirty(true);
      loadData();
    } catch (err: any) {
      message.error(err.response?.data?.detail || 'Erreur');
    }
  };

  // --- Reclassify with progress polling ---

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Clean up polling on unmount
  useEffect(() => () => stopPolling(), [stopPolling]);

  const pollStatus = useCallback(() => {
    pollRef.current = setInterval(async () => {
      try {
        const resp = await api.get('/layers/reclassify/status');
        const { running, progress, rules_applied, total_rules, classified, error, dirty: d } = resp.data;
        setReclassifyProgress(progress);
        setReclassifyInfo(`${rules_applied}/${total_rules} règles — ${classified} vulns classifiées`);
        if (!running) {
          stopPolling();
          setReclassifying(false);
          setDirty(d);
          if (error) {
            message.error(`Erreur : ${error}`);
          } else {
            message.success(`Reclassification terminée : ${classified} vulnérabilités classifiées`);
          }
        }
      } catch {
        stopPolling();
        setReclassifying(false);
      }
    }, 1000);
  }, [stopPolling]);

  const handleReclassify = () => {
    // Fire-and-forget so the Popconfirm closes immediately
    setReclassifying(true);
    setReclassifyProgress(0);
    setReclassifyInfo('Démarrage...');
    api.post('/layers/reclassify').then((resp) => {
      if (!resp.data.started) {
        message.warning(resp.data.message);
        setReclassifying(false);
        return;
      }
      pollStatus();
    }).catch((err: any) => {
      message.error(err.response?.data?.detail || 'Erreur');
      setReclassifying(false);
    });
  };

  // --- Layer columns ---

  const layerColumns: ColumnsType<Layer> = [
    { title: 'Nom', dataIndex: 'name', key: 'name' },
    {
      title: 'Couleur', dataIndex: 'color', key: 'color',
      render: (color: string) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 20, height: 20, borderRadius: 4, background: color }} />
          <span>{color}</span>
        </div>
      ),
    },
    { title: 'Position', dataIndex: 'position', key: 'position', width: 90 },
    {
      title: 'Règles', key: 'ruleCount', width: 80,
      render: (_: unknown, record: Layer) => rules.filter((r) => r.layer_id === record.id).length,
    },
    {
      title: 'Actions', key: 'actions', width: 120,
      render: (_: unknown, record: Layer) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openLayerEdit(record)} />
          <Popconfirm title="Supprimer cette catégorisation ?" onConfirm={() => handleLayerDelete(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // --- Rule columns ---

  const layerNameMap = Object.fromEntries(layers.map((l) => [l.id, l.name]));

  const ruleColumns: ColumnsType<Rule> = [
    { title: 'Priorité', dataIndex: 'priority', key: 'priority', width: 90, sorter: (a, b) => b.priority - a.priority },
    { title: 'Champ', dataIndex: 'match_field', key: 'match_field', width: 100 },
    { title: 'Pattern', dataIndex: 'pattern', key: 'pattern' },
    {
      title: 'Catégorisation', key: 'layer', width: 130,
      render: (_: unknown, record: Rule) => layerNameMap[record.layer_id] || '—',
    },
    {
      title: 'Actions', key: 'actions', width: 120,
      render: (_: unknown, record: Rule) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openRuleEdit(record)} />
          <Popconfirm title="Supprimer cette règle ?" onConfirm={() => handleRuleDelete(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Space align="center">
          <Button type="primary" icon={<SyncOutlined spin={reclassifying} />} loading={reclassifying} disabled={reclassifying} onClick={handleReclassify}>
            Relancer la catégorisation
          </Button>
          {dirty === false && (
            <Tag icon={<CheckCircleOutlined />} color="success">À jour</Tag>
          )}
          {dirty === true && (
            <Tag icon={<WarningOutlined />} color="warning">Catégorisation obsolète — relancez la catégorisation</Tag>
          )}
        </Space>
        {reclassifying && (
          <div style={{ marginTop: 12, maxWidth: 500 }}>
            <Progress percent={reclassifyProgress} status="active" />
            <Text type="secondary" style={{ fontSize: 12 }}>{reclassifyInfo}</Text>
          </div>
        )}
      </div>

      <Card
        title="Catégorisations"
        extra={<Button icon={<PlusOutlined />} onClick={openLayerCreate}>Ajouter une catégorisation</Button>}
        style={{ marginBottom: 16 }}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          Les catégorisations permettent de regrouper les vulnérabilités par couche infrastructure (OS, Middleware, Applicatif, Réseau...).
        </Text>
        <Table
          columns={layerColumns}
          dataSource={layers}
          rowKey="id"
          loading={loading}
          pagination={false}
          size="small"
        />
      </Card>

      <Card
        title="Règles de classification"
        extra={<Button icon={<PlusOutlined />} onClick={openRuleCreate}>Ajouter une règle</Button>}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          Chaque règle associe un pattern (mot-clé) à une catégorisation. Lors de l'import ou de la reclassification,
          les règles sont évaluées par priorité décroissante (la première qui matche gagne).
        </Text>
        <Table
          columns={ruleColumns}
          dataSource={rules}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20 }}
          size="small"
        />
      </Card>

      {/* Layer modal */}
      <Modal
        title={editingLayer ? 'Modifier la catégorisation' : 'Nouvelle catégorisation'}
        open={layerModalOpen}
        onOk={handleLayerSave}
        onCancel={() => setLayerModalOpen(false)}
        okText="Enregistrer"
        cancelText="Annuler"
      >
        <Form form={layerForm} layout="vertical">
          <Form.Item name="name" label="Nom" rules={[{ required: true, message: 'Nom requis' }]}>
            <Input placeholder="Ex: OS, Middleware, Applicatif..." />
          </Form.Item>
          <Form.Item name="color" label="Couleur">
            <ColorPicker format="hex" />
          </Form.Item>
          <Form.Item name="position" label="Position (ordre d'affichage)">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Rule modal */}
      <Modal
        title={editingRule ? 'Modifier la règle' : 'Nouvelle règle'}
        open={ruleModalOpen}
        onOk={handleRuleSave}
        onCancel={() => setRuleModalOpen(false)}
        okText="Enregistrer"
        cancelText="Annuler"
      >
        <Form form={ruleForm} layout="vertical">
          <Form.Item name="layer_id" label="Catégorisation" rules={[{ required: true, message: 'Catégorisation requise' }]}>
            <Select
              placeholder="Sélectionner une catégorisation"
              options={layers.map((l) => ({ label: l.name, value: l.id }))}
            />
          </Form.Item>
          <Form.Item name="match_field" label="Champ cible" rules={[{ required: true }]}>
            <Select options={[
              { label: 'Titre (title)', value: 'title' },
              { label: 'Catégorie (category)', value: 'category' },
            ]} />
          </Form.Item>
          <Form.Item name="pattern" label="Pattern (mot-clé)" rules={[{ required: true, message: 'Pattern requis' }]}>
            <Input placeholder="Ex: windows, tomcat, tcp/ip..." />
          </Form.Item>
          <Form.Item name="priority" label="Priorité (plus haut = prioritaire)">
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
