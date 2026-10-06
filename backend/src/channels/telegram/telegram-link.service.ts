import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createHash, randomInt } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { ChannelLinkEvent, DomainEvents } from '../../events/domain-events';

const CHANNEL = 'TELEGRAM';
/** Sem caracteres ambíguos (0/O, 1/I/L) para facilitar a digitação */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
export const LINK_CODE_TTL_MS = 10 * 60 * 1000;

const MAX_FAILED_ATTEMPTS = 5;
const FAILED_WINDOW_MS = 15 * 60 * 1000;

export interface LinkResult {
  ok: boolean;
  user?: { id: string; name: string };
  reason?: 'INVALID' | 'EXPIRED' | 'TOO_MANY_ATTEMPTS';
}

function hashCode(code: string) {
  return createHash('sha256').update(code).digest('hex');
}

export function normalizeLinkCode(input: string) {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Vínculo chat do Telegram ↔ usuário CLIENT.
 *
 * Fluxo: o cliente, LOGADO no WebChat, gera um código de uso único (10 min) e
 * o envia ao bot (/start CODIGO via deep link, ou /vincular CODIGO). Isso prova
 * que quem está no Telegram também controla a conta — diferente de vincular
 * por e-mail, que permitiria a qualquer pessoa se passar por outro cliente.
 *
 * LGPD: só o hash do código é salvo; do Telegram guardamos apenas o chat id
 * (nada de nome, username ou telefone). /desvincular apaga o vínculo.
 */
@Injectable()
export class TelegramLinkService {
  private readonly failedAttempts = new Map<string, { count: number; firstAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async generateCode(userId: string) {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS);

    // Apenas um código válido por vez: gerar outro invalida os anteriores
    await this.prisma.$transaction([
      this.prisma.channelLinkCode.deleteMany({ where: { userId, channel: CHANNEL, usedAt: null } }),
      this.prisma.channelLinkCode.create({
        data: { channel: CHANNEL, codeHash: hashCode(code), expiresAt, userId },
      }),
      this.prisma.auditLog.create({
        data: { action: 'TELEGRAM_LINK_CODE_CREATED', resource: 'CHANNEL', userId },
      }),
    ]);

    return { code, expiresAt };
  }

  async consumeCode(rawCode: string, chatId: string): Promise<LinkResult> {
    if (this.isBlocked(chatId)) return { ok: false, reason: 'TOO_MANY_ATTEMPTS' };

    const code = normalizeLinkCode(rawCode);
    const record =
      code.length === CODE_LENGTH
        ? await this.prisma.channelLinkCode.findUnique({
            where: { codeHash: hashCode(code) },
            include: { user: { select: { id: true, name: true, role: true, isActive: true } } },
          })
        : null;

    const invalid =
      !record || record.usedAt || record.channel !== CHANNEL || !record.user.isActive || record.user.role !== 'CLIENT';
    if (invalid || record.expiresAt < new Date()) {
      this.registerFailure(chatId);
      await this.prisma.auditLog.create({
        data: {
          action: 'TELEGRAM_LINK_FAILED',
          resource: 'CHANNEL',
          details: invalid ? 'Código inválido ou já utilizado' : 'Código expirado',
          userId: record?.userId,
        },
      });
      return { ok: false, reason: invalid ? 'INVALID' : 'EXPIRED' };
    }

    const user = record.user;
    await this.prisma.$transaction([
      this.prisma.channelLinkCode.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      // Um chat ↔ um cliente: remove vínculos anteriores deste chat e deste cliente
      this.prisma.channelIdentity.deleteMany({
        where: { channel: CHANNEL, OR: [{ externalId: chatId }, { userId: user.id }] },
      }),
      this.prisma.channelIdentity.create({
        data: { channel: CHANNEL, externalId: chatId, userId: user.id },
      }),
      this.prisma.auditLog.create({
        data: { action: 'TELEGRAM_LINKED', resource: 'CHANNEL', userId: user.id },
      }),
    ]);

    this.failedAttempts.delete(chatId);
    this.emit(DomainEvents.CHANNEL_LINKED, user.id);
    return { ok: true, user: { id: user.id, name: user.name } };
  }

  /** Identidade vinculada a um chat (com o usuário), ou null. */
  findByChat(chatId: string) {
    return this.prisma.channelIdentity.findUnique({
      where: { channel_externalId: { channel: CHANNEL, externalId: chatId } },
      include: { user: { select: { id: true, name: true, role: true, isActive: true } } },
    });
  }

  findByUser(userId: string) {
    return this.prisma.channelIdentity.findUnique({
      where: { channel_userId: { channel: CHANNEL, userId } },
    });
  }

  setActiveProtocol(identityId: string, protocolId: string | null) {
    return this.prisma.channelIdentity.update({
      where: { id: identityId },
      data: { activeProtocolId: protocolId },
    });
  }

  async unlinkUser(userId: string) {
    const { count } = await this.prisma.channelIdentity.deleteMany({ where: { channel: CHANNEL, userId } });
    if (count > 0) {
      await this.prisma.auditLog.create({
        data: { action: 'TELEGRAM_UNLINKED', resource: 'CHANNEL', userId },
      });
      this.emit(DomainEvents.CHANNEL_UNLINKED, userId);
    }
    return count > 0;
  }

  private emit(event: string, userId: string) {
    const payload: ChannelLinkEvent = { userId, channel: CHANNEL };
    this.events.emit(event, payload);
  }

  private isBlocked(chatId: string) {
    const entry = this.failedAttempts.get(chatId);
    if (!entry) return false;
    if (Date.now() - entry.firstAt > FAILED_WINDOW_MS) {
      this.failedAttempts.delete(chatId);
      return false;
    }
    return entry.count >= MAX_FAILED_ATTEMPTS;
  }

  private registerFailure(chatId: string) {
    const entry = this.failedAttempts.get(chatId);
    if (!entry || Date.now() - entry.firstAt > FAILED_WINDOW_MS) {
      this.failedAttempts.set(chatId, { count: 1, firstAt: Date.now() });
    } else {
      entry.count++;
    }
  }
}
