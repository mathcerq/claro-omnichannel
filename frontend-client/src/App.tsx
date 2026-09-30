import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth.store';
import Login from './pages/Login';
import Register from './pages/Register';
import Home from './pages/Home';
import NewProtocol from './pages/NewProtocol';
import ProtocolDetail from './pages/ProtocolDetail';
import TotpSetup from './pages/TotpSetup';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role !== 'CLIENT') return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const initFromStorage = useAuthStore((s) => s.initFromStorage);
  useEffect(() => { initFromStorage(); }, [initFromStorage]);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/" element={<PrivateRoute><Home /></PrivateRoute>} />
      <Route path="/new" element={<PrivateRoute><NewProtocol /></PrivateRoute>} />
      <Route path="/protocols/:id" element={<PrivateRoute><ProtocolDetail /></PrivateRoute>} />
      <Route path="/security" element={<PrivateRoute><TotpSetup /></PrivateRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
