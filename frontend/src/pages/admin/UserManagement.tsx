import { useEffect, useState, useCallback } from 'react';
import {
  Card, Table, Tag, Button, Space, Modal, Form, Input, Select, Switch, message,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import api from '../../api/client';

interface UserRow {
  id: number;
  username: string;
  auth_type: string;
  profile_name: string;
  profile_id: number;
  ad_domain: string | null;
  is_active: boolean;
  must_change_password: boolean;
  last_login: string | null;
}

interface Profile {
  id: number;
  name: string;
  type: string;
}

export default function UserManagement() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [form] = Form.useForm();

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await api.get(`/users?page=${page}&page_size=20`);
      setUsers(resp.data.items);
      setTotal(resp.data.total);
    } catch {
      message.error('Erreur lors du chargement des utilisateurs');
    } finally {
      setLoading(false);
    }
  }, [page]);

  const fetchProfiles = useCallback(async () => {
    try {
      const resp = await api.get('/users/profiles');
      setProfiles(resp.data);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchProfiles();
  }, [fetchUsers, fetchProfiles]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (user: UserRow) => {
    setEditing(user);
    form.setFieldsValue({
      username: user.username,
      profile_id: user.profile_id,
      is_active: user.is_active,
      must_change_password: user.must_change_password,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editing) {
        const payload: Record<string, any> = {};
        if (values.password) payload.password = values.password;
        if (values.profile_id !== editing.profile_id) payload.profile_id = values.profile_id;
        if (values.is_active !== editing.is_active) payload.is_active = values.is_active;
        if (values.must_change_password !== editing.must_change_password)
          payload.must_change_password = values.must_change_password;

        await api.put(`/users/${editing.id}`, payload);
        message.success('Utilisateur mis à jour');
      } else {
        await api.post('/users', {
          username: values.username,
          password: values.password,
          profile_id: values.profile_id,
        });
        message.success('Utilisateur créé');
      }
      setModalOpen(false);
      fetchUsers();
    } catch (err: any) {
      message.error(err.response?.data?.detail || 'Erreur');
    }
  };

  const handleDelete = (user: UserRow) => {
    Modal.confirm({
      title: `Supprimer ${user.username} ?`,
      content: 'Cette action est irréversible.',
      okText: 'Supprimer',
      okType: 'danger',
      cancelText: 'Annuler',
      onOk: async () => {
        try {
          await api.delete(`/users/${user.id}`);
          message.success('Utilisateur supprimé');
          fetchUsers();
        } catch (err: any) {
          message.error(err.response?.data?.detail || 'Erreur');
        }
      },
    });
  };

  const columns: ColumnsType<UserRow> = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: 'Utilisateur', dataIndex: 'username' },
    {
      title: 'Profil', dataIndex: 'profile_name', width: 120,
      render: (name: string) => {
        const colors: Record<string, string> = {
          admin: 'red', user: 'blue', monitoring: 'green',
        };
        return <Tag color={colors[name] || 'default'}>{name}</Tag>;
      },
    },
    {
      title: 'Type', dataIndex: 'auth_type', width: 80,
      render: (t: string) => <Tag>{t}</Tag>,
    },
    {
      title: 'Actif', dataIndex: 'is_active', width: 70,
      render: (v: boolean) => (
        <Tag color={v ? 'success' : 'default'}>{v ? 'Oui' : 'Non'}</Tag>
      ),
    },
    { title: 'Dernier login', dataIndex: 'last_login', width: 170, render: (v: string | null) => v || '—' },
    {
      title: 'Actions', key: 'actions', width: 120,
      render: (_: any, record: UserRow) => (
        <Space size="small">
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)} />
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card
        title="Gestion des utilisateurs"
        extra={
          <Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              Nouvel utilisateur
            </Button>
            <Button icon={<ReloadOutlined />} onClick={fetchUsers} loading={loading}>
              Actualiser
            </Button>
          </Space>
        }
      >
        <Table<UserRow>
          dataSource={users}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{
            current: page,
            total,
            pageSize: 20,
            showSizeChanger: false,
            onChange: setPage,
          }}
        />
      </Card>

      <Modal
        title={editing ? `Modifier ${editing.username}` : 'Nouvel utilisateur'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        okText={editing ? 'Enregistrer' : 'Créer'}
        cancelText="Annuler"
      >
        <Form form={form} layout="vertical">
          {!editing && (
            <Form.Item
              name="username"
              label="Nom d'utilisateur"
              rules={[{ required: true, message: "Nom d'utilisateur requis" }]}
            >
              <Input />
            </Form.Item>
          )}
          <Form.Item
            name="password"
            label={editing ? 'Nouveau mot de passe (laisser vide pour ne pas changer)' : 'Mot de passe'}
            rules={editing ? [] : [{ required: true, message: 'Mot de passe requis' }]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item
            name="profile_id"
            label="Profil"
            rules={[{ required: true, message: 'Profil requis' }]}
          >
            <Select>
              {profiles.map((p) => (
                <Select.Option key={p.id} value={p.id}>
                  {p.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          {editing && (
            <>
              <Form.Item name="is_active" label="Actif" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item
                name="must_change_password"
                label="Forcer changement mot de passe"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>
    </div>
  );
}
