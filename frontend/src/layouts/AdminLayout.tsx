import { Tabs } from 'antd';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import HelpTooltip from '../components/help/HelpTooltip';
import type { HelpTopic } from '../components/help/HelpPanel';

const ADMIN_TABS = [
  { key: '/admin/imports', label: 'Imports' },
  { key: '/admin/users', label: 'Utilisateurs' },
  { key: '/admin/rules', label: 'Règles entreprise' },
  { key: '/admin/layers', label: 'Catégorisation' },
  { key: '/admin/branding', label: 'Branding' },
];

const TAB_HELP: Record<string, HelpTopic> = {
  '/admin/imports': 'admin-imports',
  '/admin/users': 'admin-users',
  '/admin/rules': 'admin-rules',
  '/admin/layers': 'admin-rules',
  '/admin/branding': 'admin-branding',
};

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const activeKey = ADMIN_TABS.find((t) => location.pathname.startsWith(t.key))?.key || '/admin/imports';
  const helpTopic = TAB_HELP[activeKey] || 'admin-imports';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Tabs
          activeKey={activeKey}
          onChange={(key) => navigate(key)}
          items={ADMIN_TABS}
          style={{ marginBottom: 16, flex: 1 }}
        />
        <HelpTooltip topic={helpTopic} style={{ marginBottom: 16 }} />
      </div>
      <Outlet />
    </div>
  );
}
