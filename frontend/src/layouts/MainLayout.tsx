import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Dropdown, Button, Typography } from 'antd';
import {
  DashboardOutlined,
  LineChartOutlined,
  SettingOutlined,
  MonitorOutlined,
  UserOutlined,
  LogoutOutlined,
} from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import AppFooter from '../components/AppFooter';

const { Header, Content } = Layout;

const NAV_ITEMS = [
  { key: '/', label: 'Vue d\'ensemble', icon: <DashboardOutlined /> },
  { key: '/trends', label: 'Tendances', icon: <LineChartOutlined /> },
  { key: '/admin', label: 'Admin', icon: <SettingOutlined />, adminOnly: true },
  { key: '/monitoring', label: 'Monitoring', icon: <MonitorOutlined />, adminOnly: true },
  { key: '/profile', label: 'Mon Profil', icon: <UserOutlined /> },
];

export default function MainLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isAdmin = user?.profile === 'admin';

  const menuItems = NAV_ITEMS
    .filter((item) => !item.adminOnly || isAdmin)
    .map(({ key, label, icon }) => ({ key, label, icon }));

  const selectedKey = menuItems
    .map((i) => i.key)
    .filter((k) => location.pathname.startsWith(k))
    .sort((a, b) => b.length - a.length)[0] || '/';

  const userMenuItems = [
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Déconnexion',
      onClick: () => { logout(); navigate('/login'); },
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        background: '#001529',
      }}>
        <Typography.Title
          level={4}
          style={{ color: '#fff', margin: '0 32px 0 0', whiteSpace: 'nowrap' }}
        >
          Qualys2Human
        </Typography.Title>

        <Menu
          theme="dark"
          mode="horizontal"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ flex: 1, minWidth: 0 }}
        />

        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
          <Button type="text" style={{ color: '#fff' }}>
            <UserOutlined /> {user?.username}
          </Button>
        </Dropdown>
      </Header>

      <Content style={{ padding: 24, background: '#f0f2f5', flex: 1 }}>
        <Outlet />
      </Content>
      <AppFooter />
    </Layout>
  );
}
