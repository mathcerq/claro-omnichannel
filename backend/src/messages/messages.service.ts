import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, Protocol } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { ChannelRegistry } from '../channels/channel-registry.service';
import { DomainEvents, MessageCreatedEvent, ProtocolChangedEvent } from '../events/domain-events';
import { protocolSelect } from '../protocols/protocol.select';
import { canAccessProtocol } from '../protocols/protocol-access';

const messageInclude = {
  sender: { select: { id: true, name: true, role: true } },
} satisfies Prisma.MessageInclude;

export interface InboundMessageInput {
  protocolId: string;
  channel: string;
  content: string;
  /** Id da mensagem no canal de origem — torna a entrada idempotente */
  externalId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Timeline unificada do protocolo. Toda mensagem — de qualquer canal — passa
 * por aqui, é persistida no mesmo protocolo e publicada como evento de domínio.
 */
@Injectable()
export class MessagesService {
  constructor(
    private prisma: PrismaService,
    private events: EventEmitter2,
    private channels: ChannelRegistry,
  ) {}

  /** Mensagem enviada pela API REST (WebChat do cliente ou painel do atendente). */
  async create(protocolId: string, senderId: string, senderRole: string, dto: CreateMessageDto) {
    const protocol = await this.getWritableProtocol(protocolId);

    if (!canAccessProtocol({ id: senderId, role: senderRole }, protocol)) {
      throw new ForbiddenException('Acesso negado');
    }

    // Cliente via REST = WebChat. Ele não pode forjar a origem (ex.: TELEGRAM).
    const channel = senderRole === 'CLIENT' ? 'WEBCHAT' : dto.channel || 'WEBCHAT';
    if (senderRole !== 'CLIENT') {
      await this.channels.assertAvailableFor(channel, protocol.clientId);
    }

    return this.persist(protocol, {
      content: dto.content,
      channel,
      senderRole,
      senderId,
    });
  }

  /**
   * Mensagem do CLIENTE recebida por um canal externo (Telegram, telefone mock...).
   * Idempotente por (channel, externalId): reentregas do canal não duplicam a timeline.
   */
  async createInbound(input: InboundMessageInput) {
    if (input.externalId) {
      const existing = await this.findByExternalId(input.channel, input.externalId);
      if (existing) return existing;
    }

    const protocol = await this.getWritableProtocol(input.protocolId);

    try {
      return await this.persist(protocol, {
        content: input.content,
        channel: input.channel,
        senderRole: 'CLIENT',
        senderId: protocol.clientId,
        externalId: input.externalId,
        metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
      });
    } catch (err) {
      // Corrida entre duas entregas da mesma mensagem externa
      if (
        input.externalId &&
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return this.findByExternalId(input.channel, input.externalId);
      }
      throw err;
    }
  }

  async findByProtocol(protocolId: string, userId: string, userRole: string) {
    const protocol = await this.prisma.protocol.findUnique({ where: { id: protocolId } });
    if (!protocol) throw new NotFoundException('Protocolo não encontrado');

    if (!canAccessProtocol({ id: userId, role: userRole }, protocol)) {
      throw new ForbiddenException('Acesso negado');
    }

    const messages = await this.prisma.message.findMany({
      where: { protocolId },
      include: messageInclude,
      orderBy: { createdAt: 'asc' },
    });

    await this.prisma.message.updateMany({
      where: {
        protocolId,
        isRead: false,
        NOT: { senderId: userId },
      },
      data: { isRead: true },
    });

    return messages;
  }

  /** Últimas mensagens de um protocolo (usado por canais externos, ex.: /historico). */
  async findRecent(protocolId: string, take = 10) {
    const messages = await this.prisma.message.findMany({
      where: { protocolId },
      include: messageInclude,
      orderBy: { createdAt: 'desc' },
      take,
    });
    return messages.reverse();
  }

  private findByExternalId(channel: string, externalId: string) {
    return this.prisma.message.findUnique({
      where: { channel_externalId: { channel, externalId } },
      include: messageInclude,
    });
  }

  private async getWritableProtocol(protocolId: string) {
    const protocol = await this.prisma.protocol.findUnique({ where: { id: protocolId } });
    if (!protocol) throw new NotFoundException('Protocolo não encontrado');
    if (protocol.status === 'CLOSED') {
      throw new ForbiddenException('Protocolo encerrado. Não é possível enviar mensagens.');
    }
    return protocol;
  }

  private async persist(
    protocol: Protocol,
    data: Omit<Prisma.MessageUncheckedCreateInput, 'protocolId'>,
  ) {
    const message = await this.prisma.message.create({
      data: { ...data, protocolId: protocol.id },
      include: messageInclude,
    });

    // O canal atual acompanha a última interação. Se o cliente responde a um
    // protocolo "Aguardando", ele volta para a fila de atendimento.
    const changes: Prisma.ProtocolUpdateInput = { currentChannel: data.channel };
    if (data.senderRole === 'CLIENT' && protocol.status === 'WAITING') {
      changes.status = protocol.agentId ? 'IN_PROGRESS' : 'OPEN';
    }
    const updated = await this.prisma.protocol.update({
      where: { id: protocol.id },
      data: changes,
      select: protocolSelect,
    });

    const event: MessageCreatedEvent = {
      protocolId: protocol.id,
      clientId: protocol.clientId,
      message,
    };
    this.events.emit(DomainEvents.MESSAGE_CREATED, event);

    const protocolEvent: ProtocolChangedEvent = {
      protocolId: protocol.id,
      clientId: protocol.clientId,
      protocol: updated,
      changes: { currentChannel: updated.currentChannel, status: updated.status },
    };
    this.events.emit(DomainEvents.PROTOCOL_UPDATED, protocolEvent);

    return message;
  }
}
