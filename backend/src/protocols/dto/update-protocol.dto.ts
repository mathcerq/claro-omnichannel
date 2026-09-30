import { IsOptional, IsString, IsIn } from 'class-validator';

export class UpdateProtocolDto {
  @IsOptional()
  @IsIn(['OPEN', 'IN_PROGRESS', 'WAITING', 'CLOSED'])
  status?: string;

  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
  priority?: string;

  @IsOptional()
  @IsIn(['WHATSAPP', 'PHONE', 'WEBCHAT', 'EMAIL'])
  currentChannel?: string;

  @IsOptional()
  @IsString()
  agentId?: string;
}
