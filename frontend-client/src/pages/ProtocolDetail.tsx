import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Send, RefreshCw, MessageSquare, Phone, Globe, Mail, Wifi, Bot } from 'lucide-react';
import api from '../api/axios';
import { getSocket } from '../api/socket';
import { useLiveResync } from '../hooks/useLiveResync';
import { useAuthStore } from '../store/auth.store';

interface Message {
  id: string;
  content: string;
  channel: string;
  senderRole: string;
  isRead: boolean;
  createdAt: string;
  sender: { id: string; name: string; role: string };
  protocolId?: string;
}

interface Protocol {
  id: string;
  protocolNumber: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  currentChannel: string;
  createdAt: string;
  agent: { id: string; name: string } | null;
  aiStatus?: string;
  messages: Message[];
}

const channelIcons: Record<string, any> = { TELEGRAM: Send, PHONE: Phone, WEBCHAT: Globe, WHATSAPP: MessageSquare, EMAIL: Mail };
const channelLabels: Record<string, string> = { TELEGRAM: 'Telegram', PHONE: 'Telefone', WEBCHAT: 'WebChat', WHATSAPP: 'WhatsApp', EMAIL: 'E-mail' };

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  OPEN: { label: 'Aberto', color: 'text-emerald-700', bg: 'bg-emerald-50' },
  IN_PROGRESS: { label: 'Em Andamento', color: 'text-blue-700', bg: 'bg-blue-50' },
  WAITING: { label: 'Aguardando', color: 'text-amber-700', bg: 'bg-amber-50' },
  CLOSED: { label: 'Encerrado', color: 'text-gray-500', bg: 'bg-gray-100' },
};

