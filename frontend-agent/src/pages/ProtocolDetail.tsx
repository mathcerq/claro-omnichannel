import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, User, UserCheck, RefreshCw, CheckCircle, Clock, XCircle, AlertTriangle, Radio, Phone, Send, Globe } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { getSocket } from '../api/socket';
import { useLiveResync } from '../hooks/useLiveResync';
import { useAuthStore } from '../store/auth.store';
import { useProtocolsStore, Protocol, Message } from '../store/protocols.store';
import ChatPanel from '../components/ChatPanel';
import AssistantCard from '../components/AssistantCard';
import ChannelBadge from '../components/ChannelBadge';
import { StatusBadge, PriorityBadge } from '../components/StatusBadge';

export default function ProtocolDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { selectedProtocol, setSelectedProtocol, addMessage, updateMessage, updateProtocol } = useProtocolsStore();
  const [simulatingCall, setSimulatingCall] = useState(false);
  const [assistantTyping, setAssistantTyping] = useState(false);
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<any[]>([]);

  const fetchProtocol = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api.get(`/protocols/${id}`);
      setSelectedProtocol(res.data);
    } catch {
      navigate('/');
    } finally {
      setLoading(false);
    }
  }, [id, setSelectedProtocol, navigate]);

  // Recupera mensagens/status que chegaram enquanto a conexão estava caída
  useLiveResync(fetchProtocol);

  useEffect(() => {
    fetchProtocol();
    api.get('/users/agents').then((r) => setAgents(r.data)).catch(() => {});

    const socket = getSocket();
    // (Re)entra na sala do protocolo a cada conexão — inclusive após reconectar
    const join = () => id && socket.emit('join_protocol', { protocolId: id });
    join();

    const onNewMessage = (msg: Message) => {
      if (msg.protocolId === id) addMessage(id!, msg);
    };
    const onMessageUpdated = (patch: { id: string; protocolId: string; deliveryStatus: string }) => {
      if (patch.protocolId === id) updateMessage(id!, patch.id, { deliveryStatus: patch.deliveryStatus });
    };
    const onProtocolUpdated = (proto: Protocol) => {
      if (proto.id === id) updateProtocol(id!, proto);
    };
    const onAssistantTyping = (data: { protocolId: string; typing: boolean }) => {
      if (data.protocolId === id) setAssistantTyping(data.typing);
    };
    // Cliente vinculou/desvinculou o Telegram: atualiza os canais disponíveis
    const onClientChannels = (data: { userId: string }) => {
      if (data.userId === useProtocolsStore.getState().selectedProtocol?.client.id) fetchProtocol();
    };

    socket.on('connect', join);
    socket.on('new_message', onNewMessage);
    socket.on('message_updated', onMessageUpdated);
    socket.on('protocol_updated', onProtocolUpdated);
    socket.on('client_channels_updated', onClientChannels);
    socket.on('assistant_typing', onAssistantTyping);

    return () => {
      if (id) socket.emit('leave_protocol', { protocolId: id });
      socket.off('connect', join);
      socket.off('new_message', onNewMessage);
      socket.off('message_updated', onMessageUpdated);
      socket.off('protocol_updated', onProtocolUpdated);
      socket.off('client_channels_updated', onClientChannels);
      socket.off('assistant_typing', onAssistantTyping);
    };
  }, [id, fetchProtocol, addMessage, updateMessage, updateProtocol]);

  const handleSendMessage = async (content: string, channel: string) => {
    if (!id) return;
    try {
      const res = await api.post(`/protocols/${id}/messages`, { content, channel });
      addMessage(id, res.data);
    } catch {}
  };

  // ⚠️ Canal telefone é MOCK: gera uma "ligação recebida" com dados inventados
  const handleSimulateCall = async () => {
    if (!id) return;
    setSimulatingCall(true);
    try {
      const res = await api.post('/channels/phone/mock-call', { protocolId: id });
      addMessage(id, res.data);
      toast.success('Ligação simulada registrada na timeline');
    } catch {} finally {
      setSimulatingCall(false);
    }
  };

  const handleStatusChange = async (status: string) => {
    if (!id) return;
    try {
      const res = await api.patch(`/protocols/${id}`, { status });
      updateProtocol(id, res.data);
      toast.success(`Status alterado para: ${status}`);
    } catch {}
  };

  const handleAssignAgent = async (agentId: string) => {
    if (!id) return;
    try {
      const res = await api.patch(`/protocols/${id}/assign`, { agentId });
      // Atendente que transfere o protocolo deixa de ter acesso a ele (menor privilégio)
      if (user?.role === 'AGENT' && agentId !== user.id) {
        toast.success(`Protocolo transferido para ${res.data.agent?.name ?? 'outro atendente'}`);
        navigate('/');
        return;
      }
      updateProtocol(id, res.data);
      toast.success('Atendente atribuído com sucesso');
    } catch {}
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-400">
        <RefreshCw size={24} className="animate-spin mr-3" />
        Carregando protocolo...
      </div>
    );
  }

  if (!selectedProtocol) return null;
  const p = selectedProtocol;

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/')} className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-mono text-claro-red font-semibold">{p.protocolNumber}</span>
            <StatusBadge status={p.status} />
            <PriorityBadge priority={p.priority} />
            <ChannelBadge channel={p.currentChannel} />
          </div>
          <h1 className="text-white font-semibold truncate mt-0.5">{p.title}</h1>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Chat */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <ChatPanel
            messages={p.messages || []}
            onSend={handleSendMessage}
            availableChannels={p.availableChannels}
            disabled={p.status === 'CLOSED'}
            assistantTyping={assistantTyping}
          />
        </div>

        {/* Sidebar */}
        <aside className="w-72 bg-gray-900 border-l border-gray-800 overflow-y-auto">
          <div className="p-4 space-y-5">
            <AssistantCard protocol={p} onTakeOver={() => user && handleAssignAgent(user.id)} />

            {/* Client info */}
            <div>
              <h3 className="text-xs uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1.5">
                <User size={12} />
                Cliente
              </h3>
              <div className="card p-3 text-sm">
                <p className="font-semibold text-white">{p.client.name}</p>
                <p className="text-gray-400 text-xs mt-0.5">{p.client.email}</p>
                {p.client.phone && <p className="text-gray-400 text-xs">{p.client.phone}</p>}
              </div>
            </div>

            {/* Channels */}
            <div>
              <h3 className="text-xs uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1.5">
                <Radio size={12} />
                Canais do cliente
              </h3>
              <div className="card p-3 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-gray-300"><Globe size={12} /> WebChat</span>
                  <span className="text-emerald-400">disponível</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-gray-300"><Send size={12} /> Telegram</span>
                  {p.availableChannels?.includes('TELEGRAM') ? (
                    <span className="text-emerald-400">vinculado</span>
                  ) : (
                    <span className="text-gray-500">não vinculado</span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-gray-300"><Phone size={12} /> Telefone</span>
                  <span className="text-amber-400" title="Sem integração com telefonia: dados inventados">simulado (mock)</span>
                </div>
                {p.status !== 'CLOSED' && (
                  <button
                    onClick={handleSimulateCall}
                    disabled={simulatingCall}
                    className="w-full mt-1 flex items-center justify-center gap-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <Phone size={12} /> Simular ligação recebida
                  </button>
                )}
              </div>
            </div>

            {/* Agent assignment */}
            <div>
              <h3 className="text-xs uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1.5">
                <UserCheck size={12} />
                Atendente
              </h3>
              <div className="card p-3 text-sm space-y-2">
                {p.agent ? (
                  <p className="text-white font-medium">{p.agent.name}</p>
                ) : (
                  <p className="text-amber-400 text-xs">Sem atendente</p>
                )}
                {p.status !== 'CLOSED' && (
                  <select
                    onChange={(e) => e.target.value && handleAssignAgent(e.target.value)}
                    defaultValue=""
                    className="input text-xs"
                  >
                    <option value="">Transferir para...</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>{a.name} ({a.role})</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Status actions */}
            {p.status !== 'CLOSED' && (
              <div>
                <h3 className="text-xs uppercase tracking-wider text-gray-400 mb-2">Alterar Status</h3>
                <div className="space-y-2">
                  {p.status !== 'IN_PROGRESS' && (
                    <button onClick={() => handleStatusChange('IN_PROGRESS')} className="w-full flex items-center gap-2 bg-blue-900/50 hover:bg-blue-800/50 text-blue-300 text-sm px-3 py-2 rounded-lg transition-colors">
                      <Clock size={14} /> Em Atendimento
                    </button>
                  )}
                  {p.status !== 'WAITING' && (
                    <button onClick={() => handleStatusChange('WAITING')} className="w-full flex items-center gap-2 bg-amber-900/50 hover:bg-amber-800/50 text-amber-300 text-sm px-3 py-2 rounded-lg transition-colors">
                      <AlertTriangle size={14} /> Aguardando Cliente
                    </button>
                  )}
                  <button onClick={() => handleStatusChange('CLOSED')} className="w-full flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm px-3 py-2 rounded-lg transition-colors">
                    <CheckCircle size={14} /> Encerrar
                  </button>
                </div>
              </div>
            )}

            {p.status === 'CLOSED' && (
              <div className="card p-3 text-center">
                <XCircle size={24} className="mx-auto text-gray-500 mb-1" />
                <p className="text-xs text-gray-400">Protocolo encerrado</p>
                {p.closedAt && (
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(p.closedAt).toLocaleString('pt-BR')}
                  </p>
                )}
              </div>
            )}

            {/* Protocol info */}
            <div>
              <h3 className="text-xs uppercase tracking-wider text-gray-400 mb-2">Detalhes</h3>
              <div className="card p-3 text-xs text-gray-400 space-y-1.5">
                <div className="flex justify-between">
                  <span>Criado</span>
                  <span className="text-gray-300">{new Date(p.createdAt).toLocaleDateString('pt-BR')}</span>
                </div>
                <div className="flex justify-between">
                  <span>Atualizado</span>
                  <span className="text-gray-300">{new Date(p.updatedAt).toLocaleString('pt-BR')}</span>
                </div>
                {p.description && (
                  <div className="pt-1 border-t border-gray-800">
                    <p className="text-gray-300">{p.description}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
