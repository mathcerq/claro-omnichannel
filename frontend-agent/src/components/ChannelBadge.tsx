import { MessageSquare, Phone, Globe, Mail, Send } from 'lucide-react';

export const channelConfig: Record<string, { label: string; color: string; Icon: any; mock?: boolean }> = {
  WEBCHAT: { label: 'WebChat', color: 'bg-purple-900 text-purple-300', Icon: Globe },
  TELEGRAM: { label: 'Telegram', color: 'bg-sky-900 text-sky-300', Icon: Send },
  PHONE: { label: 'Telefone', color: 'bg-blue-900 text-blue-300', Icon: Phone, mock: true },
  // Canais legados (dados antigos)
  WHATSAPP: { label: 'WhatsApp', color: 'bg-green-900 text-green-300', Icon: MessageSquare },
  EMAIL: { label: 'E-mail', color: 'bg-yellow-900 text-yellow-300', Icon: Mail },
};

export default function ChannelBadge({ channel }: { channel: string }) {
  const c = channelConfig[channel] || channelConfig.WEBCHAT;
  return (
    <span className={`badge ${c.color}`} title={c.mock ? 'Canal simulado (mock)' : undefined}>
      <c.Icon size={12} />
      {c.label}
      {c.mock && <span className="opacity-70">· mock</span>}
    </span>
  );
}
