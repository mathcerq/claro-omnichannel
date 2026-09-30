import { Module } from '@nestjs/common';
import { ProtocolsService } from './protocols.service';
import { ProtocolsController } from './protocols.controller';

@Module({
  controllers: [ProtocolsController],
  providers: [ProtocolsService],
  exports: [ProtocolsService],
})
export class ProtocolsModule {}
