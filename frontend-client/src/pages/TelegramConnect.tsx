import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, CheckCircle, Loader2, RefreshCw, ShieldCheck, Unlink, ExternalLink } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { getSocket } from '../api/socket';

interface TelegramStatus {
  enabled: boolean;
  botUsername: string | null;
  linked: boolean;
  linkedAt: string | null;
}

interface LinkCode {
  code: string;
  expiresAt: string;
  deepLink: string;
  botUsername: string;
}

function useCountdown(target?: string) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!target) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [target]);
  if (!target) return 0;
  return Math.max(0, Math.floor((new Date(target).getTime() - now) / 1000));
}

/**
 * Vínculo do Telegram: o cliente (já autenticado aqui) gera um código de uso
 * único e o envia ao bot pelo deep link. Assim só quem controla a conta e o
 * Telegram consegue vincular os dois.
 */
export default function TelegramConnect() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [linkCode, setLinkCode] = useState<LinkCode | null>(null);
  const [loading, setLoading] = useState(false);
  const secondsLeft = useCountdown(linkCode?.expiresAt);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get<TelegramStatus>('/channels/telegram');
      setStatus(res.data);
      if (res.data.linked) setLinkCode(null);
      return res.data;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    // O backend avisa em tempo real quando o bot confirma o vínculo
    const socket = getSocket();
    const onLinkUpdated = async () => {
      const current = await fetchStatus();
      if (current?.linked) toast.success('Telegram conectado!');
    };
    socket.on('channel_link_updated', onLinkUpdated);
    return () => {
      socket.off('channel_link_updated', onLinkUpdated);
    };
  }, [fetchStatus]);

  const generateCode = async () => {
    setLoading(true);
    try {
      const res = await api.post<LinkCode>('/channels/telegram/link-code');
      setLinkCode(res.data);
    } catch {} finally {
      setLoading(false);
    }
  };

  const unlink = async () => {
    if (!confirm('Desvincular o Telegram? Você continuará podendo usar o WebChat normalmente.')) return;
    setLoading(true);
    try {
      await api.delete('/channels/telegram/link');
      toast.success('Telegram desvinculado');
      await fetchStatus();
    } catch {} finally {
      setLoading(false);
    }
  };

  const expired = linkCode && secondsLeft === 0;
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto">
      <div className="bg-sky-600 px-5 pt-12 pb-6">
        <button onClick={() => navigate('/')} className="text-white/80 hover:text-white mb-4 flex items-center gap-2">
          <ArrowLeft size={20} />
          <span className="text-sm">Voltar</span>
        </button>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
            <Send size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Telegram</h1>
            <p className="text-sky-100 text-sm">Atendimento pelo app que você já usa</p>
          </div>
        </div>
      </div>

      <div className="flex-1 -mt-4 bg-white rounded-t-3xl px-5 pt-6 pb-6 space-y-5">
        {!status ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader2 size={24} className="animate-spin" />
          </div>
        ) : status.linked ? (
          <>
            <div className="text-center">
              <CheckCircle size={48} className="mx-auto text-emerald-500 mb-3" />
              <h2 className="text-lg font-bold text-gray-900">Telegram conectado</h2>
              {status.linkedAt && (
                <p className="text-sm text-gray-500 mt-1">
                  Desde {new Date(status.linkedAt).toLocaleString('pt-BR')}
                </p>
              )}
            </div>
            <div className="bg-sky-50 rounded-2xl p-4 text-sm text-sky-900 space-y-1">
              <p>• Escreva para o bot e sua mensagem entra no seu protocolo em aberto.</p>
              <p>• O atendente responde por lá e o histórico aparece aqui também.</p>
              <p>• Comandos úteis: /protocolos, /historico, /novo assunto.</p>
            </div>
            {status.botUsername && (
              <a
                href={`https://t.me/${status.botUsername}`}
                target="_blank"
                rel="noreferrer"
                className="w-full bg-sky-600 hover:bg-sky-700 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2"
              >
                <ExternalLink size={18} /> Abrir conversa @{status.botUsername}
              </a>
            )}
            <button onClick={unlink} disabled={loading} className="btn-secondary flex items-center justify-center gap-2">
              <Unlink size={16} /> Desvincular Telegram
            </button>
          </>
        ) : !status.enabled ? (
          <div className="text-center py-8 text-gray-500">
            <Send size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">Canal Telegram indisponível no momento</p>
            <p className="text-sm mt-1">Continue pelo WebChat — nada se perde.</p>
          </div>
        ) : linkCode && !expired ? (
          <>
            <div className="text-center">
              <p className="text-sm text-gray-500">Seu código de vínculo</p>
              <p className="text-4xl font-mono font-bold tracking-[0.2em] text-gray-900 mt-1">{linkCode.code}</p>
              <p className="text-xs text-gray-400 mt-1">
                Expira em {mm}:{ss} · uso único
              </p>
            </div>
            <a
              href={linkCode.deepLink}
              target="_blank"
              rel="noreferrer"
              className="w-full bg-sky-600 hover:bg-sky-700 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2"
            >
              <Send size={18} /> Abrir no Telegram
            </a>
            <div className="flex flex-col items-center gap-2">
              <div className="p-3 bg-white border border-gray-100 rounded-2xl shadow-sm">
                <QRCodeSVG value={linkCode.deepLink} size={160} />
              </div>
              <p className="text-xs text-gray-400 text-center">
                No computador? Aponte a câmera do celular para o QR Code.
                <br />
                Ou envie para @{linkCode.botUsername}: <span className="font-mono">/vincular {linkCode.code}</span>
              </p>
            </div>
            <p className="text-xs text-gray-400 text-center flex items-center justify-center gap-1">
              <Loader2 size={12} className="animate-spin" /> Aguardando confirmação do bot…
            </p>
          </>
        ) : (
          <>
            <div className="space-y-3 text-sm text-gray-600">
              <p className="font-semibold text-gray-900">Como funciona</p>
              <p>1. Gere um código de vínculo (válido por 10 minutos).</p>
              <p>2. Toque em “Abrir no Telegram” e depois em “Iniciar”.</p>
              <p>3. Pronto: seus protocolos ficam disponíveis também no Telegram, com o mesmo histórico.</p>
            </div>
            {expired && <p className="text-sm text-amber-600 text-center">O código expirou. Gere um novo.</p>}
            <button onClick={generateCode} disabled={loading} className="btn-primary flex items-center justify-center gap-2">
              {loading ? <Loader2 size={18} className="animate-spin" /> : expired ? <RefreshCw size={18} /> : <Send size={18} />}
              {expired ? 'Gerar novo código' : 'Gerar código de vínculo'}
            </button>
          </>
        )}

        <div className="flex items-start gap-2 text-xs text-gray-400 border-t border-gray-100 pt-4">
          <ShieldCheck size={14} className="flex-shrink-0 mt-0.5" />
          <p>
            Privacidade (LGPD): guardamos apenas o identificador da conversa no Telegram — nada de nome, foto ou
            telefone. Você pode desvincular a qualquer momento, aqui ou enviando /desvincular ao bot.
          </p>
        </div>
      </div>
    </div>
  );
}
