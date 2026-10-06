import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, LogOut, Shield, RefreshCw, MessageSquare, ChevronRight, Wifi, Send, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { useAuthStore } from '../store/auth.store';
import { getSocket } from '../api/socket';

interface Protocol {
  id: string;
  protocolNumber: string;
  title: string;
  status: string;
  priority: string;
  currentChannel: string;
  createdAt: string;
  updatedAt: string;
  agent: { id: string; name: string } | null;
  _count: { messages: number };
}

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  OPEN: { label: 'Aberto', color: 'text-emerald-700', bg: 'bg-emerald-50' },
  IN_PROGRESS: { label: 'Em Andamento', color: 'text-blue-700', bg: 'bg-blue-50' },
  WAITING: { label: 'Aguardando', color: 'text-amber-700', bg: 'bg-amber-50' },
  CLOSED: { label: 'Encerrado', color: 'text-gray-500', bg: 'bg-gray-100' },
};

const channelConfig: Record<string, { label: string; color: string }> = {
  TELEGRAM: { label: 'Telegram', color: 'text-sky-600' },
  PHONE: { label: 'Telefone', color: 'text-blue-600' },
  WEBCHAT: { label: 'WebChat', color: 'text-purple-600' },
  WHATSAPP: { label: 'WhatsApp', color: 'text-green-600' },
  EMAIL: { label: 'E-mail', color: 'text-orange-600' },
};

export default function Home() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [loading, setLoading] = useState(true);
  const [telegram, setTelegram] = useState<{ enabled: boolean; linked: boolean } | null>(null);

  const fetchProtocols = useCallback(async () => {
    try {
      const res = await api.get('/protocols');
      setProtocols(res.data);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  const fetchTelegram = useCallback(() => {
    api.get('/channels/telegram').then((r) => setTelegram(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    fetchProtocols();
    fetchTelegram();
    // Protocolos abertos/atualizados em qualquer canal (ex.: pelo Telegram)
    const socket = getSocket();
    const onListUpdated = () => fetchProtocols();
    socket.on('protocols_list_updated', onListUpdated);
    socket.on('channel_link_updated', fetchTelegram);
    return () => {
      socket.off('protocols_list_updated', onListUpdated);
      socket.off('channel_link_updated', fetchTelegram);
    };
  }, [fetchProtocols, fetchTelegram]);

  const handleLogout = () => {
    logout();
    toast.success('Até logo!');
    navigate('/login');
  };

  const activeCount = protocols.filter(p => p.status !== 'CLOSED').length;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto">
      {/* Header */}
      <div className="bg-claro-red px-5 pt-12 pb-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <Shield size={18} className="text-white" />
            </div>
            <span className="text-white font-bold text-lg">Claro</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/security')} className="p-2 text-white/70 hover:text-white">
              <Shield size={18} />
            </button>
            <button onClick={handleLogout} className="p-2 text-white/70 hover:text-white">
              <LogOut size={18} />
            </button>
          </div>
        </div>
        <div>
          <p className="text-red-200 text-sm">Olá,</p>
          <h2 className="text-white text-xl font-bold">{user?.name?.split(' ')[0]}</h2>
        </div>
        <div className="mt-4 bg-white/15 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/80 text-sm">Protocolos ativos</p>
              <p className="text-white text-3xl font-bold">{activeCount}</p>
            </div>
            <MessageSquare size={36} className="text-white/40" />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 -mt-4 pb-6">
        <button
          onClick={() => navigate('/new')}
          className="w-full bg-claro-red hover:bg-claro-red-dark active:scale-95 text-white font-semibold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-200 mb-5"
        >
          <Plus size={20} />
          Abrir Novo Chamado
        </button>

        {telegram?.enabled && (
          <button
            onClick={() => navigate('/telegram')}
            className="card w-full p-4 mb-5 flex items-center gap-3 text-left hover:shadow-md transition-all"
          >
            <div className="w-10 h-10 bg-sky-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <Send size={20} className="text-sky-600" />
            </div>
            <div className="flex-1 min-w-0">
              {telegram.linked ? (
                <>
                  <p className="font-semibold text-gray-900 flex items-center gap-1">
                    Telegram conectado <CheckCircle size={14} className="text-emerald-500" />
                  </p>
                  <p className="text-xs text-gray-500">Converse por lá com o mesmo histórico</p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-gray-900">Conectar Telegram</p>
                  <p className="text-xs text-gray-500">Receba as respostas do atendente no Telegram</p>
                </>
              )}
            </div>
            <ChevronRight size={18} className="text-gray-300" />
          </button>
        )}

        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">Meus Protocolos</h3>
          <button onClick={fetchProtocols} className="p-1.5 text-gray-400 hover:text-gray-600">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <RefreshCw size={24} className="animate-spin mr-2" />
            Carregando...
          </div>
        ) : protocols.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <MessageSquare size={48} className="mx-auto mb-3 opacity-40" />
            <p className="font-medium">Nenhum protocolo ainda</p>
            <p className="text-sm mt-1">Abra seu primeiro chamado acima</p>
          </div>
        ) : (
          <div className="space-y-3">
            {protocols.map((p) => {
              const s = statusConfig[p.status] || statusConfig.OPEN;
              const ch = channelConfig[p.currentChannel] || channelConfig.WEBCHAT;
              return (
                <button
                  key={p.id}
                  onClick={() => navigate(`/protocols/${p.id}`)}
                  className="card w-full p-4 text-left hover:shadow-md active:scale-[0.98] transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs font-mono text-claro-red font-semibold">{p.protocolNumber}</span>
                        <span className={`badge ${s.bg} ${s.color}`}>{s.label}</span>
                      </div>
                      <p className="font-semibold text-gray-900 truncate">{p.title}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                        <span className={ch.color}>{ch.label}</span>
                        <span>•</span>
                        <span>{p._count.messages} mensagens</span>
                        {p.agent && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Wifi size={10} className="text-emerald-500" />
                              {p.agent.name}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-gray-300 mt-1 flex-shrink-0" />
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    {new Date(p.updatedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
