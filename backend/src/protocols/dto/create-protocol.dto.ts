import { IsString, IsOptional, IsIn, MinLength, MaxLength } from 'class-validator';

export class CreateProtocolDto {
  @IsString()
  @MinLength(5, { message: 'Título deve ter no mínimo 5 caracteres' })
  @MaxLength(120, { message: 'Título deve ter no máximo 120 caracteres' })
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
  priority?: string;
}
