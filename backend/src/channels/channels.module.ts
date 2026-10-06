import { Module, OnModuleInit } from '@nestjs/common';
import { ChannelRegistry } from './channel-registry.service';
import { ChannelDispatcher } from './channel-dispatcher.service';
import { ChannelsController } from './channels.controller';
import { WebchatAdapter } from './webchat/webchat.adapter';

/**
 * Infraestrutura de canais (registro + entrega de saída) e o canal WebChat.
 * Canais externos (Telegram, Telefone mock) ficam em módulos próprios que
 * importam este módulo e registram seus adapters.
 */
@Module({
  controllers: [ChannelsController],
  providers: [ChannelRegistry, ChannelDispatcher, WebchatAdapter],
  exports: [ChannelRegistry],
})
export class ChannelsModule implements OnModuleInit {
  constructor(
    private readonly registry: ChannelRegistry,
    private readonly webchat: WebchatAdapter,
  ) {}

  onModuleInit() {
    this.registry.register(this.webchat);
  }
}
