import { IsOptional, IsIn, IsUUID } from 'class-validator';
import { CHANNEL_CODES } from '../../channels/channel.types';

export class UpdateProtocolDto {
  @IsOptional()
  @IsIn(['OPEN', 'IN_PROGRESS', 'WAITING', 'CLOSED'])
  status?: string;

  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
  priority?: string;

  @IsOptional()
  @IsIn([...CHANNEL_CODES])
  currentChannel?: string;
}

export class AssignAgentDto {
  /** Vazio = o próprio atendente logado assume */
  @IsOptional()
  @IsUUID()
  agentId?: string;
}
