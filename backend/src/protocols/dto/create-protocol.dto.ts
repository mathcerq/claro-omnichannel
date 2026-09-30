import { IsString, IsOptional, IsIn, MinLength } from 'class-validator';

export class CreateProtocolDto {
  @IsString()
  @MinLength(5, { message: 'Título deve ter no mínimo 5 caracteres' })
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
  priority?: string;

  @IsOptional()
  @IsIn(['WHATSAPP', 'PHONE', 'WEBCHAT', 'EMAIL'])
  channel?: string;
}
