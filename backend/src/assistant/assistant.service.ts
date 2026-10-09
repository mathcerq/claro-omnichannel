import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MessagesService } from '../messages/messages.service';
import { ProtocolsService } from '../protocols/protocols.service';
import { ChannelRegistry } from '../channels/channel-registry.service';
import {
  AssistantTypingEvent,
  DomainEvents,
  MessageCreatedEvent,
  ProtocolChangedEvent,
} from '../events/domain-events';
import { STAFF_ROLES } from '../protocols/protocol-access';
import { AssistantContext, AssistantDecision, AssistantEngine, ConversationTurn } from './assistant.types';
import { createToolbox } from './assistant-tools';
import { respondWithGuardrails } from './assistant-guardrails';
import { ASSISTANT_NAME } from './assistant.prompt';
import { OllamaEngine } from './engines/ollama.engine';
import { RulesEngine } from './engines/rules.engine';

export const ASSISTANT_EMAIL = 'assistente.virtual@claro.com.br';
const REPLY_CHANNELS = ['WEBCHAT', 'TELEGRAM'];
const HISTORY_LIMIT = 30;

type Mode = 'ollama' | 'rules' | 'off';

/**
 * Assistente virtual (atendimento nível 1).
 *
 * Assina os eventos do núcleo: quando o cliente escreve (WebChat ou Telegram)
 * num protocolo que ainda está com a IA, ela responde na mesma timeline.
 * Resolve o que é simples com ferramentas e transfere o resto para humanos
 * com um resumo do caso. Assim que um atendente assume ou escreve, ela sai.
 */
