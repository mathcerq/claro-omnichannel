import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMessageDto } from './dto/create-message.dto';

@Injectable()
export class MessagesService {
  constructor(private prisma: PrismaService) {}

  async create(protocolId: string, senderId: string, senderRole: string, dto: CreateMessageDto) {
    const protocol = await this.prisma.protocol.findUnique({ where: { id: protocolId } });
    if (!protocol) throw new NotFoundException('Protocolo não encontrado');

    if (protocol.status === 'CLOSED') {
      throw new ForbiddenException('Protocolo encerrado. Não é possível enviar mensagens.');
    }

    if (senderRole === 'CLIENT' && protocol.clientId !== senderId) {
      throw new ForbiddenException('Acesso negado');
    }

    const message = await this.prisma.message.create({
      data: {
        content: dto.content,
        channel: dto.channel,
        senderRole,
        metadata: dto.metadata,
        protocolId,
        senderId,
      },
      include: {
        sender: { select: { id: true, name: true, role: true } },
      },
    });

    await this.prisma.protocol.update({
      where: { id: protocolId },
      data: {
        currentChannel: dto.channel,
        updatedAt: new Date(),
      },
    });

    return message;
  }

  async findByProtocol(protocolId: string, userId: string, userRole: string) {
    const protocol = await this.prisma.protocol.findUnique({ where: { id: protocolId } });
    if (!protocol) throw new NotFoundException('Protocolo não encontrado');

    if (userRole === 'CLIENT' && protocol.clientId !== userId) {
      throw new ForbiddenException('Acesso negado');
    }

    const messages = await this.prisma.message.findMany({
      where: { protocolId },
      include: {
        sender: { select: { id: true, name: true, role: true } },
      },
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

  async simulateInbound(protocolId: string, channel: string, content: string) {
    const protocol = await this.prisma.protocol.findUnique({
      where: { id: protocolId },
      include: { client: true },
    });
    if (!protocol) throw new NotFoundException('Protocolo não encontrado');

    return this.prisma.message.create({
      data: {
        content: `[${channel} Simulado] ${content}`,
        channel,
        senderRole: 'CLIENT',
        metadata: JSON.stringify({ simulated: true, timestamp: new Date() }),
        protocolId,
        senderId: protocol.clientId,
      },
      include: {
        sender: { select: { id: true, name: true, role: true } },
      },
    });
  }
}
