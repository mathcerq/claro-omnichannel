import { IsEmail, IsString, MinLength, MaxLength, IsOptional } from 'class-validator';

// Cadastro público cria SEMPRE um CLIENT. Perfis privilegiados são provisionados
// apenas pelo seed/administração — o campo `role` é rejeitado (forbidNonWhitelisted).

export class RegisterDto {
  @IsString()
  @MinLength(2, { message: 'Nome deve ter no mínimo 2 caracteres' })
  @MaxLength(100)
  name: string;

  @IsEmail({}, { message: 'E-mail inválido' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'Senha deve ter no mínimo 8 caracteres' })
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}
