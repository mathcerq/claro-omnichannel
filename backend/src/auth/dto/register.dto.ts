import { IsEmail, IsString, MinLength, IsOptional, IsIn } from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(2, { message: 'Nome deve ter no mínimo 2 caracteres' })
  name: string;

  @IsEmail({}, { message: 'E-mail inválido' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'Senha deve ter no mínimo 8 caracteres' })
  password: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsIn(['CLIENT', 'AGENT', 'SUPERVISOR', 'ADMIN'])
  role?: string;
}
