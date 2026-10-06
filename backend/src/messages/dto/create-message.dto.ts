import { IsString, IsIn, MinLength, MaxLength, IsOptional } from 'class-validator';
import { CHANNEL_CODES } from '../../channels/channel.types';

export class CreateMessageDto {
  @IsString()
  @MinLength(1, { message: 'Mensagem não pode ser vazia' })
  @MaxLength(4000, { message: 'Mensagem pode ter no máximo 4000 caracteres' })
  content: string;

  /**
   * Canal pelo qual o ATENDENTE responde (WEBCHAT, TELEGRAM ou PHONE).
   * Para o CLIENT é ignorado: mensagens via REST sempre vêm do WebChat.
   */
  @IsOptional()
  @IsIn([...CHANNEL_CODES])
  channel?: string;
}