@Injectable()
export class AssistantService implements OnModuleInit {
  private readonly logger = new Logger('Assistente');
  private readonly mode: Mode;
  private readonly debounceMs: number;
  private botUserId: string | null = null;
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly running = new Map<string, Promise<void>>();
  private readonly pending = new Set<string>();
  private lastEngineName: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly messages: MessagesService,
    private readonly protocols: ProtocolsService,
    private readonly channels: ChannelRegistry,
    private readonly ollama: OllamaEngine,
    private readonly rules: RulesEngine,
    config: ConfigService,
  ) {
    const mode = (config.get<string>('ASSISTANT_ENGINE') || 'ollama').toLowerCase();
    this.mode = (['ollama', 'rules', 'off'].includes(mode) ? mode : 'ollama') as Mode;
    this.debounceMs = Number(config.get('ASSISTANT_DEBOUNCE_MS') ?? 1500);
  }

  get enabled() {
    return this.mode !== 'off';
  }

  async onModuleInit() {
    if (!this.enabled) {
      this.logger.log('Assistente virtual desligada (ASSISTANT_ENGINE=off).');
      return;
    }
    this.botUserId = await this.ensureBotUser();
    const engine = await this.pickEngine();
    this.logger.log(`Assistente virtual ativa — motor: ${engine.name}${engine.kind === 'RULES' && this.mode === 'ollama' ? ' (Ollama indisponível, usando reserva)' : ''}`);
  }

  async status() {
    const engine = this.enabled ? await this.pickEngine() : null;
    return {
      enabled: this.enabled,
      mode: this.mode,
      engine: engine?.name ?? null,
      engineKind: engine?.kind ?? null,
      local: engine ? true : null, // Ollama e regras rodam na própria máquina
      llmAvailable: this.mode === 'ollama' ? await this.ollama.isAvailable() : null,
    };
  }

  // ── Eventos do núcleo ────────────────────────────────────────────────────────

  @OnEvent(DomainEvents.MESSAGE_CREATED)
  onMessageCreated(event: MessageCreatedEvent) {
    if (!this.enabled) return;
    const { senderRole, channel } = event.message;
    if (senderRole === 'CLIENT' && REPLY_CHANNELS.includes(channel)) {
      this.schedule(event.protocolId);
    } else if (STAFF_ROLES.includes(senderRole)) {
      this.humanTookOver(event.protocolId);
    }
  }

  @OnEvent(DomainEvents.PROTOCOL_CREATED)
  onProtocolCreated(event: ProtocolChangedEvent) {
    // Chamado aberto pelo app: a IA já cumprimenta e começa a ajudar com base no assunto
    if (this.enabled && event.protocol.currentChannel === 'WEBCHAT') this.schedule(event.protocolId);
  }

  @OnEvent(DomainEvents.PROTOCOL_UPDATED)
  onProtocolUpdated(event: ProtocolChangedEvent) {
    if (this.enabled && typeof event.changes?.agentId === 'string') this.humanTookOver(event.protocolId);
  }

  // ── Fila por protocolo ───────────────────────────────────────────────────────

  /** Espera o cliente terminar de digitar (rajada de mensagens = uma resposta só). */
  private schedule(protocolId: string) {
    clearTimeout(this.timers.get(protocolId));
    this.timers.set(
      protocolId,
      setTimeout(() => {
        this.timers.delete(protocolId);
        this.enqueue(protocolId);
      }, this.debounceMs),
    );
  }

  /** Um turno por vez em cada protocolo; mensagens que chegam no meio geram outro turno. */
  private enqueue(protocolId: string) {
    if (this.running.has(protocolId)) {
      this.pending.add(protocolId);
      return;
    }
    const run = this.turn(protocolId)
      .catch((err) => this.logger.error(`Falha no turno da assistente: ${(err as Error).message}`))
      .finally(() => {
        this.running.delete(protocolId);
        if (this.pending.delete(protocolId)) this.enqueue(protocolId);
      });
    this.running.set(protocolId, run);
  }

  /** Aguarda turnos pendentes (usado nos testes e no desligamento). */
  async idle() {
    while (this.timers.size || this.running.size) {
      await Promise.all(this.running.values());
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  private async humanTookOver(protocolId: string) {
    clearTimeout(this.timers.get(protocolId));
    this.timers.delete(protocolId);
    await this.protocols.markHumanTookOver(protocolId);
  }

  // ── Um turno de atendimento ───────────────────────────────────────────────────

  private async turn(protocolId: string) {
    const protocol = await this.prisma.protocol.findUnique({
      where: { id: protocolId },
      include: {
        client: { select: { id: true, name: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: HISTORY_LIMIT,
          select: { content: true, senderRole: true, channel: true },
        },
      },
    });
    if (!protocol || protocol.status === 'CLOSED' || protocol.aiStatus !== 'ACTIVE' || protocol.agentId) return;

    const recent = protocol.messages.reverse();
    if (recent.length && recent[recent.length - 1].senderRole === 'BOT') return; // nada novo do cliente

    const history: ConversationTurn[] = recent
      .filter((m) => m.senderRole === 'CLIENT' || m.senderRole === 'BOT')
      .map((m) => ({
        role: m.senderRole === 'BOT' ? 'assistant' : 'user',
        content: m.channel === 'PHONE' ? `[ligação telefônica registrada] ${m.content}` : m.content,
      }));
    if (!history.some((t) => t.role === 'user')) {
      history.unshift({
        role: 'user',
        content: `Abri um chamado: ${protocol.title}${protocol.description ? `. ${protocol.description}` : ''}`,
      });
    }

    const channel = await this.replyChannel(protocol.client.id, protocol.currentChannel, recent);
    const protocolInfo = { number: protocol.protocolNumber, status: protocol.status };
    const baseContext = {
      protocolNumber: protocol.protocolNumber,
      protocolTitle: protocol.title,
      protocolStatus: protocol.status,
      customerFirstName: protocol.client.name.split(' ')[0],
      history,
    };

    this.typing(protocol.id, protocol.client.id, channel, true);
    let ctx: AssistantContext = { ...baseContext, toolbox: createToolbox(protocol.client.id, protocolInfo) };
    let decision: AssistantDecision;
    const engine = await this.pickEngine();
    try {
      decision = await respondWithGuardrails(engine, this.rules, ctx);
      if (!decision.reply.trim()) throw new Error('resposta vazia');
    } catch (err) {
      if (engine.kind !== 'LLM') throw err;
      this.logger.warn(`IA (${engine.name}) falhou: ${(err as Error).message}. Usando o motor de regras neste turno.`);
      ctx = { ...baseContext, toolbox: createToolbox(protocol.client.id, protocolInfo) };
      decision = await this.rules.respond(ctx);
    } finally {
      this.typing(protocol.id, protocol.client.id, channel, false);
    }

    // Um atendente pode ter assumido enquanto a IA pensava
    const fresh = await this.prisma.protocol.findUnique({
      where: { id: protocol.id },
      select: { aiStatus: true, status: true, agentId: true },
    });
    if (!fresh || fresh.aiStatus !== 'ACTIVE' || fresh.status === 'CLOSED' || fresh.agentId) return;

    await this.messages.createBotMessage({
      protocolId: protocol.id,
      senderId: this.botUserId!,
      channel,
      content: decision.reply,
      metadata: { assistant: true, engine: decision.engine, tools: decision.toolsUsed, guardrail: decision.guardrail },
    });

    const action = ctx.toolbox.action;
    if (action) {
      await this.protocols.applyAssistantOutcome(protocol.id, action);
      this.logger.log(`Protocolo ${protocol.protocolNumber}: ${action.type === 'HANDOFF' ? 'transferido para atendente' : 'resolvido pela IA'}`);
    }
  }

  /** Responde no último canal REAL usado pelo cliente (Telegram só se estiver vinculado). */
  private async replyChannel(clientId: string, currentChannel: string, recent: { senderRole: string; channel: string }[]) {
    const lastClient = [...recent].reverse().find((m) => m.senderRole === 'CLIENT' && REPLY_CHANNELS.includes(m.channel));
    const preferred = lastClient?.channel ?? (REPLY_CHANNELS.includes(currentChannel) ? currentChannel : 'WEBCHAT');
    if (preferred === 'TELEGRAM' && !(await this.channels.availableFor(clientId)).includes('TELEGRAM')) return 'WEBCHAT';
    return preferred;
  }

  private async pickEngine(): Promise<AssistantEngine> {
    const engine = this.mode === 'ollama' && (await this.ollama.isAvailable()) ? this.ollama : this.rules;
    if (engine.name !== this.lastEngineName) {
      if (this.lastEngineName) this.logger.warn(`Motor da assistente mudou para: ${engine.name}`);
      this.lastEngineName = engine.name;
    }
    return engine;
  }

  private readonly typingTimers = new Map<string, NodeJS.Timeout>();

  /** "digitando..." durante toda a espera (o do Telegram expira em ~5s, então é renovado). */
  private typing(protocolId: string, clientId: string, channel: string, typing: boolean) {
    const emit = (value: boolean) => {
      const event: AssistantTypingEvent = { protocolId, clientId, channel, typing: value };
      this.events.emit(DomainEvents.ASSISTANT_TYPING, event);
    };
    clearInterval(this.typingTimers.get(protocolId));
    this.typingTimers.delete(protocolId);
    emit(typing);
    if (typing) this.typingTimers.set(protocolId, setInterval(() => emit(true), 4500));
  }

  /** Usuário técnico que assina as mensagens da IA (role BOT, nunca faz login). */
  private async ensureBotUser() {
    const existing = await this.prisma.user.findUnique({ where: { email: ASSISTANT_EMAIL } });
    if (existing) return existing.id;
    const created = await this.prisma.user.create({
      data: {
        name: `${ASSISTANT_NAME} (assistente virtual)`,
        email: ASSISTANT_EMAIL,
        role: 'BOT',
        passwordHash: await bcrypt.hash(randomBytes(32).toString('hex'), 12),
      },
    });
    return created.id;
  }
}
