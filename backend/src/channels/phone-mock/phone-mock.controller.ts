import { Body, Controller, Post } from '@nestjs/common';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PhoneMockService } from './phone-mock.service';

export class SimulateCallDto {
  @IsUUID()
  protocolId: string;

  /** Resumo da ligação. Vazio = texto fictício gerado automaticamente. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string;
}

/** ⚠️ Endpoint de SIMULAÇÃO do canal telefone (mock assumido). */
@Controller('channels/phone')
export class PhoneMockController {
  constructor(private readonly phone: PhoneMockService) {}

  @Post('mock-call')
  @Roles('ADMIN', 'SUPERVISOR', 'AGENT')
  simulateCall(@CurrentUser() user: any, @Body() dto: SimulateCallDto) {
    return this.phone.simulateIncomingCall(user, dto.protocolId, dto.summary);
  }
}
