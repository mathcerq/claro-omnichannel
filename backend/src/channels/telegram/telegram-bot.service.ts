import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProtocolsService } from '../../protocols/protocols.service';
import { MessagesService } from '../../messages/messages.service';
import { TelegramApiClient } from './telegram-api.client';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramMessage, TelegramUpdate } from './telegram.types';
import {
  CHANNEL_EMOJI,
  CHANNEL_LABEL,
  STATUS_LABEL,
  deriveTitle,
  formatDateTime,
  parseCommand,
  texts,
  truncate,
} from './telegram.texts';

type Identity = NonNullable<Awaited<ReturnType<TelegramLinkService['findByChat']>>>;

const MAX_MESSAGES_PER_MINUTE = 20;

/**
 * Regras de conversa do bot. Recebe cada update (vindo do long polling) e
 * traduz para operações do núcleo: abrir protocolo, registrar mensagem na
 * timeline, consultar histórico. Nenhum conteúdo de mensagem vai para log.
 */
@Injectable()
export class TelegramBotService {
  private readonly logger = new Logger(TelegramBotService.name);
  private readonly clientAppUrl: string;
  private readonly rate = new Map<string, number[]>();
  botUsername?: string;

  constructor(
    private readonly api: TelegramApiClient,
    private readonly links: TelegramLinkService,
    private readonly protocols: ProtocolsService,
    private readonly messages: MessagesService,
    config: ConfigService,
  ) {
    this.clientAppUrl = config.get<string>('CLIENT_APP_URL') || 'http://localhost:5174';
  }

  async handleUpdate(update: TelegramUpdate) {
    const msg = update.message;
    if (!msg) return;
    const chatId = String(msg.chat.id);

    if (msg.chat.type !== 'private') {
      return this.reply(chatId, texts.onlyPrivate);
    }
    const text = msg.text?.trim();
    if (!text) return this.reply(chatId, texts.onlyText);

    if (this.isRateLimited(chatId)) return this.reply(chatId, texts.tooFast);

    const command = parseCommand(text, this.botUsername);
    const identity = await this.links.findByChat(chatId);

    // Comandos que funcionam sem vínculo
    if (command?.name === 'start' || command?.name === 'vincular') {
      return this.handleLink(chatId, command.args, identity, command.name === 'start');
    }
    if (command?.name === 'ajuda' || command?.name === 'help') {
      return this.reply(chatId, identity ? texts.help : texts.welcomeUnlinked(this.clientAppUrl));
    }

    if (!identity) return this.reply(chatId, texts.welcomeUnlinked(this.clientAppUrl));
    if (!identity.user.isActive) return this.reply(chatId, texts.inactiveAccount);

    if (!command) return this.handleText(identity, msg, text);

    switch (command.name) {
      case 'novo':
        return this.handleNew(identity, command.args);
      case 'protocolos':
        return this.handleList(identity);
      case 'usar':
        return this.handleUse(identity, command.args);
      case 'historico':
        return this.handleHistory(identity);
      case 'status':
        return this.handleStatus(identity);
      case 'desvincular':
        await this.links.unlinkUser(identity.userId);
        return this.reply(chatId, texts.unlinked);
      default:
        return this.reply(chatId, texts.unknownCommand);
    }
  }

  // ── Vínculo ────────────────────────────────────────────────────────────────

  private async handleLink(chatId: string, code: string, identity: Identity | null, isStart: boolean) {
    if (!code) {
      if (identity) return this.reply(chatId, texts.linked(identity.user.name));
      return this.reply(chatId, isStart ? texts.welcomeUnlinked(this.clientAppUrl) : texts.linkUsage);
    }
    const result = await this.links.consumeCode(code, chatId);
    if (!result.ok) return this.reply(chatId, texts.linkFailed[result.reason]);
    this.logger.log(`Chat do Telegram vinculado ao usuário ${result.user.id}`);
    return this.reply(chatId, texts.linked(result.user.name));
  }

  // ── Mensagem livre: cria ou reaproveita o protocolo ───────────────────────────

  private async handleText(identity: Identity, msg: TelegramMessage, text: string) {
    const chatId = identity.externalId;
    try {
      let protocol = await this.resolveActiveProtocol(identity);
      let notice: string | null = null;

      if (!protocol) {
        const title = deriveTitle(text);
        protocol = await this.protocols.create(identity.userId, { title, description: text }, 'TELEGRAM');
        notice = texts.protocolCreated(protocol.protocolNumber, protocol.title);
      } else if (protocol.id !== identity.activeProtocolId) {
        notice = texts.protocolSwitched(protocol.protocolNumber, protocol.title);
      }

      if (protocol.id !== identity.activeProtocolId) {
        await this.links.setActiveProtocol(identity.id, protocol.id);
      }

      await this.messages.createInbound({
        protocolId: protocol.id,
        channel: 'TELEGRAM',
        content: text,
        externalId: `${chatId}:${msg.message_id}`,
        metadata: { telegramMessageId: msg.message_id },
      });

      if (notice) await this.reply(chatId, notice);
    } catch (err) {
      this.logger.warn(`Falha ao registrar mensagem do Telegram: ${(err as Error).message}`);
      await this.reply(chatId, texts.genericError);
    }
  }

