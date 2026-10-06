import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(role?: string) {
    return this.prisma.user.findMany({
      where: role ? { role } : undefined,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        totpEnabled: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        totpEnabled: true,
        isActive: true,
        createdAt: true,
        _count: {
          select: {
            clientProtocols: true,
            agentProtocols: true,
          },
        },
      },
    });

    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user;
  }

  async updateStatus(id: string, isActive: boolean) {
    return this.prisma.user.update({
      where: { id },
      data: { isActive },
      select: { id: true, name: true, email: true, isActive: true },
    });
  }

  /** Exportação dos dados do titular (sem hash de senha nem segredo do 2FA). */
  async exportMyData(userId: string) {
    const data = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        totpEnabled: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        channelIdentities: { select: { channel: true, createdAt: true } },
        clientProtocols: {
          select: {
            protocolNumber: true,
            title: true,
            description: true,
            status: true,
            priority: true,
            currentChannel: true,
            createdAt: true,
            closedAt: true,
            agent: { select: { name: true } },
            messages: {
              select: { content: true, channel: true, senderRole: true, createdAt: true, sender: { select: { name: true } } },
              orderBy: { createdAt: 'asc' },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        auditLogs: {
          select: { action: true, resource: true, ipAddress: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 200,
        },
      },
    });
    if (!data) throw new NotFoundException('Usuário não encontrado');

    await this.prisma.auditLog.create({
      data: { action: 'DATA_EXPORTED', resource: 'USER', userId },
    });

    return {
      generatedAt: new Date(),
      controller: 'Claro Omnichannel — PoC acadêmica (FIAP)',
      legalBasis: 'LGPD, art. 18, II (acesso) e V (portabilidade)',
      data,
    };
  }

  async getAgents() {
    return this.prisma.user.findMany({
      where: { role: { in: ['AGENT', 'SUPERVISOR'] }, isActive: true },
      select: { id: true, name: true, email: true, role: true },
    });
  }
}
