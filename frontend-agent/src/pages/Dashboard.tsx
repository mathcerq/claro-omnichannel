import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, LogOut, Users, RefreshCw, Search, Wifi,
  AlertTriangle, Clock, CheckCircle, Inbox, TrendingUp, Shield, Bot
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { getSocket } from '../api/socket';
import { useAuthStore } from '../store/auth.store';
import { useProtocolsStore, Protocol } from '../store/protocols.store';
import ChannelBadge, { channelConfig } from '../components/ChannelBadge';
import { StatusBadge, PriorityBadge } from '../components/StatusBadge';

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { protocols, stats, setProtocols, setStats } = useProtocolsStore();
  const [channels, setChannels] = useState<{ code: string; kind: string; enabled: boolean; botUsername?: string }[]>([]);
  const refreshTimer = useRef<ReturnType<typeof setTimeout>>();
  const [assistant, setAssistant] = useState<{ enabled: boolean; engine: string | null; engineKind: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [protRes, statRes] = await Promise.all([
        api.get('/protocols'),
        api.get('/protocols/stats'),
      ]);
      setProtocols(protRes.data);
      setStats(statRes.data);
    } catch {
      /* handled by interceptor */
    } finally {
      setLoading(false);
    }
  }, [setProtocols, setStats]);

  useEffect(() => {
    fetchData();
    api.get('/channels').then((r) => setChannels(r.data)).catch(() => {});
    api.get('/assistant/status').then((r) => setAssistant(r.data)).catch(() => {});

    // Qualquer mensagem/protocolo novo, em qualquer canal, atualiza a lista
    // (com debounce para rajadas de eventos)
    const socket = getSocket();
    const onListUpdated = () => {
      clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(fetchData, 300);
    };
    socket.on('protocols_list_updated', onListUpdated);
    return () => {
      clearTimeout(refreshTimer.current);
      socket.off('protocols_list_updated', onListUpdated);
    };
  }, [fetchData]);

  const handleLogout = () => {
    logout();
    navigate('/login');
    toast.success('Até logo!');
  };

  const handleAssignSelf = async (e: React.MouseEvent, protocol: Protocol) => {
    e.stopPropagation();
    try {
      await api.patch(`/protocols/${protocol.id}/assign`, { agentId: user?.id });
      toast.success('Protocolo assumido!');
      fetchData();
    } catch {}
  };

  const filtered = protocols.filter((p) => {
    const matchSearch =
      !search ||
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.protocolNumber.toLowerCase().includes(search.toLowerCase()) ||
      p.client.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const statsCards = [
    { label: 'Total', value: stats?.total ?? 0, Icon: TrendingUp, color: 'text-gray-300' },
    { label: 'Abertos', value: stats?.open ?? 0, Icon: Inbox, color: 'text-emerald-400' },
    { label: 'Em Andamento', value: stats?.inProgress ?? 0, Icon: Clock, color: 'text-blue-400' },
    { label: 'Aguardando', value: stats?.waiting ?? 0, Icon: AlertTriangle, color: 'text-amber-400' },
    { label: 'Encerrados', value: stats?.closed ?? 0, Icon: CheckCircle, color: 'text-gray-500' },
  ];

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-claro-red rounded-lg flex items-center justify-center">
            <Shield size={18} className="text-white" />
          </div>
          <div>
            <span className="font-bold text-white">Claro Omnichannel</span>
            <span className="text-gray-500 text-xs ml-2">Painel do Atendente</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Wifi size={14} className="text-emerald-400" />
            <span className="hidden sm:block">{user?.name}</span>
            <span className="badge bg-gray-800 text-gray-300">{user?.role}</span>
          </div>
          <button onClick={fetchData} className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors">
            <RefreshCw size={16} />
          </button>
          <button onClick={handleLogout} className="flex items-center gap-2 text-gray-400 hover:text-white text-sm px-3 py-1.5 hover:bg-gray-800 rounded-lg transition-colors">
            <LogOut size={16} />
            <span className="hidden sm:block">Sair</span>
          </button>
        </div>
      </header>

      {/* Canais */}
      {channels.length > 0 && (
        <div className="px-6 pt-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-gray-500 uppercase tracking-wider mr-1">Canais</span>
          {channels.map((c) => {
            const cfg = channelConfig[c.code];
            return (
              <span
                key={c.code}
                className="flex items-center gap-1.5 bg-gray-900 border border-gray-800 rounded-full px-3 py-1 text-gray-300"
                title={c.kind === 'MOCK' ? 'Canal simulado: sem integração real, dados inventados' : 'Integração real'}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${!c.enabled ? 'bg-gray-600' : c.kind === 'MOCK' ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                {cfg?.label ?? c.code}
                <span className={c.kind === 'MOCK' ? 'text-amber-400' : 'text-emerald-400'}>
                  {c.kind === 'MOCK' ? 'mock' : c.enabled ? 'real' : 'desligado'}
                </span>
                {c.botUsername && <span className="text-gray-500">@{c.botUsername}</span>}
                <span className="text-gray-500" title="Protocolos cujo último contato foi por este canal">
                  · {stats?.byChannel?.find((b: any) => b.currentChannel === c.code)?._count ?? 0}
                </span>
              </span>
            );
          })}
        </div>
      )}

      {/* Assistente virtual */}
      {assistant?.enabled && (
        <div className="px-6 pt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-gray-500 uppercase tracking-wider mr-1">Assistente IA</span>
          <span
            className="flex items-center gap-1.5 bg-indigo-950/60 border border-indigo-900 rounded-full px-3 py-1 text-indigo-200"
            title={assistant.engineKind === 'LLM' ? 'IA generativa rodando localmente (Ollama), sem custo e sem enviar dados para fora' : 'Ollama indisponível: usando o motor de regras'}
          >
            <Bot size={12} />
            {assistant.engineKind === 'LLM' ? `IA local · ${assistant.engine?.replace('ollama:', '')}` : 'Motor de regras (reserva)'}
          </span>
          {stats?.ai && (
            <>
              <span className="bg-gray-900 border border-gray-800 rounded-full px-3 py-1 text-gray-300">{stats.ai.active} atendendo agora</span>
              <span className="bg-gray-900 border border-gray-800 rounded-full px-3 py-1 text-emerald-300">{stats.ai.resolved} resolvidos pela IA</span>
              <span className="bg-gray-900 border border-gray-800 rounded-full px-3 py-1 text-amber-300">{stats.ai.handedOff} transferidos para humanos</span>
              {stats.ai.resolutionRate !== null && (
                <span className="bg-gray-900 border border-gray-800 rounded-full px-3 py-1 text-gray-300">
                  taxa de resolução da IA: <strong className="text-white">{stats.ai.resolutionRate}%</strong>
                </span>
              )}
            </>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
        {statsCards.map(({ label, value, Icon, color }) => (
          <div key={label} className="card p-4 flex items-center gap-3">
            <Icon size={22} className={color} />
            <div>
              <p className="text-2xl font-bold text-white">{value}</p>
              <p className="text-xs text-gray-400">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="px-6 pb-3 flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9 text-sm"
            placeholder="Buscar por título, protocolo ou cliente..."
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input w-auto text-sm"
        >
          <option value="">Todos os status</option>
          <option value="OPEN">Aberto</option>
          <option value="IN_PROGRESS">Em Andamento</option>
          <option value="WAITING">Aguardando</option>
          <option value="CLOSED">Encerrado</option>
        </select>
      </div>

      {/* Table */}
      <div className="px-6 pb-6 flex-1">
        <div className="card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-gray-500">
              <RefreshCw size={24} className="animate-spin mr-3" />
              Carregando protocolos...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-500">
              <LayoutDashboard size={40} className="mb-3 opacity-40" />
              <p>Nenhum protocolo encontrado</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800 text-xs text-gray-400 uppercase tracking-wider">
                    <th className="px-4 py-3 text-left">Protocolo</th>
                    <th className="px-4 py-3 text-left">Título</th>
                    <th className="px-4 py-3 text-left">Cliente</th>
                    <th className="px-4 py-3 text-left">Canal</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Prioridade</th>
                    <th className="px-4 py-3 text-left">Atendente</th>
                    <th className="px-4 py-3 text-left">Atualizado</th>
                    <th className="px-4 py-3 text-left">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {filtered.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => navigate(`/protocols/${p.id}`)}
                      className="hover:bg-gray-800/50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 text-xs font-mono text-claro-red font-semibold">{p.protocolNumber}</td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-white truncate max-w-[180px]">{p.title}</p>
                        {p._count && <p className="text-xs text-gray-500">{p._count.messages} msgs</p>}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-200">{p.client.name}</p>
                        <p className="text-xs text-gray-500">{p.client.email}</p>
                      </td>
                      <td className="px-4 py-3"><ChannelBadge channel={p.currentChannel} /></td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-start gap-1">
                          <StatusBadge status={p.status} />
                          {p.aiStatus === 'ACTIVE' && p.status !== 'CLOSED' && <span className="badge bg-indigo-950 text-indigo-300"><Bot size={10} /> IA atendendo</span>}
                          {p.aiStatus === 'HANDED_OFF' && <span className="badge bg-amber-950 text-amber-300" title={p.aiHandoffReason ?? ''}><Bot size={10} /> Transferido pela IA</span>}
                          {p.aiStatus === 'RESOLVED' && <span className="badge bg-emerald-950 text-emerald-300"><Bot size={10} /> Resolvido pela IA</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3"><PriorityBadge priority={p.priority} /></td>
                      <td className="px-4 py-3 text-sm text-gray-400">
                        {p.agent ? p.agent.name : <span className="text-amber-400 text-xs">Sem atendente</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {new Date(p.updatedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-3">
                        {!p.agent && p.status !== 'CLOSED' && (
                          <button
                            onClick={(e) => handleAssignSelf(e, p)}
                            className="text-xs bg-claro-red hover:bg-claro-red-dark text-white px-2 py-1 rounded-lg transition-colors"
                          >
                            Assumir
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
