import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProtocolDto } from './dto/create-protocol.dto';
import { UpdateProtocolDto } from './dto/update-protocol.dto';
import { protocolSelect } from './protocol.select';
import { ChannelRegistry } from '../channels/channel-registry.service';
import { DomainEvents, ProtocolChangedEvent } from '../events/domain-events';
import { STAFF_ROLES, canAccessProtocol } from './protocol-access';

/** Formato: CLR-AAAA-NNNNN (único e independente do canal). */
function generateProtocolNumber(): string {
  const year = new Date().getFullYear();
  return `CLR-${year}-${randomInt(10000, 100000)}`;
}

@Injectable()
export class ProtocolsService {
  constructor(
    private prisma: PrismaService,
    private events: EventEmitter2,
    private channels: ChannelRegistry,
  ) {}

  /**
   * Abre um protocolo. `channel` é o canal de entrada: WEBCHAT pela API REST,
   * TELEGRAM quando aberto pelo bot.
   */
  async create(clientId: string, dto: CreateProtocolDto, channel = 'WEBCHAT') {
    let protocolNumber: string | null = null;
    for (let attempt = 0; attempt < 10 && !protocolNumber; attempt++) {
      const candidate = generateProtocolNumber();
      const exists = await this.prisma.protocol.findUnique({ where: { protocolNumber: candidate } });
      if (!exists) protocolNumber = candidate;
    }
    if (!protocolNumber) {
      throw new ConflictException('Não foi possível gerar um número de protocolo. Tente novamente.');
    }

    const protocol = await this.prisma.protocol.create({
      data: {
        protocolNumber,
        title: dto.title,
        description: dto.description,
        priority: dto.priority || 'MEDIUM',
        currentChannel: channel,
        clientId,
      },
      select: protocolSelect,
    });

    await this.audit('PROTOCOL_CREATED', protocol.protocolNumber, clientId, { channel });
    this.emitChange(DomainEvents.PROTOCOL_CREATED, protocol);
    return protocol;
  }

