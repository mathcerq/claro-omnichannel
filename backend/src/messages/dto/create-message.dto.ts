import { IsString, IsIn, MinLength, IsOptional } from 'class-validator';

export class CreateMessageDto {
  @IsString()
  @MinLength(1, { message: 'Mensagem não pode ser vazia' })
  content: string;

  @IsIn(['WHATSAPP', 'PHONE', 'WEBCHAT', 'EMAIL'])
  channel: string;

  @IsOptional()
  @IsString()
  metadata?: string;
}
