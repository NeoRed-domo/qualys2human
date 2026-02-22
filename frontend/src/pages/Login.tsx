import { useState } from 'react';
import { Card, Form, Input, Button, Select, Alert, Typography } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';

const { Title } = Typography;

export default function Login() {
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFinish = async (values: { username: string; password: string; domain: string }) => {
    setLoading(true);
    setError(null);
    try {
      await login(values.username, values.password, values.domain);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: '#f0f2f5',
    }}>
      <Card style={{ width: 400, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title level={3} style={{ margin: 0 }}>Qualys2Human</Title>
          <Typography.Text type="secondary">Connexion</Typography.Text>
        </div>

        {error && (
          <Alert
            message={error}
            type="error"
            showIcon
            closable
            style={{ marginBottom: 16 }}
            onClose={() => setError(null)}
          />
        )}

        <Form
          name="login"
          onFinish={onFinish}
          initialValues={{ domain: 'local' }}
          layout="vertical"
          size="large"
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: "Nom d'utilisateur requis" }]}
          >
            <Input
              id="q2h-login-username"
              prefix={<UserOutlined />}
              placeholder="Nom d'utilisateur"
              autoComplete="username"
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: 'Mot de passe requis' }]}
          >
            <Input.Password
              id="q2h-login-password"
              prefix={<LockOutlined />}
              placeholder="Mot de passe"
              autoComplete="current-password"
            />
          </Form.Item>

          <Form.Item name="domain">
            <Select id="q2h-login-domain">
              <Select.Option value="local">Local</Select.Option>
              <Select.Option value="ad">Active Directory</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item>
            <Button
              id="q2h-login-submit"
              type="primary"
              htmlType="submit"
              loading={loading}
              block
            >
              Se connecter
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
