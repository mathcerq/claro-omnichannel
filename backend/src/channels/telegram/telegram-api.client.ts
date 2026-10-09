import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramBotCommand, TelegramMessage, TelegramUpdate, TelegramUser } from './telegram.types';

export class TelegramApiError extends Error {
  constructor(
    readonly method: string,
    readonly code: number,
    description: string,
    readonly retryAfter?: number,
  ) {
    super(`Telegram ${method} falhou (${code}): ${description}`);
  }
}

/**
 * Cliente HTTP mínimo da Telegram Bot API (fetch nativo do Node 18+).
 *
 * Segurança: o token faz parte da URL da Bot API, então NENHUMA mensagem de
 * erro ou log pode conter a URL. Toda descrição de erro passa por redact().
 */
@Injectable()
export class TelegramApiClient {
  private readonly token: string;
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.token = (config.get<string>('TELEGRAM_BOT_TOKEN') || '').trim();
    this.baseUrl = (config.get<string>('TELEGRAM_API_BASE') || 'https://api.telegram.org').replace(/\/+$/, '');
  }

  get isConfigured(): boolean {
    return this.token.length > 0;
  }

  getMe() {
    return this.call<TelegramUser>('getMe');
  }

  deleteWebhook() {
    return this.call<boolean>('deleteWebhook', { drop_pending_updates: false });
  }

  setMyCommands(commands: TelegramBotCommand[]) {
    return this.call<boolean>('setMyCommands', { commands });
  }

  /** Long polling: a requisição fica aberta até `timeout` segundos esperando updates. */
  getUpdates(offset: number | undefined, timeoutSec: number, signal?: AbortSignal) {
    return this.call<TelegramUpdate[]>(
      'getUpdates',
      { offset, timeout: timeoutSec, allowed_updates: ['message'] },
      signal,
      (timeoutSec + 10) * 1000,
    );
  }

  /** Mostra "digitando..." no chat (dura ~5s ou até a próxima mensagem). */
  sendChatAction(chatId: string | number, action: 'typing') {
    return this.call<boolean>('sendChatAction', { chat_id: chatId, action });
  }

  /** Envia texto puro (sem parse_mode) — conteúdo do usuário nunca é interpretado como HTML/Markdown. */
  async sendMessage(chatId: string | number, text: string): Promise<TelegramMessage> {
    const params = { chat_id: chatId, text: text.slice(0, 4096), disable_web_page_preview: true };
    try {
      return await this.call<TelegramMessage>('sendMessage', params);
    } catch (err) {
      // Respeita o rate limit do Telegram (429) com uma nova tentativa
      if (err instanceof TelegramApiError && err.code === 429 && err.retryAfter && err.retryAfter <= 10) {
        await new Promise((r) => setTimeout(r, err.retryAfter! * 1000));
        return this.call<TelegramMessage>('sendMessage', params);
      }
      throw err;
    }
  }

  redact(text: string): string {
    return this.token ? text.split(this.token).join('***') : text;
  }

  private async call<T>(
    method: string,
    params: Record<string, unknown> = {},
    signal?: AbortSignal,
    timeoutMs = 15000,
  ): Promise<T> {
    if (!this.isConfigured) throw new TelegramApiError(method, 0, 'TELEGRAM_BOT_TOKEN não configurado');

    const timeout = AbortSignal.timeout(timeoutMs);
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/bot${this.token}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
    } catch (err) {
      const e = err as Error & { cause?: Error };
      const detail = [e.name, e.message, e.cause?.message].filter(Boolean).join(' - ');
      throw new TelegramApiError(method, 0, this.redact(detail));
    }

    const body: any = await response.json().catch(() => null);
    if (!response.ok || !body?.ok) {
      throw new TelegramApiError(
        method,
        body?.error_code ?? response.status,
        this.redact(String(body?.description ?? response.statusText)),
        body?.parameters?.retry_after,
      );
    }
    return body.result as T;
  }
}
