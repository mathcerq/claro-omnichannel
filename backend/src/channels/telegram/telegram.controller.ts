import { Controller, Delete, Get, HttpCode, Post, ServiceUnavailableException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramPollingService } from './telegram-polling.service';
import { TelegramApiClient } from './telegram-api.client';

/** Vínculo do Telegram — usado pelo cliente logado no WebChat. */
@Controller('channels/telegram')
@Roles('CLIENT')
export class TelegramController {
  constructor(
    private readonly links: TelegramLinkService,
    private readonly polling: TelegramPollingService,
    private readonly api: TelegramApiClient,
  ) {}

  @Get()
  async status(@CurrentUser('id') userId: string) {
    const identity = await this.links.findByUser(userId);
    return {
      enabled: this.api.isConfigured && this.polling.ready,
      botUsername: this.polling.botUsername ?? null,
      linked: !!identity,
      linkedAt: identity?.createdAt ?? null,
    };
  }

  /** Gera um código de uso único (10 min) e o deep link t.me/<bot>?start=<código>. */
  @Post('link-code')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async createLinkCode(@CurrentUser('id') userId: string) {
    if (!this.api.isConfigured || !this.polling.ready || !this.polling.botUsername) {
      throw new ServiceUnavailableException('Canal Telegram indisponível no momento');
    }
    const { code, expiresAt } = await this.links.generateCode(userId);
    const botUsername = this.polling.botUsername;
    return {
      code,
      expiresAt,
      botUsername,
      deepLink: `https://t.me/${botUsername}?start=${code}`,
    };
  }

  /** Revoga o vínculo (LGPD: o titular pode retirar o consentimento a qualquer momento). */
  @Delete('link')
  @HttpCode(200)
  async unlink(@CurrentUser('id') userId: string) {
    const removed = await this.links.unlinkUser(userId);
    return { unlinked: removed };
  }
}