  /** Protocolo ativo do chat; se encerrado/ausente, o mais recente em aberto. */
  private async resolveActiveProtocol(identity: Identity) {
    if (identity.activeProtocolId) {
      const active = await this.protocols.findForClient(identity.userId, identity.activeProtocolId);
      if (active && active.status !== 'CLOSED') return active;
    }
    const [latest] = await this.protocols.listOpenForClient(identity.userId, 1);
    return latest ?? null;
  }

  // ── Comandos ─────────────────────────────────────────────────────────────────

  private async handleNew(identity: Identity, args: string) {
    if (!args) return this.reply(identity.externalId, texts.newUsage);
    const title = truncate(args.split('\n')[0].replace(/\s+/g, ' ').trim(), 120);
    if (title.length < 5) return this.reply(identity.externalId, texts.newTitleTooShort);

    const protocol = await this.protocols.create(
      identity.userId,
      { title, description: args.length > title.length ? args : undefined },
      'TELEGRAM',
    );
    await this.links.setActiveProtocol(identity.id, protocol.id);
    return this.reply(identity.externalId, texts.protocolCreatedByCommand(protocol.protocolNumber, protocol.title));
  }

  private async handleList(identity: Identity) {
    const list = await this.protocols.listOpenForClient(identity.userId, 10);
    if (list.length === 0) return this.reply(identity.externalId, texts.noOpenProtocols);

    const lines = list.map((p) => {
      const marker = p.id === identity.activeProtocolId ? '👉' : '•';
      return `${marker} ${p.protocolNumber} — ${truncate(p.title, 50)}\n   ${STATUS_LABEL[p.status] ?? p.status} · último canal: ${CHANNEL_LABEL[p.currentChannel] ?? p.currentChannel}`;
    });
    return this.reply(
      identity.externalId,
      `📂 Seus protocolos em aberto:\n\n${lines.join('\n')}\n\nPara continuar um deles: /usar NÚMERO`,
    );
  }

  private async handleUse(identity: Identity, args: string) {
    const ref = args.split(/\s+/)[0];
    if (!ref) return this.reply(identity.externalId, texts.useUsage);
    const protocol = await this.protocols.findForClient(identity.userId, ref);
    if (!protocol) return this.reply(identity.externalId, texts.protocolNotFound);
    if (protocol.status === 'CLOSED') return this.reply(identity.externalId, texts.protocolClosed);

    await this.links.setActiveProtocol(identity.id, protocol.id);
    return this.reply(identity.externalId, texts.protocolSelected(protocol.protocolNumber, protocol.title));
  }

  /** Mostra que o histórico é o mesmo em todos os canais. */
  private async handleHistory(identity: Identity) {
    const protocol = await this.resolveActiveProtocol(identity);
    if (!protocol) return this.reply(identity.externalId, texts.noActiveProtocol);

    const recent = await this.messages.findRecent(protocol.id, 10);
    const lines = recent.map((m) => {
      const who = m.senderRole === 'CLIENT' ? 'Você' : m.sender.name;
      const channel = `${CHANNEL_EMOJI[m.channel] ?? ''} ${CHANNEL_LABEL[m.channel] ?? m.channel}`;
      return `[${formatDateTime(m.createdAt)}] ${channel} · ${who}:\n${truncate(m.content, 300)}`;
    });
    const header = `🕘 Histórico de ${protocol.protocolNumber} — ${protocol.title}`;
    const body = lines.length ? lines.join('\n\n') : 'Ainda não há mensagens.';
    return this.reply(identity.externalId, `${header}\n\n${body}`);
  }

  private async handleStatus(identity: Identity) {
    const protocol = await this.resolveActiveProtocol(identity);
    if (!protocol) return this.reply(identity.externalId, texts.noActiveProtocol);
    const lines = [
      `📋 ${protocol.protocolNumber} — ${protocol.title}`,
      `Status: ${STATUS_LABEL[protocol.status] ?? protocol.status}`,
      `Atendente: ${protocol.agent?.name ?? 'aguardando atribuição'}`,
      `Último canal: ${CHANNEL_LABEL[protocol.currentChannel] ?? protocol.currentChannel}`,
      `Mensagens: ${protocol._count.messages}`,
    ];
    return this.reply(identity.externalId, lines.join('\n'));
  }

  // ── Utilitários ─────────────────────────────────────────────────────────────

  private async reply(chatId: string, text: string) {
    try {
      await this.api.sendMessage(chatId, text);
    } catch (err) {
      this.logger.warn(`Falha ao responder no Telegram: ${(err as Error).message}`);
    }
  }

  private isRateLimited(chatId: string) {
    const now = Date.now();
    const recent = (this.rate.get(chatId) ?? []).filter((t) => now - t < 60_000);
    recent.push(now);
    this.rate.set(chatId, recent);
    return recent.length > MAX_MESSAGES_PER_MINUTE;
  }
}
