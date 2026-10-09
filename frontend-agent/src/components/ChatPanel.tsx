import { useState, useEffect, useRef } from 'react';
import { Send, Wifi, Phone, Globe, CheckCheck, AlertTriangle, FlaskConical, Bot } from 'lucide-react';
import { Message } from '../store/protocols.store';
import ChannelBadge from './ChannelBadge';
import { useAuthStore } from '../store/auth.store';

interface Props {
  messages: Message[];
  onSend: (content: string, channel: string) => Promise<void>;
  /** Canais pelos quais é possível responder a este cliente (vem da API) */
  availableChannels?: string[];
  disabled?: boolean;
  /** A assistente virtual está preparando uma resposta */
  assistantTyping?: boolean;
}

const channelOptions = [
  { value: 'WEBCHAT', label: 'WebChat', Icon: Globe, placeholder: 'Responder pelo WebChat...' },
  { value: 'TELEGRAM', label: 'Telegram', Icon: Send, placeholder: 'Responder pelo Telegram do cliente...' },
  {
    value: 'PHONE',
    label: 'Telefone (mock)',
    Icon: Phone,
    placeholder: 'Registrar anotação da ligação (canal simulado — nada é enviado)...',
  },
];

function DeliveryInfo({ message }: { message: Message }) {
  if (message.senderRole === 'CLIENT' || !message.deliveryStatus) {
    if (message.senderRole !== 'CLIENT' && message.channel === 'TELEGRAM') {
      return <span className="text-gray-500">enviando ao Telegram…</span>;
    }
    return null;
  }
  if (message.deliveryStatus === 'SENT') {
    return (
      <span className="flex items-center gap-1 text-sky-400">
        <CheckCheck size={12} /> entregue no Telegram
      </span>
    );
  }
  if (message.deliveryStatus === 'SIMULATED') {
    return (
      <span className="flex items-center gap-1 text-gray-500">
        <FlaskConical size={12} /> registro simulado
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-amber-400">
      <AlertTriangle size={12} /> falha na entrega
    </span>
  );
}

export default function ChatPanel({ messages, onSend, availableChannels, disabled, assistantTyping }: Props) {
  const isAvailable = (value: string) => !availableChannels || availableChannels.includes(value);

  // Responde, por padrão, pelo último canal REAL em que o cliente escreveu
  // (Telegram, se vinculado; senão WebChat). O telefone é mock: só por escolha.
  const lastClientMessage = [...messages].reverse().find((m) => m.senderRole === 'CLIENT' && m.channel !== 'PHONE');
  const preferredChannel =
    lastClientMessage?.channel === 'TELEGRAM' && isAvailable('TELEGRAM') ? 'TELEGRAM' : 'WEBCHAT';

  const [input, setInput] = useState('');
  const [channel, setChannel] = useState(preferredChannel);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, assistantTyping]);

  useEffect(() => {
    setChannel(preferredChannel);
  }, [lastClientMessage?.id, preferredChannel]);

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
  const selected = channelOptions.find((c) => c.value === channel);

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
          const isBot = msg.senderRole === 'BOT';
          const companySide = isMine || isBot;

          return (
            <div key={msg.id}>
              {showDate && (
                <div className="text-center text-xs text-gray-500 my-3">
                  <span className="bg-gray-800 px-3 py-1 rounded-full">{msgDate}</span>
                </div>
              )}
              <div className={`flex ${companySide ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] ${companySide ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    {isBot && (
                      <span className="flex items-center gap-1 font-medium text-indigo-300">
                        <Bot size={12} /> {msg.sender.name} · IA
                      </span>
                    )}
                    {!isMine && !isBot && <span className="font-medium text-gray-300">{msg.sender.name}</span>}
                    <ChannelBadge channel={msg.channel} />
                  </div>
                  <div
                    className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                      isMine
                        ? 'bg-claro-red text-white rounded-tr-sm'
                        : isBot
                        ? 'bg-indigo-950 text-indigo-100 border border-indigo-800 rounded-tr-sm'
                        : isAgent
                        ? 'bg-gray-700 text-gray-100 rounded-tl-sm'
                        : 'bg-gray-800 text-gray-100 rounded-tl-sm border border-gray-700'
                    }`}
                  >
                    {msg.content}
                  </div>
                  <span className="text-xs text-gray-600 flex items-center gap-2">
                    {formatTime(msg.createdAt)}
                    {(isAgent || isBot) && <DeliveryInfo message={msg} />}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        {assistantTyping && (
          <div className="flex justify-end">
            <span className="flex items-center gap-1.5 text-xs text-indigo-300 bg-indigo-950/60 border border-indigo-900 px-3 py-1.5 rounded-full">
              <Bot size={12} className="animate-pulse" /> Clara (IA) está digitando…
            </span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {!disabled && (
        <div className="p-3 border-t border-gray-800 space-y-2">
          <div className="flex gap-2 flex-wrap">
            {channelOptions.map(({ value, label, Icon }) => {
              const available = isAvailable(value);
              return (
                <button
                  key={value}
                  onClick={() => available && setChannel(value)}
                  disabled={!available}
                  title={available ? undefined : 'O cliente não vinculou este canal'}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    channel === value
                      ? 'bg-claro-red text-white'
                      : available
                      ? 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                      : 'bg-gray-900 text-gray-600 cursor-not-allowed line-through'
                  }`}
                >
                  <Icon size={12} />
                  {label}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={selected?.placeholder}
              rows={2}
              maxLength={4000}
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
