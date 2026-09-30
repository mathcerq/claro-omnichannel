import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProtocolDto } from './dto/create-protocol.dto';
import { UpdateProtocolDto } from './dto/update-protocol.dto';

function generateProtocolNumber(): string {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 90000) + 10000;
  return `CLR-${year}-${random}`;
}

const protocolSelect = {
  id: true,
  protocolNumber: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  currentChannel: true,
  createdAt: true,
  updatedAt: true,
  closedAt: true,
  client: {
    select: { id: true, name: true, email: true, phone: true },
  },
  agent: {
    select: { id: true, name: true, email: true },
  },
  _count: {
    select: { messages: true },
  },
};

@Injectable()
export class ProtocolsService {
  constructor(private prisma: PrismaService) {}

  async create(clientId: string, dto: CreateProtocolDto) {
    let protocolNumber = generateProtocolNumber();
    let attempts = 0;
    while (attempts < 5) {
      const exists = await this.prisma.protocol.findUnique({ where: { protocolNumber } });
      if (!exists) break;
      protocolNumber = generateProtocolNumber();
      attempts++;
    }

    return this.prisma.protocol.create({
      data: {
        protocolNumber,
        title: dto.title,
        description: dto.description,
        priority: dto.priority || 'MEDIUM',
        currentChannel: dto.channel || 'WEBCHAT',
        clientId,
      },
      select: protocolSelect,
    });
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
      orderBy: [
        { status: 'asc' },
        { priority: 'desc' },
        { updatedAt: 'desc' },
      ],
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
            createdAt: true,
            sender: { select: { id: true, name: true, role: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!protocol) throw new NotFoundException('Protocolo não encontrado');

    if (user.role === 'CLIENT' && protocol.client.id !== user.id) {
      throw new ForbiddenException('Acesso negado a este protocolo');
    }

    return protocol;
  }

  async update(id: string, dto: UpdateProtocolDto, user: any) {
    const protocol = await this.prisma.protocol.findUnique({ where: { id } });
    if (!protocol) throw new NotFoundException('Protocolo não encontrado');

    if (user.role === 'CLIENT') {
      throw new ForbiddenException('Clientes não podem alterar protocolos');
    }

    const data: any = { ...dto };
    if (dto.status === 'CLOSED') {
      data.closedAt = new Date();
    }

    return this.prisma.protocol.update({
      where: { id },
      data,
      select: protocolSelect,
    });
  }

  async assignAgent(protocolId: string, agentId: string) {
    return this.prisma.protocol.update({
      where: { id: protocolId },
      data: { agentId, status: 'IN_PROGRESS' },
      select: protocolSelect,
    });
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

    return { total, open, inProgress, waiting, closed, byChannel };
  }
}
