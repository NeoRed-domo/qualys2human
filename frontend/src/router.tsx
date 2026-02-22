import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import MainLayout from './layouts/MainLayout';

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
        <Route index element={<Placeholder title="Vue d'ensemble" />} />
        <Route path="trends" element={<Placeholder title="Tendances" />} />
        <Route path="admin" element={<Placeholder title="Administration" />} />
        <Route path="monitoring" element={<Placeholder title="Monitoring" />} />
        <Route path="profile" element={<Placeholder title="Mon Profil" />} />
        <Route path="vulnerabilities/:qid" element={<Placeholder title="Détail Vulnérabilité" />} />
        <Route path="hosts/:ip" element={<Placeholder title="Détail Hôte" />} />
        <Route path="hosts/:ip/vulnerabilities/:qid" element={<Placeholder title="Détail Complet" />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
