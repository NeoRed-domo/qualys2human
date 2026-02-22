import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { FilterProvider } from './contexts/FilterContext';
import Login from './pages/Login';
import MainLayout from './layouts/MainLayout';
import AdminLayout from './layouts/AdminLayout';
import Overview from './pages/Overview';
import VulnDetail from './pages/VulnDetail';
import HostDetail from './pages/HostDetail';
import FullDetail from './pages/FullDetail';
import Trends from './pages/Trends';
import ImportManager from './pages/admin/ImportManager';
import UserManagement from './pages/admin/UserManagement';
import EnterpriseRules from './pages/admin/EnterpriseRules';
import Branding from './pages/admin/Branding';
import Monitoring from './pages/Monitoring';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
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
          <Route index element={<Overview />} />
          <Route path="trends" element={<Trends />} />
          <Route path="admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/imports" replace />} />
            <Route path="imports" element={<ImportManager />} />
            <Route path="users" element={<UserManagement />} />
            <Route path="rules" element={<EnterpriseRules />} />
            <Route path="branding" element={<Branding />} />
          </Route>
          <Route path="monitoring" element={<Monitoring />} />
          <Route path="profile" element={<Placeholder title="Mon Profil" />} />
          <Route path="vulnerabilities/:qid" element={<VulnDetail />} />
          <Route path="hosts/:ip" element={<HostDetail />} />
          <Route path="hosts/:ip/vulnerabilities/:qid" element={<FullDetail />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </FilterProvider>
  );
}
