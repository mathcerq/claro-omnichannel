import { MessageSquare, Phone, Globe, Mail } from 'lucide-react';

const config: Record<string, { label: string; color: string; Icon: any }> = {
  WHATSAPP: { label: 'WhatsApp', color: 'bg-green-900 text-green-300', Icon: MessageSquare },
  PHONE: { label: 'Telefone', color: 'bg-blue-900 text-blue-300', Icon: Phone },
  WEBCHAT: { label: 'WebChat', color: 'bg-purple-900 text-purple-300', Icon: Globe },
  EMAIL: { label: 'E-mail', color: 'bg-yellow-900 text-yellow-300', Icon: Mail },
};

export default function ChannelBadge({ channel }: { channel: string }) {
  const c = config[channel] || config.WEBCHAT;
  return (
    <span className={`badge ${c.color}`}>
      <c.Icon size={12} />
      {c.label}
    </span>
  );
}
