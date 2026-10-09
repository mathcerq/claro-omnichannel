import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AssistantContext, AssistantDecision, AssistantEngine } from '../assistant.types';
import { buildSystemPrompt } from '../assistant.prompt';

interface OllamaToolCall {
  function: { name: string; arguments: Record<string, unknown> | string };
}

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: OllamaToolCall[];
  tool_name?: string;
}

const MAX_TOOL_ROUNDS = 5;

/**
 * LLM local e gratuito via Ollama (https://ollama.com). Roda na máquina da
 * operadora: nenhuma conversa sai da infraestrutura (bom para a LGPD).
 * API: POST /api/chat com `tools` (function calling).
 */
@Injectable()
export class OllamaEngine implements AssistantEngine {
  readonly name: string;
  readonly kind = 'LLM' as const;
  private readonly logger = new Logger(OllamaEngine.name);
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  /** Modelos com raciocínio (ex.: qwen3): OLLAMA_THINK=false deixa a resposta mais rápida */
  private readonly think: boolean | undefined;
  private availability: { ok: boolean; checkedAt: number } | null = null;

  constructor(config: ConfigService) {
    this.baseUrl = (config.get<string>('OLLAMA_URL') || 'http://localhost:11434').replace(/\/+$/, '');
    this.model = config.get<string>('OLLAMA_MODEL') || 'qwen2.5:7b';
    this.timeoutMs = Number(config.get('OLLAMA_TIMEOUT_MS') || 90000);
    const think = config.get<string>('OLLAMA_THINK');
    this.think = think === undefined || think === '' ? undefined : think === 'true';
    this.name = `ollama:${this.model}`;
  }

  /** Ollama no ar e com o modelo baixado? (resultado em cache por 30s) */
  async isAvailable(): Promise<boolean> {
    if (this.availability && Date.now() - this.availability.checkedAt < 30_000) return this.availability.ok;
    let ok = false;
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(2000) });
      const body: any = await res.json();
      const wanted = this.model.includes(':') ? this.model : `${this.model}:latest`;
      ok = res.ok && (body.models ?? []).some((m: any) => m.name === wanted || m.model === wanted);
      if (!ok) this.logger.warn(`Ollama no ar, mas o modelo ${this.model} não foi baixado (ollama pull ${this.model}).`);
    } catch {
      ok = false;
    }
    this.availability = { ok, checkedAt: Date.now() };
    return ok;
  }

  async respond(ctx: AssistantContext): Promise<AssistantDecision> {
    const messages: OllamaMessage[] = [
      { role: 'system', content: buildSystemPrompt(ctx) },
      ...ctx.history.map((t) => ({ role: t.role, content: t.content })),
    ];
    const tools = ctx.toolbox.definitions.map((d) => ({ type: 'function', function: d }));

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const message = await this.chat(messages, round < MAX_TOOL_ROUNDS ? tools : undefined);
      const calls = message.tool_calls ?? [];

      if (calls.length === 0) {
        return { reply: cleanReply(message.content), engine: this.name, toolsUsed: [...ctx.toolbox.used] };
      }

      messages.push({ role: 'assistant', content: message.content ?? '', tool_calls: calls });
      for (const call of calls) {
        const args = parseArgs(call.function.arguments);
        let result: unknown;
        try {
          result = await ctx.toolbox.execute(call.function.name, args);
        } catch (err) {
          result = { erro: (err as Error).message };
        }
        messages.push({ role: 'tool', tool_name: call.function.name, content: JSON.stringify(result) });
      }
    }
    throw new Error('A IA excedeu o número de chamadas de ferramenta');
  }

  private async chat(messages: OllamaMessage[], tools?: unknown[]): Promise<OllamaMessage> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages,
        ...(tools ? { tools } : {}),
        ...(this.think !== undefined ? { think: this.think } : {}),
        stream: false,
        keep_alive: '30m',
        options: { temperature: 0.2, num_ctx: 8192 },
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const body: any = await res.json().catch(() => null);
    if (!res.ok || !body?.message) {
      this.availability = null;
      throw new Error(`Ollama respondeu ${res.status}: ${body?.error ?? 'resposta inválida'}`);
    }
    return body.message as OllamaMessage;
  }
}

function parseArgs(raw: Record<string, unknown> | string | undefined): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw;
}

/** Remove markdown e blocos de raciocínio que modelos pequenos às vezes emitem. */
export function cleanReply(text: string | undefined): string {
  return (text ?? '')
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^#+\s*/gm, '')
    .trim();
}
