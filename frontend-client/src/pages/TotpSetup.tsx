import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Loader2, CheckCircle, Smartphone, Download } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { useAuthStore } from '../store/auth.store';

export default function TotpSetup() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [step, setStep] = useState<'info' | 'qr' | 'verify' | 'done'>('info');
  const [qrData, setQrData] = useState<{ secret: string; otpAuthUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleStartSetup = async () => {
    setLoading(true);
    try {
      const res = await api.get('/auth/totp/setup');
      setQrData(res.data);
      setStep('qr');
    } catch {} finally {
      setLoading(false);
    }
  };

  const handleEnable = async () => {
    setLoading(true);
    try {
      await api.post('/auth/totp/enable', { code });
      setStep('done');
      toast.success('2FA ativado com sucesso!');
    } catch {
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await api.get('/users/me/data');
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `meus-dados-claro-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('Arquivo gerado');
    } catch {} finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto">
      <div className="bg-claro-red px-5 pt-12 pb-6">
        <button onClick={() => navigate('/')} className="text-white/80 hover:text-white mb-4 flex items-center gap-2">
          <ArrowLeft size={20} />
          <span className="text-sm">Voltar</span>
        </button>
        <h1 className="text-2xl font-bold text-white">Segurança da Conta</h1>
        <p className="text-red-200 text-sm mt-1">Autenticação em 2 fatores (2FA)</p>
      </div>

      <div className="flex-1 -mt-4 bg-white rounded-t-3xl px-5 pt-6 pb-6">
        {user?.totpEnabled ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} className="text-emerald-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">2FA Ativado</h2>
            <p className="text-gray-500 text-sm mt-2">Sua conta está protegida com autenticação em 2 fatores.</p>
          </div>
        ) : step === 'info' ? (
          <div className="space-y-6">
            <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-2xl">
              <Shield size={24} className="text-claro-red mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-gray-900">O que é o 2FA?</h3>
                <p className="text-sm text-gray-500 mt-1">
                  A autenticação em 2 fatores adiciona uma camada extra de segurança. Além da senha, você precisará de um código gerado pelo seu celular.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-2xl">
              <Smartphone size={24} className="text-blue-500 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-gray-900">Como configurar</h3>
                <p className="text-sm text-gray-500 mt-1">
                  1. Baixe um app autenticador (Google Authenticator, Authy)<br />
                  2. Escaneie o QR Code que vamos gerar<br />
                  3. Digite o código de 6 dígitos para confirmar
                </p>
              </div>
            </div>
            <button onClick={handleStartSetup} disabled={loading} className="btn-primary flex items-center justify-center gap-2">
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Shield size={18} />}
              Ativar 2FA
            </button>
          </div>
        ) : step === 'qr' ? (
          <div className="space-y-5">
            <div className="text-center">
              <h2 className="text-lg font-bold text-gray-900">Escaneie o QR Code</h2>
              <p className="text-sm text-gray-500 mt-1">Use Google Authenticator ou Authy</p>
            </div>
            {qrData && (
              <div className="flex justify-center">
                <div className="p-4 bg-white border-2 border-gray-100 rounded-2xl">
                  <QRCodeSVG value={qrData.otpAuthUrl} size={200} />
                </div>
              </div>
            )}
            <div className="p-3 bg-gray-50 rounded-xl">
              <p className="text-xs text-gray-500 text-center mb-1">Ou insira a chave manualmente:</p>
              <p className="text-xs font-mono text-center text-gray-700 break-all">{qrData?.secret}</p>
            </div>
            <button onClick={() => setStep('verify')} className="btn-primary">
              Já escaneei, continuar
            </button>
          </div>
        ) : step === 'verify' ? (
          <div className="space-y-5">
            <div className="text-center">
              <h2 className="text-lg font-bold text-gray-900">Verificar código</h2>
              <p className="text-sm text-gray-500 mt-1">Digite o código de 6 dígitos do app</p>
            </div>
            <input
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="input text-center text-3xl tracking-[0.6em] font-mono"
              placeholder="000000"
              maxLength={6}
              autoFocus
            />
            <button onClick={handleEnable} disabled={loading || code.length !== 6} className="btn-primary flex items-center justify-center gap-2">
              {loading ? <Loader2 size={18} className="animate-spin" /> : null}
              Confirmar e ativar 2FA
            </button>
            <button onClick={() => setStep('qr')} className="btn-secondary">
              Voltar ao QR Code
            </button>
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} className="text-emerald-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">2FA Ativado!</h2>
            <p className="text-gray-500 text-sm mt-2">Sua conta agora está protegida.</p>
            <button onClick={() => navigate('/')} className="btn-primary mt-6">
              Ir para o início
            </button>
          </div>
        )}

        <div className="mt-8 pt-5 border-t border-gray-100">
          <h3 className="font-semibold text-gray-900 text-sm">Seus dados (LGPD)</h3>
          <p className="text-xs text-gray-500 mt-1">
            Baixe uma cópia de tudo o que guardamos sobre você: cadastro, protocolos, mensagens de todos os canais e
            registros de acesso.
          </p>
          <button onClick={handleExport} disabled={exporting} className="btn-secondary mt-3 flex items-center justify-center gap-2">
            {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            Baixar meus dados
          </button>
        </div>
      </div>
    </div>
  );
}
