import { Module, OnModuleInit } from '@nestjs/common';
import { ChannelsModule } from '../channels.module';
import { ChannelRegistry } from '../channel-registry.service';
import { MessagesModule } from '../../messages/messages.module';
import { PhoneMockAdapter } from './phone-mock.adapter';
import { PhoneMockService } from './phone-mock.service';
import { PhoneMockController } from './phone-mock.controller';

/** Canal telefone — MOCK assumido (ver PhoneMockAdapter). */
@Module({
  imports: [ChannelsModule, MessagesModule],
  controllers: [PhoneMockController],
  providers: [PhoneMockAdapter, PhoneMockService],
})
export class PhoneMockModule implements OnModuleInit {
  constructor(
    private readonly registry: ChannelRegistry,
    private readonly adapter: PhoneMockAdapter,
  ) {}

  onModuleInit() {
    this.registry.register(this.adapter);
  }
}
