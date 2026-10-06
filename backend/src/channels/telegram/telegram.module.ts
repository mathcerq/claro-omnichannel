import { Module, OnModuleInit } from '@nestjs/common';
import { ChannelsModule } from '../channels.module';
import { ChannelRegistry } from '../channel-registry.service';
import { MessagesModule } from '../../messages/messages.module';
import { ProtocolsModule } from '../../protocols/protocols.module';
import { TelegramApiClient } from './telegram-api.client';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramPollingService } from './telegram-polling.service';
import { TelegramAdapter } from './telegram.adapter';
import { TelegramController } from './telegram.controller';

/** Canal Telegram (real). Desligado automaticamente se não houver TELEGRAM_BOT_TOKEN. */
@Module({
  imports: [ChannelsModule, MessagesModule, ProtocolsModule],
  controllers: [TelegramController],
  providers: [
    TelegramApiClient,
    TelegramLinkService,
    TelegramBotService,
    TelegramPollingService,
    TelegramAdapter,
  ],
})
export class TelegramModule implements OnModuleInit {
  constructor(
    private readonly registry: ChannelRegistry,
    private readonly adapter: TelegramAdapter,
  ) {}

  onModuleInit() {
    this.registry.register(this.adapter);
  }
}
