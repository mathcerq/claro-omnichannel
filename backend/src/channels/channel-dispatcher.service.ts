import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import {
  DomainEvents,
  MessageCreatedEvent,
  MessageDeliveryUpdatedEvent,
} from '../events/domain-events';
import { ChannelRegistry } from './channel-registry.service';

/**
 * Entrega de saída: quando um atendente envia uma mensagem por um canal
 * externo, o adapter do canal é acionado. O resultado (SENT/FAILED/SIMULATED)
 * é gravado na mensagem e publicado para o painel.
 */
@Injectable()
export class ChannelDispatcher {
  private readonly logger = new Logger(ChannelDispatcher.name);

  constructor(
    private readonly registry: ChannelRegistry,
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  @OnEvent(DomainEvents.MESSAGE_CREATED, { async: true, promisify: true })
  async onMessageCreated(event: MessageCreatedEvent) {
    const { message } = event;
    if (message.senderRole === 'CLIENT') return; // entrada: nada a entregar

    const adapter = this.registry.get(message.channel);
    if (!adapter?.deliver) return;

    const protocol = await this.prisma.protocol.findUnique({
      where: { id: event.protocolId },
      select: { protocolNumber: true, title: true },
    });
    if (!protocol) return;

    let status: Awaited<ReturnType<NonNullable<typeof adapter.deliver>>>;
    try {
      status = await adapter.deliver({
        protocolId: event.protocolId,
        protocolNumber: protocol.protocolNumber,
        protocolTitle: protocol.title,
        clientId: event.clientId,
        messageId: message.id,
        content: message.content,
        senderName: message.sender.name,
        senderRole: message.senderRole,
      });
    } catch (err) {
      this.logger.warn(`Falha ao entregar mensagem ${message.id} via ${adapter.code}: ${(err as Error).message}`);
      status = 'FAILED';
    }

    await this.prisma.message.update({
      where: { id: message.id },
      data: { deliveryStatus: status },
    });

    const payload: MessageDeliveryUpdatedEvent = {
      protocolId: event.protocolId,
      messageId: message.id,
      channel: message.channel,
      deliveryStatus: status,
    };
    this.events.emit(DomainEvents.MESSAGE_DELIVERY_UPDATED, payload);
  }
}
