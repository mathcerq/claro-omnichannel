import { Module } from '@nestjs/common';
import { MessagesModule } from '../messages/messages.module';
import { ProtocolsModule } from '../protocols/protocols.module';
import { ChannelsModule } from '../channels/channels.module';
import { AssistantService } from './assistant.service';
import { AssistantController } from './assistant.controller';
import { OllamaEngine } from './engines/ollama.engine';
import { RulesEngine } from './engines/rules.engine';

/**
 * Assistente virtual (IA de atendimento nível 1). Assina os eventos do núcleo,
 * como os canais — desligar é só ASSISTANT_ENGINE=off.
 */
@Module({
  imports: [MessagesModule, ProtocolsModule, ChannelsModule],
  controllers: [AssistantController],
  providers: [AssistantService, OllamaEngine, RulesEngine],
  exports: [AssistantService],
})
export class AssistantModule {}
