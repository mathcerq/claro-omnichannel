/**
 * Catálogo de canais de atendimento.
 *
 * - WEBCHAT  → real (PWA do cliente + WebSocket)
 * - TELEGRAM → real (bot via Bot API, long polling)
 * - PHONE    → MOCK assumido: dados inventados, sem integração com telefonia.
 *
 * Para adicionar um canal (ex.: WhatsApp Business, e-mail), crie um módulo que
 * implemente ChannelAdapter e registre-o no ChannelRegistry. O núcleo
 * (protocolos/mensagens) não muda.
 */
export const CHANNEL_CODES = ['WEBCHAT', 'TELEGRAM', 'PHONE'] as const;
export type ChannelCode = (typeof CHANNEL_CODES)[number];

/** Canais que existiam em dados antigos; aceitos na leitura, não na escrita. */
export const LEGACY_CHANNEL_CODES = ['WHATSAPP', 'EMAIL'] as const;

export type ChannelKind = 'REAL' | 'MOCK';

export type DeliveryStatus = 'SENT' | 'FAILED' | 'SIMULATED';

export interface OutboundMessage {
  protocolId: string;
  protocolNumber: string;
  protocolTitle: string;
  clientId: string;
  messageId: string;
  content: string;
  senderName: string;
  /** AGENT/SUPERVISOR/ADMIN ou BOT (assistente virtual) */
  senderRole: string;
}

export interface ChannelInfo {
  code: ChannelCode;
  label: string;
  kind: ChannelKind;
  /** Canal operante neste ambiente (ex.: Telegram sem token = false) */
  enabled: boolean;
  description: string;
  [extra: string]: unknown;
}

export interface ChannelAdapter {
  readonly code: ChannelCode;
  readonly label: string;
  readonly kind: ChannelKind;

  /** Informações públicas do canal (exibidas nos painéis e em GET /channels) */
  info(): ChannelInfo;

  /** O atendente pode responder ao cliente por este canal? */
  isAvailableFor(clientId: string): Promise<boolean>;

  /**
   * Entrega uma mensagem do atendente ao cliente pelo canal.
   * Ausente quando a entrega já acontece por outro meio (WebChat = WebSocket).
   */
  deliver?(message: OutboundMessage): Promise<DeliveryStatus>;
}
