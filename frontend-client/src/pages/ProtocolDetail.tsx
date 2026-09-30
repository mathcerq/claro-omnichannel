import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, RefreshCw, MessageSquare, Phone, Globe, Mail, Wifi } from 'lucide-react';
import api from '../api/axios';
import { getSocket } from '../api/socket';
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
  messages: Message[];
}

const channelIcons: Record<string, any> = { WHATSAPP: MessageSquare, PHONE: Phone, WEBCHAT: Globe, EMAIL: Mail };
const channelLabels: Record<string, string> = { WHATSAPP: 'WhatsApp', PHONE: 'Telefone', WEBCHAT: 'WebChat', EMAIL: 'E-mail' };

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

  useEffect(() => {
    fetchProtocol();
    const socket = getSocket();
    if (id) socket.emit('join_protocol', { protocolId: id });

    socket.on('new_message', (msg: Message) => {
      setProtocol((prev) => {
        if (!prev) return prev;
        const exists = prev.messages.some(m => m.id === msg.id);
        if (exists) return prev;
        return { ...prev, messages: [...prev.messages, msg] };
      });
    });

    socket.on('protocol_updated', (proto: any) => {
      if (proto.id === id) {
        setProtocol((prev) => prev ? { ...prev, ...proto } : prev);
      }
    });

    return () => {
      if (id) socket.emit('leave_protocol', { protocolId: id });
      socket.off('new_message');
      socket.off('protocol_updated');
    };
  }, [id, fetchProtocol, navigate]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [protocol?.messages]);

  const handleSend = async () => {
    if (!input.trim() || sending || !id || !protocol) return;
    setSending(true);
    const channel = protocol.currentChannel || 'WEBCHAT';
    try {
      const res = await api.post(`/protocols/${id}/messages`, { content: input.trim(), channel });
      setProtocol((prev) => prev ? { ...prev, messages: [...prev.messages, res.data] } : prev);
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
                      <span className={isAgent ? 'font-semibold text-claro-red' : ''}>{msg.sender.name}</span>
                      <MsgChannelIcon size={10} />
                    </div>
                  )}
                  <div
                    className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      isMe
                        ? 'bg-claro-red text-white rounded-br-sm'
                        : isAgent
                        ? 'bg-gray-900 text-white rounded-bl-sm'
                        : 'bg-white text-gray-900 border border-gray-100 rounded-bl-sm shadow-sm'
                    }`}
                  >
                    {msg.content}
                  </div>
                  <span className="text-xs text-gray-400 px-1">
                    {new Date(msg.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
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
