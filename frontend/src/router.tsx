import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { FilterProvider } from './contexts/FilterContext';
import Login from './pages/Login';
import MainLayout from './layouts/MainLayout';
import AdminLayout from './layouts/AdminLayout';
import Overview from './pages/Overview';
import VulnList from './pages/VulnList';
import VulnDetail from './pages/VulnDetail';
import HostList from './pages/HostList';
import HostDetail from './pages/HostDetail';
import FullDetail from './pages/FullDetail';

import ImportManager from './pages/admin/ImportManager';
import UserManagement from './pages/admin/UserManagement';
import EnterpriseRules from './pages/admin/EnterpriseRules';
import Branding from './pages/admin/Branding';
import LayerRules from './pages/admin/LayerRules';
import Monitoring from './pages/Monitoring';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function MonitoringGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.profile === 'monitoring') return <Navigate to="/monitoring" replace />;
  return <>{children}</>;
}

function Placeholder({ title }: { title: string }) {
  return <div style={{ padding: 24 }}><h2>{title}</h2><p>Coming soon...</p></div>;
}

export default function AppRouter() {
  const { isAuthenticated } = useAuth();

  return (
    <FilterProvider>
      <Routes>
        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to="/" replace /> : <Login />}
        />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <MainLayout />
            </PrivateRoute>
          }
        >
          <Route index element={<MonitoringGuard><Overview /></MonitoringGuard>} />
          <Route path="trends" element={<MonitoringGuard><Placeholder title="Tendances" /></MonitoringGuard>} />
          <Route path="admin" element={<MonitoringGuard><AdminLayout /></MonitoringGuard>}>
            <Route index element={<Navigate to="/admin/imports" replace />} />
            <Route path="imports" element={<ImportManager />} />
            <Route path="users" element={<UserManagement />} />
            <Route path="rules" element={<EnterpriseRules />} />
            <Route path="branding" element={<Branding />} />
            <Route path="layers" element={<LayerRules />} />
          </Route>
          <Route path="monitoring" element={<Monitoring />} />
          <Route path="profile" element={<MonitoringGuard><Placeholder title="Mon Profil" /></MonitoringGuard>} />
          <Route path="vulnerabilities" element={<MonitoringGuard><VulnList /></MonitoringGuard>} />
          <Route path="vulnerabilities/:qid" element={<MonitoringGuard><VulnDetail /></MonitoringGuard>} />
          <Route path="hosts" element={<MonitoringGuard><HostList /></MonitoringGuard>} />
          <Route path="hosts/:ip" element={<MonitoringGuard><HostDetail /></MonitoringGuard>} />
          <Route path="hosts/:ip/vulnerabilities/:qid" element={<MonitoringGuard><FullDetail /></MonitoringGuard>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </FilterProvider>
  );
}
