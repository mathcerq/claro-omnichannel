import { useState, useEffect, useRef } from 'react';
import { Send, Wifi, Phone, Globe, MessageSquare } from 'lucide-react';
import { Message } from '../store/protocols.store';
import ChannelBadge from './ChannelBadge';
import { useAuthStore } from '../store/auth.store';

interface Props {
  messages: Message[];
  onSend: (content: string, channel: string) => Promise<void>;
  currentChannel: string;
  disabled?: boolean;
}

const channelOptions = [
  { value: 'WEBCHAT', label: 'WebChat', Icon: Globe },
  { value: 'WHATSAPP', label: 'WhatsApp', Icon: MessageSquare },
  { value: 'PHONE', label: 'Telefone', Icon: Phone },
];

export default function ChatPanel({ messages, onSend, currentChannel, disabled }: Props) {
  const [input, setInput] = useState('');
  const [channel, setChannel] = useState(currentChannel || 'WEBCHAT');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    setChannel(currentChannel || 'WEBCHAT');
  }, [currentChannel]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      await onSend(input.trim(), channel);
      setInput('');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  let lastDate = '';

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 py-12">
            <Wifi size={40} className="mx-auto mb-3 opacity-40" />
            <p>Nenhuma mensagem ainda</p>
          </div>
        )}
        {messages.map((msg) => {
          const msgDate = formatDate(msg.createdAt);
          const showDate = msgDate !== lastDate;
          lastDate = msgDate;
          const isAgent = msg.senderRole === 'AGENT' || msg.senderRole === 'SUPERVISOR' || msg.senderRole === 'ADMIN';
          const isMine = msg.sender.id === user?.id;

          return (
            <div key={msg.id}>
              {showDate && (
                <div className="text-center text-xs text-gray-500 my-3">
                  <span className="bg-gray-800 px-3 py-1 rounded-full">{msgDate}</span>
                </div>
              )}
              <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] ${isMine ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    {!isMine && <span className="font-medium text-gray-300">{msg.sender.name}</span>}
                    <ChannelBadge channel={msg.channel} />
                  </div>
                  <div
                    className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      isMine
                        ? 'bg-claro-red text-white rounded-tr-sm'
                        : isAgent
                        ? 'bg-gray-700 text-gray-100 rounded-tl-sm'
                        : 'bg-gray-800 text-gray-100 rounded-tl-sm border border-gray-700'
                    }`}
                  >
                    {msg.content}
                  </div>
                  <span className="text-xs text-gray-600">{formatTime(msg.createdAt)}</span>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {!disabled && (
        <div className="p-3 border-t border-gray-800 space-y-2">
          <div className="flex gap-2">
            {channelOptions.map(({ value, label, Icon }) => (
              <button
                key={value}
                onClick={() => setChannel(value)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  channel === value
                    ? 'bg-claro-red text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                <Icon size={12} />
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Responder via ${channelOptions.find(c => c.value === channel)?.label}...`}
              rows={2}
              className="input flex-1 resize-none text-sm"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="btn-primary self-end p-2.5"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
