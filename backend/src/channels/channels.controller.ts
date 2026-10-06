import { Controller, Get } from '@nestjs/common';
import { ChannelRegistry } from './channel-registry.service';

@Controller('channels')
export class ChannelsController {
  constructor(private readonly registry: ChannelRegistry) {}

  /** Lista os canais e indica quais são reais e quais são simulados (mock). */
  @Get()
  list() {
    return this.registry.list();
  }
}
