import { Tabs } from 'antd';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';

const ADMIN_TABS = [
  { key: '/admin/imports', label: 'Imports' },
  { key: '/admin/users', label: 'Utilisateurs' },
  { key: '/admin/rules', label: 'Règles entreprise' },
  { key: '/admin/branding', label: 'Branding' },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const activeKey = ADMIN_TABS.find((t) => location.pathname.startsWith(t.key))?.key || '/admin/imports';

  return (
    <div>
      <Tabs
        activeKey={activeKey}
        onChange={(key) => navigate(key)}
        items={ADMIN_TABS}
        style={{ marginBottom: 16 }}
      />
      <Outlet />
    </div>
  );
}
