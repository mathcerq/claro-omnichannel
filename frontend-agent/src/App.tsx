import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth.store';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ProtocolDetail from './pages/ProtocolDetail';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role === 'CLIENT') return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const initFromStorage = useAuthStore((s) => s.initFromStorage);

  useEffect(() => {
    initFromStorage();
  }, [initFromStorage]);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
      <Route path="/protocols/:id" element={<PrivateRoute><ProtocolDetail /></PrivateRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