  async findAll(user: any) {
    const where: any = {};

    if (user.role === 'CLIENT') {
      where.clientId = user.id;
    } else if (user.role === 'AGENT') {
      where.OR = [{ agentId: user.id }, { agentId: null, status: 'OPEN' }];
    }

    return this.prisma.protocol.findMany({
      where,
      select: protocolSelect,
      orderBy: [{ status: 'asc' }, { priority: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async findOne(id: string, user: any) {
    const protocol = await this.prisma.protocol.findUnique({
      where: { id },
      select: {
        ...protocolSelect,
        messages: {
          select: {
            id: true,
            content: true,
            channel: true,
            senderRole: true,
            isRead: true,
            deliveryStatus: true,
            createdAt: true,
            protocolId: true,
            sender: { select: { id: true, name: true, role: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!protocol) throw new NotFoundException('Protocolo não encontrado');

    if (!canAccessProtocol(user, { clientId: protocol.client.id, agentId: protocol.agent?.id ?? null })) {
      throw new ForbiddenException('Acesso negado a este protocolo');
    }

    // Para o atendente: por quais canais ele consegue responder a este cliente
    const availableChannels =
      user.role === 'CLIENT' ? undefined : await this.channels.availableFor(protocol.client.id);

    return { ...protocol, availableChannels };
  }

  async update(id: string, dto: UpdateProtocolDto, user: any) {
    const protocol = await this.prisma.protocol.findUnique({ where: { id } });
    if (!protocol) throw new NotFoundException('Protocolo não encontrado');

    if (user.role === 'CLIENT') {
      throw new ForbiddenException('Clientes não podem alterar protocolos');
    }
    if (!canAccessProtocol(user, protocol)) {
      throw new ForbiddenException('Acesso negado a este protocolo');
    }

    const data: any = { ...dto };
    if (dto.status === 'CLOSED') {
      data.closedAt = new Date();
    } else if (dto.status && protocol.status === 'CLOSED') {
      data.closedAt = null; // reabertura
    }

    const updated = await this.prisma.protocol.update({
      where: { id },
      data,
      select: protocolSelect,
    });

    await this.audit('PROTOCOL_UPDATED', updated.protocolNumber, user.id, dto);
    this.emitChange(DomainEvents.PROTOCOL_UPDATED, updated, { ...dto });
    return updated;
  }

  async assignAgent(protocolId: string, agentId: string, actor: { id: string; role: string }) {
    const [protocol, agent] = await Promise.all([
      this.prisma.protocol.findUnique({ where: { id: protocolId } }),
      this.prisma.user.findUnique({ where: { id: agentId } }),
    ]);
    if (!protocol) throw new NotFoundException('Protocolo não encontrado');
    if (!agent || !agent.isActive || !STAFF_ROLES.includes(agent.role)) {
      throw new BadRequestException('Atendente inválido');
    }
    if (protocol.status === 'CLOSED') {
      throw new BadRequestException('Protocolo encerrado');
    }
    // Atendente só assume/transfere protocolos da fila ou atribuídos a ele
    if (!canAccessProtocol(actor, protocol)) {
      throw new ForbiddenException('Acesso negado a este protocolo');
    }

    const updated = await this.prisma.protocol.update({
      where: { id: protocolId },
      data: { agentId, status: 'IN_PROGRESS' },
      select: protocolSelect,
    });

    await this.audit('PROTOCOL_ASSIGNED', updated.protocolNumber, actor.id, { agentId });
    this.emitChange(DomainEvents.PROTOCOL_UPDATED, updated, { agentId, status: 'IN_PROGRESS' });
    return updated;
  }

  async getStats() {
    const [total, open, inProgress, waiting, closed] = await Promise.all([
      this.prisma.protocol.count(),
      this.prisma.protocol.count({ where: { status: 'OPEN' } }),
      this.prisma.protocol.count({ where: { status: 'IN_PROGRESS' } }),
      this.prisma.protocol.count({ where: { status: 'WAITING' } }),
      this.prisma.protocol.count({ where: { status: 'CLOSED' } }),
    ]);

    const byChannel = await this.prisma.protocol.groupBy({
      by: ['currentChannel'],
      _count: true,
    });

    // Assistente virtual: quanto a IA resolve sozinha e quanto passa para humanos
    const [aiActive, aiHandedOff, aiResolved] = await Promise.all([
      this.prisma.protocol.count({ where: { aiStatus: 'ACTIVE', status: { not: 'CLOSED' } } }),
      this.prisma.protocol.count({ where: { aiHandoffReason: { not: null } } }),
      this.prisma.protocol.count({ where: { aiStatus: 'RESOLVED' } }),
    ]);
    const aiFinished = aiHandedOff + aiResolved;
    const ai = {
      active: aiActive,
      handedOff: aiHandedOff,
      resolved: aiResolved,
      resolutionRate: aiFinished ? Math.round((aiResolved / aiFinished) * 100) : null,
    };

    return { total, open, inProgress, waiting, closed, byChannel, ai };
  }

  // ── Assistente virtual ────────────────────────────────────────────────────────

  /** Resultado do atendimento da IA: transferência para humano ou resolução. */
  async applyAssistantOutcome(
    protocolId: string,
    outcome: { type: 'HANDOFF'; reason: string; summary: string; priority?: string } | { type: 'RESOLVE'; summary: string },
  ) {
    const data: any =
      outcome.type === 'HANDOFF'
        ? {
            aiStatus: 'HANDED_OFF',
            aiHandoffReason: outcome.reason,
            aiSummary: outcome.summary,
            ...(outcome.priority ? { priority: outcome.priority } : {}),
          }
        : { aiStatus: 'RESOLVED', aiSummary: outcome.summary, status: 'CLOSED', closedAt: new Date() };

    const updated = await this.prisma.protocol.update({ where: { id: protocolId }, data, select: protocolSelect });
    await this.prisma.auditLog.create({
      data: {
        action: outcome.type === 'HANDOFF' ? 'AI_HANDOFF' : 'AI_RESOLVED',
        resource: `PROTOCOL:${updated.protocolNumber}`,
        details: outcome.type === 'HANDOFF' ? outcome.reason : null,
      },
    });
    const changes = outcome.type === 'HANDOFF' ? { aiStatus: 'HANDED_OFF' } : { aiStatus: 'RESOLVED', status: 'CLOSED' };
    this.emitChange(DomainEvents.PROTOCOL_UPDATED, updated, changes);
    return updated;
  }

  /** Atendente humano assumiu: a IA para de responder neste protocolo. */
  async markHumanTookOver(protocolId: string) {
    const { count } = await this.prisma.protocol.updateMany({
      where: { id: protocolId, aiStatus: { in: ['ACTIVE', 'HANDED_OFF'] } },
      data: { aiStatus: 'HUMAN' },
    });
    if (count === 0) return;
    const updated = await this.prisma.protocol.findUnique({ where: { id: protocolId }, select: protocolSelect });
    this.emitChange(DomainEvents.PROTOCOL_UPDATED, updated, { aiStatus: 'HUMAN' });
  }

  // ── Consultas usadas pelos canais externos (ex.: bot do Telegram) ──────────

  /** Protocolos não encerrados do cliente, do mais recente para o mais antigo. */
  listOpenForClient(clientId: string, take = 10) {
    return this.prisma.protocol.findMany({
      where: { clientId, status: { not: 'CLOSED' } },
      select: protocolSelect,
      orderBy: { updatedAt: 'desc' },
      take,
    });
  }

  /** Protocolo do cliente por número (CLR-AAAA-NNNNN) ou id. */
  findForClient(clientId: string, idOrNumber: string) {
    return this.prisma.protocol.findFirst({
      where: { clientId, OR: [{ id: idOrNumber }, { protocolNumber: idOrNumber.toUpperCase() }] },
      select: protocolSelect,
    });
  }

  /** Trilha de auditoria (LGPD art. 37): quem alterou o quê, sem conteúdo de mensagens. */
  private audit(action: string, protocolNumber: string, userId: string, details?: unknown) {
    return this.prisma.auditLog.create({
      data: {
        action,
        resource: `PROTOCOL:${protocolNumber}`,
        details: details ? JSON.stringify(details) : null,
        userId,
      },
    });
  }

  private emitChange(
    event: string,
    protocol: { id: string; client: { id: string } } & Record<string, any>,
    changes?: Record<string, unknown>,
  ) {
    const payload: ProtocolChangedEvent = {
      protocolId: protocol.id,
      clientId: protocol.client.id,
      protocol,
      changes,
    };
    this.events.emit(event, payload);
  }
}
