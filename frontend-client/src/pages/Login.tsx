import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, Eye, EyeOff, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { useAuthStore } from '../store/auth.store';

export default function Login() {
  const navigate = useNavigate();
  const { setAuth, isAuthenticated } = useAuthStore();
  const [step, setStep] = useState<'credentials' | 'otp'>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) navigate('/');
  }, [isAuthenticated, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      if (res.data.requiresOtp) {
        setTempToken(res.data.tempToken);
        setStep('otp');
      } else {
        setAuth(res.data.user, res.data.accessToken, res.data.refreshToken);
        navigate('/');
      }
    } catch {} finally {
      setLoading(false);
    }
  };

  const handleOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post('/auth/verify-otp', { tempToken, code: otpCode });
      setAuth(res.data.user, res.data.accessToken, res.data.refreshToken);
      navigate('/');
    } catch {
      setOtpCode('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="bg-claro-red px-6 pt-12 pb-16">
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
            <Shield size={22} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Claro</h1>
        </div>
        <p className="text-red-200 text-center text-sm">Central de Atendimento</p>
      </div>

      <div className="flex-1 -mt-6 bg-white rounded-t-3xl px-6 pt-8 pb-6">
        {step === 'credentials' ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Entrar na sua conta</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">E-mail</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="seu@email.com" required autoFocus />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Senha</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pr-12"
                  placeholder="Sua senha"
                  required
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary flex items-center justify-center gap-2 mt-6">
              {loading ? <Loader2 size={18} className="animate-spin" /> : null}
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
            <p className="text-center text-sm text-gray-500 mt-4">
              Não tem conta?{' '}
              <Link to="/register" className="text-claro-red font-semibold">Cadastrar</Link>
            </p>
            <div className="mt-4 p-3 bg-gray-50 rounded-xl text-xs text-gray-500 space-y-1">
              <p className="font-medium text-gray-600">Conta demo (senha: Claro@2024):</p>
              <p>carlos.cliente@email.com</p>
              <p>fernanda.cliente@email.com</p>
            </div>
          </form>
        ) : (
          <form onSubmit={handleOtp} className="space-y-4">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Shield size={32} className="text-claro-red" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">Verificação 2FA</h2>
              <p className="text-sm text-gray-500 mt-1">Digite o código do seu app autenticador</p>
            </div>
            <input
              type="text"
              inputMode="numeric"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="input text-center text-3xl tracking-[0.6em] font-mono"
              placeholder="000000"
              maxLength={6}
              required
              autoFocus
            />
            <button type="submit" disabled={loading || otpCode.length !== 6} className="btn-primary flex items-center justify-center gap-2">
              {loading ? <Loader2 size={18} className="animate-spin" /> : null}
              Verificar
            </button>
            <button type="button" onClick={() => { setStep('credentials'); setOtpCode(''); }} className="btn-secondary">
              Voltar
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
