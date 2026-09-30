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

  async getAgents() {
    return this.prisma.user.findMany({
      where: { role: { in: ['AGENT', 'SUPERVISOR'] }, isActive: true },
      select: { id: true, name: true, email: true, role: true },
    });
  }
}
