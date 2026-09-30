import { IsString, Length } from 'class-validator';

export class VerifyTotpDto {
  @IsString()
  @Length(6, 6, { message: 'Código TOTP deve ter 6 dígitos' })
  code: string;

  @IsString()
  tempToken: string;
}

export class EnableTotpDto {
  @IsString()
  @Length(6, 6, { message: 'Código TOTP deve ter 6 dígitos' })
  code: string;
}
