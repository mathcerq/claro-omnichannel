import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { TelegramApiClient, TelegramApiError } from './telegram-api.client';
import { TelegramBotService } from './telegram-bot.service';
import { BOT_COMMANDS } from './telegram.texts';

const LONG_POLL_TIMEOUT_SEC = 25;
const MAX_BACKOFF_MS = 30_000;

/**
 * Long polling da Bot API (getUpdates). Escolhido para rodar localmente sem
 * expor o servidor à internet (webhook exigiria URL pública com HTTPS).
 *
 * - Só inicia se TELEGRAM_BOT_TOKEN estiver definido.
 * - Erros de rede → backoff exponencial (1s … 30s), o loop nunca morre.
 * - 409 Conflict → outra instância está consumindo o mesmo bot.
 * - Updates são confirmados pelo offset; reentregas são deduplicadas na
 *   timeline por (canal, externalId).
 */
@Injectable()
export class TelegramPollingService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('TelegramPolling');
  private abort = new AbortController();
  private running = false;
  private offset?: number;
  private loopPromise?: Promise<void>;

  /** Bot autenticado (getMe ok) e loop ativo */
  ready = false;
  botUsername?: string;

  constructor(
    private readonly api: TelegramApiClient,
    private readonly bot: TelegramBotService,
  ) {}

  async onApplicationBootstrap() {
    if (!this.api.isConfigured) {
      this.logger.warn('TELEGRAM_BOT_TOKEN não definido — canal Telegram desativado.');
      return;
    }
    // Não bloqueia o boot da API: o Telegram sobe em paralelo
    this.loopPromise = this.start().catch((err) =>
      this.logger.error(`Canal Telegram não iniciou: ${(err as Error).message}`),
    );
  }

  async onApplicationShutdown() {
    this.running = false;
    this.abort.abort();
    await this.loopPromise;
  }

  private async start() {
    const me = await this.withRetry(() => this.api.getMe());
    if (!me) return;
    this.botUsername = me.username;
    this.bot.botUsername = me.username;

    // Webhook ativo impede getUpdates (409). Removemos para usar long polling.
    await this.api.deleteWebhook();
    await this.api.setMyCommands(BOT_COMMANDS).catch((err) =>
      this.logger.warn(`setMyCommands falhou: ${(err as Error).message}`),
    );

    this.running = true;
    this.ready = true;
    this.logger.log(`Bot @${me.username} conectado — long polling iniciado.`);
    await this.loop();
  }

  private async loop() {
    let backoff = 1000;
    while (this.running) {
      try {
        const updates = await this.api.getUpdates(this.offset, LONG_POLL_TIMEOUT_SEC, this.abort.signal);
        backoff = 1000;
        for (const update of updates) {
          this.offset = update.update_id + 1;
          try {
            await this.bot.handleUpdate(update);
          } catch (err) {
            this.logger.error(`Erro ao processar update ${update.update_id}: ${(err as Error).message}`);
          }
        }
      } catch (err) {
        if (!this.running) break;
        if (err instanceof TelegramApiError && err.code === 409) {
          this.logger.warn('Conflito (409): outra instância está usando este bot. Tentando novamente…');
        } else if (err instanceof TelegramApiError && (err.code === 401 || err.code === 404)) {
          this.logger.error('Token do Telegram rejeitado (401/404). Verifique TELEGRAM_BOT_TOKEN.');
          this.ready = false;
          return;
        } else {
          this.logger.warn(`Long polling falhou: ${(err as Error).message}. Nova tentativa em ${backoff / 1000}s`);
        }
        await this.sleep(backoff);
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      }
    }
    this.ready = false;
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T | null> {
    let backoff = 1000;
    while (!this.abort.signal.aborted) {
      try {
        return await fn();
      } catch (err) {
        if (err instanceof TelegramApiError && (err.code === 401 || err.code === 404)) {
          this.logger.error('Token do Telegram rejeitado (401/404). Verifique TELEGRAM_BOT_TOKEN.');
          return null;
        }
        this.logger.warn(`Telegram indisponível: ${(err as Error).message}. Nova tentativa em ${backoff / 1000}s`);
        await this.sleep(backoff);
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      }
    }
    return null;
  }

  private sleep(ms: number) {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);
      this.abort.signal.addEventListener('abort', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}
