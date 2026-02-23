import { useEffect, useState } from 'react';
import { Card, Checkbox, Button, message, Spin, Typography, Divider } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import api from '../../api/client';

const { Text } = Typography;

const SEVERITY_OPTIONS = [
  { value: 1, label: 'Minimal (1)' },
  { value: 2, label: 'Moyen (2)' },
  { value: 3, label: 'Sérieux (3)' },
  { value: 4, label: 'Critique (4)' },
  { value: 5, label: 'Urgent (5)' },
];

const TYPE_OPTIONS = [
  { value: 'Vuln', label: 'Vulnérabilité' },
  { value: 'Practice', label: 'Pratique' },
  { value: 'Ig', label: 'Information' },
];

interface LayerOption {
  id: number;
  name: string;
}

export default function EnterpriseRules() {
  const [severities, setSeverities] = useState<number[]>([1, 2, 3, 4, 5]);
  const [types, setTypes] = useState<string[]>([]);
  const [layers, setLayers] = useState<number[]>([]);
  const [layerOptions, setLayerOptions] = useState<LayerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [presetResp, layersResp] = await Promise.all([
          api.get('/presets/enterprise'),
          api.get('/layers'),
        ]);
        setSeverities(presetResp.data.severities);
        setTypes(presetResp.data.types);
        setLayers(presetResp.data.layers || []);
        setLayerOptions(layersResp.data);
      } catch {
        message.error('Erreur lors du chargement');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/presets/enterprise', { severities, types, layers });
      message.success('Règles enregistrées');
    } catch (err: any) {
      message.error(err.response?.data?.detail || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spin style={{ display: 'block', margin: '80px auto' }} size="large" />;

  return (
    <div>
      <Card
        title="Règles entreprise"
        extra={
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
            Enregistrer
          </Button>
        }
      >
        <Text type="secondary">
          Ces règles définissent les filtres par défaut appliqués à tous les utilisateurs.
        </Text>

        <Divider titlePlacement="left">Sévérités visibles</Divider>
        <Checkbox.Group
          value={severities}
          onChange={(vals) => setSeverities(vals as number[])}
          options={SEVERITY_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
        />

        <Divider titlePlacement="left">Types de vulnérabilités</Divider>
        <Checkbox.Group
          value={types}
          onChange={(vals) => setTypes(vals as string[])}
          options={TYPE_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
        />
        {types.length === 0 && (
          <div style={{ marginTop: 8 }}>
            <Text type="secondary">Aucun filtre de type — tous les types sont affichés.</Text>
          </div>
        )}

        <Divider titlePlacement="left">Catégorisations visibles</Divider>
        <Checkbox.Group
          value={layers}
          onChange={(vals) => setLayers(vals as number[])}
          options={layerOptions.map((l) => ({ label: l.name, value: l.id }))}
        />
        {layers.length === 0 && (
          <div style={{ marginTop: 8 }}>
            <Text type="secondary">Aucun filtre de catégorisation — toutes les catégorisations sont affichées.</Text>
          </div>
        )}
      </Card>
    </div>
  );
}
