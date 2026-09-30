import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Eye, EyeOff, Loader2, AlertTriangle, Smartphone, CheckCircle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { useAuthStore } from '../store/auth.store';

type Step = 'credentials' | 'otp' | 'setup-info' | 'setup-qr' | 'setup-verify';

export default function Login() {
  const navigate = useNavigate();
  const { setAuth, isAuthenticated } = useAuthStore();

  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [qrData, setQrData] = useState<{ secret: string; qrCodeDataUrl: string } | null>(null);
  const [setupCode, setSetupCode] = useState('');
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

      if (res.data.requiresTotpSetup) {
        // Perfil privilegiado sem 2FA — setup obrigatório
        setSetupToken(res.data.setupToken);
        setStep('setup-info');
        toast('2FA obrigatório para este perfil', { icon: '🔐' });
      } else if (res.data.requiresOtp) {
        setTempToken(res.data.tempToken);
        setStep('otp');
        toast.success('Insira o código do seu autenticador');
      } else {
        setAuth(res.data.user, res.data.accessToken, res.data.refreshToken);
        toast.success(`Bem-vindo, ${res.data.user.name}!`);
        navigate('/');
      }
    } catch {
      /* handled by interceptor */
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post('/auth/verify-otp', { tempToken, code: otpCode });
      setAuth(res.data.user, res.data.accessToken, res.data.refreshToken);
      toast.success(`Bem-vindo, ${res.data.user.name}!`);
      navigate('/');
    } catch {
      setOtpCode('');
    } finally {
      setLoading(false);
    }
  };

  const handleStartSetup = async () => {
    setLoading(true);
    try {
      // Usa o setupToken (token restrito) para gerar o QR
      const res = await api.get('/auth/totp/setup', {
        headers: { Authorization: `Bearer ${setupToken}` },
      });
      setQrData(res.data);
      setStep('setup-qr');
    } catch {} finally {
      setLoading(false);
    }
  };

  const handleConfirmSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post(
        '/auth/totp/enable',
        { code: setupCode },
        { headers: { Authorization: `Bearer ${setupToken}` } },
      );
      toast.success('2FA ativado! Faça login novamente com seu código.');
      // Reinicia o fluxo de login para o usuário autenticar com 2FA
      setStep('credentials');
      setSetupCode('');
      setSetupToken('');
      setQrData(null);
    } catch {
      setSetupCode('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-claro-red rounded-2xl mb-4 shadow-lg shadow-red-900/30">
            <Shield size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Claro Omnichannel</h1>
          <p className="text-gray-400 mt-1">Painel do Atendente</p>
        </div>

        <div className="card p-6">

          {/* PASSO 1 — Credenciais */}
          {step === 'credentials' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">E-mail</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="input" placeholder="seu@claro.com.br" required autoFocus />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Senha</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input pr-10" placeholder="••••••••" required />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200">
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
                {loading ? <Loader2 size={18} className="animate-spin" /> : null}
                {loading ? 'Autenticando...' : 'Entrar'}
              </button>
              <div className="mt-4 p-3 bg-gray-800 rounded-lg text-xs text-gray-400 space-y-1">
                <p className="font-medium text-gray-300">Credenciais de teste (senha: Claro@2024):</p>
                <p>Atendente: joao.atendente@claro.com.br</p>
                <p>Supervisor: supervisor@claro.com.br</p>
                <p>Admin: admin@claro.com.br</p>
              </div>
            </form>
          )}

          {/* PASSO 2a — Verificar OTP (2FA já configurado) */}
          {step === 'otp' && (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="text-center mb-4">
                <Shield size={40} className="mx-auto text-claro-red mb-2" />
                <h2 className="text-lg font-semibold">Verificação em 2 Fatores</h2>
                <p className="text-sm text-gray-400 mt-1">Digite o código do seu aplicativo autenticador</p>
              </div>
              <input type="text" value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="input text-center text-2xl tracking-[0.5em] font-mono"
                placeholder="000000" maxLength={6} required autoFocus />
              <button type="submit" disabled={loading || otpCode.length !== 6}
                className="btn-primary w-full flex items-center justify-center gap-2">
                {loading ? <Loader2 size={18} className="animate-spin" /> : null}
                Verificar
              </button>
              <button type="button" onClick={() => { setStep('credentials'); setOtpCode(''); }}
                className="btn-secondary w-full text-sm">Voltar</button>
            </form>
          )}

          {/* PASSO 2b — Aviso de setup obrigatório */}
          {step === 'setup-info' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-amber-900/30 border border-amber-700/40 rounded-xl">
                <AlertTriangle size={22} className="text-amber-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-amber-300 font-semibold text-sm">2FA obrigatório</p>
                  <p className="text-amber-200/70 text-xs mt-1">
                    Perfis de Atendente, Supervisor e Admin têm acesso a dados de todos os clientes.
                    O 2FA é exigido por política de segurança antes do primeiro acesso.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-gray-800 rounded-xl">
                <Smartphone size={18} className="text-blue-400 mt-0.5 flex-shrink-0" />
                <p className="text-gray-300 text-xs">
                  Você precisará do <strong>Google Authenticator</strong> ou <strong>Authy</strong> instalado
                  no celular para escanear o QR Code.
                </p>
              </div>
              <button onClick={handleStartSetup} disabled={loading}
                className="btn-primary w-full flex items-center justify-center gap-2">
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Shield size={18} />}
                Configurar 2FA agora
              </button>
              <button type="button" onClick={() => setStep('credentials')} className="btn-secondary w-full text-sm">
                Voltar
              </button>
            </div>
          )}

          {/* PASSO 2c — QR Code */}
          {step === 'setup-qr' && (
            <div className="space-y-4">
              <div className="text-center">
                <h2 className="text-lg font-semibold text-white">Escaneie o QR Code</h2>
                <p className="text-sm text-gray-400 mt-1">Abra o Google Authenticator → "+" → "Escanear QR"</p>
              </div>
              {qrData && (
                <div className="flex justify-center">
                  <div className="p-3 bg-white rounded-xl">
                    <QRCodeSVG value={qrData.qrCodeDataUrl} size={190} />
                  </div>
                </div>
              )}
              <div className="p-3 bg-gray-800 rounded-xl">
                <p className="text-xs text-gray-400 text-center mb-1">Chave manual (se não conseguir escanear):</p>
                <p className="text-xs font-mono text-center text-gray-200 break-all select-all">{qrData?.secret}</p>
              </div>
              <button onClick={() => setStep('setup-verify')} className="btn-primary w-full">
                Já escaneei → Continuar
              </button>
            </div>
          )}

          {/* PASSO 2d — Confirmar código */}
          {step === 'setup-verify' && (
            <form onSubmit={handleConfirmSetup} className="space-y-4">
              <div className="text-center">
                <CheckCircle size={36} className="mx-auto text-emerald-400 mb-2" />
                <h2 className="text-lg font-semibold text-white">Confirmar código</h2>
                <p className="text-sm text-gray-400 mt-1">Digite o código de 6 dígitos exibido no app</p>
              </div>
              <input type="text" inputMode="numeric" value={setupCode}
                onChange={(e) => setSetupCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="input text-center text-2xl tracking-[0.5em] font-mono"
                placeholder="000000" maxLength={6} autoFocus required />
              <button type="submit" disabled={loading || setupCode.length !== 6}
                className="btn-primary w-full flex items-center justify-center gap-2">
                {loading ? <Loader2 size={18} className="animate-spin" /> : null}
                Ativar 2FA e fazer login
              </button>
              <button type="button" onClick={() => setStep('setup-qr')} className="btn-secondary w-full text-sm">
                Voltar ao QR Code
              </button>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
