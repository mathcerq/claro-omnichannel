import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ChannelAdapter, ChannelInfo, DeliveryStatus, OutboundMessage } from '../channel.types';
import { AssistantTypingEvent, DomainEvents, ProtocolChangedEvent } from '../../events/domain-events';
import { TelegramApiClient } from './telegram-api.client';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramPollingService } from './telegram-polling.service';
import { texts } from './telegram.texts';

/**
 * Canal Telegram (REAL). Saída: respostas do atendente com canal TELEGRAM
 * são enviadas ao chat vinculado do cliente; também avisa o cliente quando o
 * protocolo é assumido ou encerrado.
 */
@Injectable()
export class TelegramAdapter implements ChannelAdapter {
  readonly code = 'TELEGRAM' as const;
  readonly label = 'Telegram';
  readonly kind = 'REAL' as const;
  private readonly logger = new Logger(TelegramAdapter.name);

  constructor(
    private readonly api: TelegramApiClient,
    private readonly links: TelegramLinkService,
    private readonly polling: TelegramPollingService,
  ) {}

  info(): ChannelInfo {
    return {
      code: this.code,
      label: this.label,
      kind: this.kind,
      enabled: this.api.isConfigured && this.polling.ready,
      description: 'Bot do Telegram (Bot API, long polling)',
      botUsername: this.polling.botUsername ?? null,
    };
  }

  async isAvailableFor(clientId: string): Promise<boolean> {
    return !!(await this.links.findByUser(clientId));
  }

  async deliver(message: OutboundMessage): Promise<DeliveryStatus> {
    const identity = await this.links.findByUser(message.clientId);
    if (!identity) return 'FAILED';

    await this.api.sendMessage(
      identity.externalId,
      message.senderRole === 'BOT'
        ? texts.assistantReply(message.senderName, message.content)
        : texts.agentReply(message.senderName, message.content, message.protocolNumber),
    );
    // A resposta do atendente torna este o protocolo ativo da conversa
    if (identity.activeProtocolId !== message.protocolId) {
      await this.links.setActiveProtocol(identity.id, message.protocolId);
    }
    return 'SENT';
  }

  /** "digitando..." enquanto a assistente virtual prepara a resposta */
  @OnEvent(DomainEvents.ASSISTANT_TYPING, { async: true, promisify: true })
  async onAssistantTyping(event: AssistantTypingEvent) {
    if (!event.typing || event.channel !== 'TELEGRAM' || !this.info().enabled) return;
    const identity = await this.links.findByUser(event.clientId);
    if (identity) await this.api.sendChatAction(identity.externalId, 'typing').catch(() => undefined);
  }

  /** Avisos de mudança no protocolo para quem está sendo atendido pelo Telegram. */
  @OnEvent(DomainEvents.PROTOCOL_UPDATED, { async: true, promisify: true })
  async onProtocolUpdated(event: ProtocolChangedEvent) {
    const { changes, protocol } = event;
    const closed = changes?.status === 'CLOSED';
    const assigned = typeof changes?.agentId === 'string';
    if (!closed && !assigned) return;
    if (!this.info().enabled) return;

    const identity = await this.links.findByUser(event.clientId);
    if (!identity) return;
    const followsHere = protocol.currentChannel === 'TELEGRAM' || identity.activeProtocolId === event.protocolId;
    if (!followsHere) return;

    try {
      if (closed) {
        await this.api.sendMessage(identity.externalId, texts.protocolClosedNotice(protocol.protocolNumber, protocol.title));
        if (identity.activeProtocolId === event.protocolId) {
          await this.links.setActiveProtocol(identity.id, null);
        }
      } else if (assigned && protocol.agent?.name) {
        await this.api.sendMessage(identity.externalId, texts.agentAssignedNotice(protocol.agent.name, protocol.protocolNumber));
      }
    } catch (err) {
      this.logger.warn(`Falha ao notificar cliente no Telegram: ${(err as Error).message}`);
    }
  }
}