export default function ProtocolDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [protocol, setProtocol] = useState<Protocol | null>(null);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [assistantTyping, setAssistantTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchProtocol = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api.get(`/protocols/${id}`);
      setProtocol(res.data);
    } catch {
      navigate('/');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  // Recupera mensagens/status que chegaram enquanto a conexão estava caída
  useLiveResync(fetchProtocol);

  useEffect(() => {
    fetchProtocol();
    const socket = getSocket();
    // (Re)entra na sala do protocolo a cada conexão — inclusive após reconectar
    const join = () => id && socket.emit('join_protocol', { protocolId: id });
    join();

    // Mensagens de qualquer canal (Telegram, telefone, atendente) chegam aqui
    const onNewMessage = (msg: Message) => {
      if (msg.protocolId !== id) return;
      setProtocol((prev) => {
        if (!prev) return prev;
        if (prev.messages.some((m) => m.id === msg.id)) return prev;
        return { ...prev, messages: [...prev.messages, msg] };
      });
    };
    const onAssistantTyping = (data: { protocolId: string; typing: boolean }) => {
      if (data.protocolId === id) setAssistantTyping(data.typing);
    };
    const onProtocolUpdated = (proto: any) => {
      if (proto.id === id) setProtocol((prev) => (prev ? { ...prev, ...proto } : prev));
    };

    socket.on('connect', join);
    socket.on('new_message', onNewMessage);
    socket.on('protocol_updated', onProtocolUpdated);
    socket.on('assistant_typing', onAssistantTyping);

    return () => {
      if (id) socket.emit('leave_protocol', { protocolId: id });
      socket.off('connect', join);
      socket.off('new_message', onNewMessage);
      socket.off('protocol_updated', onProtocolUpdated);
      socket.off('assistant_typing', onAssistantTyping);
    };
  }, [id, fetchProtocol]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [protocol?.messages, assistantTyping]);

  const handleSend = async () => {
    if (!input.trim() || sending || !id || !protocol) return;
    setSending(true);
    try {
      // Pelo app, o canal é sempre WebChat (definido pelo servidor)
      const res = await api.post(`/protocols/${id}/messages`, { content: input.trim() });
      setProtocol((prev) =>
        prev && !prev.messages.some((m) => m.id === res.data.id)
          ? { ...prev, messages: [...prev.messages, res.data] }
          : prev,
      );
      setInput('');
    } catch {} finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        <RefreshCw size={24} className="animate-spin mr-2" /> Carregando...
      </div>
    );
  }

  if (!protocol) return null;

  const s = statusConfig[protocol.status] || statusConfig.OPEN;
  const ChannelIcon = channelIcons[protocol.currentChannel] || Globe;
  let lastDate = '';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-3 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 -ml-2 text-gray-500 hover:text-gray-700">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono text-claro-red font-bold">{protocol.protocolNumber}</span>
              <span className={`badge ${s.bg} ${s.color}`}>{s.label}</span>
              <span className="badge bg-gray-100 text-gray-500 flex items-center gap-1">
                <ChannelIcon size={10} />
                {channelLabels[protocol.currentChannel]}
              </span>
            </div>
            <p className="text-sm font-semibold text-gray-900 truncate mt-0.5">{protocol.title}</p>
          </div>
        </div>
        <Link to="/telegram" className="flex items-center gap-1 mt-2 text-xs text-sky-600 ml-9">
          <Send size={10} />
          Continue esta conversa pelo Telegram — o histórico é o mesmo
        </Link>
        {protocol.status !== 'CLOSED' && protocol.aiStatus === 'ACTIVE' && (
          <div className="flex items-center gap-1 mt-2 text-xs text-indigo-600 ml-9">
            <Bot size={10} />
            <span>Atendimento pela Clara, assistente virtual (IA). Peça um atendente quando quiser.</span>
          </div>
        )}
        {protocol.status !== 'CLOSED' && protocol.aiStatus === 'HANDED_OFF' && (
          <div className="flex items-center gap-1 mt-2 text-xs text-amber-600 ml-9">
            <Wifi size={10} />
            <span>Transferido para um atendente — ele já recebeu o histórico desta conversa.</span>
          </div>
        )}
        {protocol.agent && (
          <div className="flex items-center gap-1 mt-2 text-xs text-gray-500 ml-9">
            <Wifi size={10} className="text-emerald-500" />
            <span>Atendente: {protocol.agent.name}</span>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {protocol.messages.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <MessageSquare size={40} className="mx-auto mb-3 opacity-30" />
            <p>Nenhuma mensagem ainda</p>
            <p className="text-sm mt-1">Inicie a conversa abaixo</p>
          </div>
        )}

        {protocol.messages.map((msg) => {
          const msgDate = new Date(msg.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
          const showDate = msgDate !== lastDate;
          lastDate = msgDate;
          const isMe = msg.sender.id === user?.id;
          const isAgent = ['AGENT', 'SUPERVISOR', 'ADMIN'].includes(msg.senderRole);
          const isBot = msg.senderRole === 'BOT';
          const MsgChannelIcon = channelIcons[msg.channel] || Globe;

          return (
            <div key={msg.id}>
              {showDate && (
                <div className="text-center my-3">
                  <span className="text-xs bg-gray-200 text-gray-500 px-3 py-1 rounded-full">{msgDate}</span>
                </div>
              )}
              <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] ${isMe ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                  {!isMe && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-400 px-1">
                      {isBot && <Bot size={11} className="text-indigo-600" />}
                      <span className={isAgent ? 'font-semibold text-claro-red' : isBot ? 'font-semibold text-indigo-600' : ''}>{msg.sender.name}</span>
                      <MsgChannelIcon size={10} />
                    </div>
                  )}
                  <div
                    className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                      isMe
                        ? 'bg-claro-red text-white rounded-br-sm'
                        : isAgent
                        ? 'bg-gray-900 text-white rounded-bl-sm'
                        : isBot
                        ? 'bg-indigo-50 text-gray-900 border border-indigo-100 rounded-bl-sm'
                        : 'bg-white text-gray-900 border border-gray-100 rounded-bl-sm shadow-sm'
                    }`}
                  >
                    {msg.content}
                  </div>
                  <span className="text-xs text-gray-400 px-1 flex items-center gap-1">
                    {new Date(msg.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    <span>· via {channelLabels[msg.channel] ?? msg.channel}</span>
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        {assistantTyping && (
          <div className="flex justify-start">
            <span className="flex items-center gap-1.5 text-xs text-indigo-600 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-full">
              <Bot size={12} className="animate-pulse" /> Clara está digitando…
            </span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {protocol.status !== 'CLOSED' ? (
        <div className="bg-white border-t border-gray-100 p-4 safe-bottom">
          <div className="flex gap-2 items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
              }}
              placeholder="Digite sua mensagem..."
              rows={1}
              className="input flex-1 resize-none text-sm py-3 max-h-24"
              style={{ minHeight: '48px' }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="w-12 h-12 bg-claro-red hover:bg-claro-red-dark disabled:opacity-50 text-white rounded-xl flex items-center justify-center transition-colors flex-shrink-0 active:scale-95"
            >
              {sending ? <RefreshCw size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white border-t border-gray-100 p-4 text-center safe-bottom">
          <p className="text-gray-400 text-sm">Protocolo encerrado</p>
        </div>
      )}
    </div>
  );
}
