import { Controller, Get } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { AssistantService } from './assistant.service';

@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  /** Qual motor a assistente está usando (Ollama local ou regras). */
  @Get('status')
  @Roles('ADMIN', 'SUPERVISOR', 'AGENT')
  status() {
    return this.assistant.status();
  }
}
