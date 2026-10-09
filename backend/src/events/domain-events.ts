/**
 * Eventos de domínio publicados pelo núcleo (protocolos/mensagens).
 *
 * O núcleo apenas publica; quem reage (WebSocket, canais externos como o
 * Telegram, auditoria...) assina via @OnEvent. Assim um canal novo é
 * plugado sem alterar MessagesService/ProtocolsService.
 */
export const DomainEvents = {
  MESSAGE_CREATED: 'message.created',
  MESSAGE_DELIVERY_UPDATED: 'message.delivery_updated',
  PROTOCOL_CREATED: 'protocol.created',
  PROTOCOL_UPDATED: 'protocol.updated',
  CHANNEL_LINKED: 'channel.linked',
  CHANNEL_UNLINKED: 'channel.unlinked',
  ASSISTANT_TYPING: 'assistant.typing',
} as const;

export interface MessageCreatedEvent {
  protocolId: string;
  clientId: string;
  /** Mensagem no mesmo formato retornado pela API REST (inclui sender) */
  message: {
    id: string;
    content: string;
    channel: string;
    senderRole: string;
    createdAt: Date;
    deliveryStatus?: string | null;
    sender: { id: string; name: string; role: string };
    [key: string]: unknown;
  };
}

export interface MessageDeliveryUpdatedEvent {
  protocolId: string;
  messageId: string;
  channel: string;
  deliveryStatus: string;
}

export interface ProtocolChangedEvent {
  protocolId: string;
  clientId: string;
  /** Protocolo no formato retornado pela API REST */
  protocol: Record<string, any>;
  /** Campos alterados (apenas em protocol.updated) */
  changes?: Record<string, unknown>;
}

export interface AssistantTypingEvent {
  protocolId: string;
  clientId: string;
  channel: string;
  typing: boolean;
}

export interface ChannelLinkEvent {
  userId: string;
  channel: string;
}
