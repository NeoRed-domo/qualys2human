import { useEffect, useState } from 'react';
import { Card, InputNumber, Button, Space, message, Spin, Form } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import api from '../../api/client';

interface FreshnessValues {
  stale_days: number;
  hide_days: number;
}

export default function Settings() {
  const [form] = Form.useForm<FreshnessValues>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get('/settings/freshness')
      .then((resp) => {
        form.setFieldsValue(resp.data);
      })
      .catch(() => {
        message.error('Impossible de charger les paramètres');
      })
      .finally(() => setLoading(false));
  }, [form]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await api.put('/settings/freshness', values);
      message.success('Paramètres enregistrés');
    } catch (err: any) {
      const detail = err.response?.data?.detail || err.message || 'Erreur';
      message.error(detail);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Spin spinning={loading}>
      <Card title="Paramètres d'affichage" style={{ maxWidth: 600 }}>
        <Form form={form} layout="vertical" initialValues={{ stale_days: 7, hide_days: 30 }}>
          <Form.Item
            name="stale_days"
            label="Seuil peut-être obsolète (jours)"
            rules={[{ required: true, message: 'Valeur requise' }]}
            tooltip="Les vulnérabilités non vues depuis ce nombre de jours seront marquées comme potentiellement obsolètes."
          >
            <InputNumber min={1} max={365} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="hide_days"
            label="Seuil masquée (jours)"
            rules={[{ required: true, message: 'Valeur requise' }]}
            tooltip="Les vulnérabilités non vues depuis ce nombre de jours seront masquées par défaut."
          >
            <InputNumber min={1} max={3650} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={handleSave}
                loading={saving}
              >
                Enregistrer
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </Spin>
  );
}
