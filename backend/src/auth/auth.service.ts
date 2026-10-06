import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import * as CryptoJS from 'crypto-js';
import { RegisterDto } from './dto/register.dto';

/** Janela TOTP padrão do otplib/Google Authenticator */
const TOTP_STEP_SECONDS = 30;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  private encryptSecret(secret: string): string {
    const key = process.env.TOTP_ENCRYPTION_KEY;
    return CryptoJS.AES.encrypt(secret, key).toString();
  }

  private decryptSecret(encrypted: string): string {
    const key = process.env.TOTP_ENCRYPTION_KEY;
    const bytes = CryptoJS.AES.decrypt(encrypted, key);
    return bytes.toString(CryptoJS.enc.Utf8);
  }

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) return null;

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) return null;

    return user;
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('E-mail já cadastrado');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        passwordHash,
        phone: dto.phone,
        role: 'CLIENT',
      },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });

    return { message: 'Usuário criado com sucesso', user };
  }

  private readonly PRIVILEGED_ROLES = ['AGENT', 'SUPERVISOR', 'ADMIN'];

  async login(user: any) {
    // 2FA obrigatório para perfis privilegiados
    if (this.PRIVILEGED_ROLES.includes(user.role) && !user.totpEnabled) {
      const setupPayload = { sub: user.id, email: user.email, role: user.role, setupOnly: true };
      const setupToken = this.jwtService.sign(setupPayload, {
        secret: process.env.JWT_SECRET,
        expiresIn: '10m',
      });

      await this.prisma.auditLog.create({
        data: {
          action: 'LOGIN_2FA_SETUP_REQUIRED',
          resource: 'AUTH',
          details: `Privileged user ${user.email} (${user.role}) must configure 2FA`,
          userId: user.id,
        },
      });

      return {
        requiresTotpSetup: true,
        setupToken,
        message: '2FA é obrigatório para este perfil. Configure o autenticador para continuar.',
      };
    }

    if (user.totpEnabled) {
      const tempPayload = { sub: user.id, temp: true };
      const tempToken = this.jwtService.sign(tempPayload, {
        secret: process.env.JWT_SECRET,
        expiresIn: '5m',
      });

      await this.prisma.auditLog.create({
        data: {
          action: 'LOGIN_PENDING_2FA',
          resource: 'AUTH',
          details: `User ${user.email} started login, awaiting 2FA`,
          userId: user.id,
        },
      });

      return { requiresOtp: true, tempToken, message: 'Código 2FA necessário' };
    }

    return this.generateTokens(user);
  }

  async verifyOtpAndLogin(tempToken: string, code: string, ip?: string) {
    let payload: any;
    try {
      payload = this.jwtService.verify(tempToken, {
        secret: process.env.JWT_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Token temporário inválido ou expirado');
    }

    if (!payload.temp) {
      throw new UnauthorizedException('Token inválido');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.totpEnabled || !user.totpSecret) {
      throw new UnauthorizedException('2FA não configurado');
    }

    const secret = this.decryptSecret(user.totpSecret);
    const delta = authenticator.checkDelta(code, secret);

    // Anti-replay (RFC 6238 §5.2): cada código vale uma única vez. O passo
    // usado é gravado de forma condicional — duas requisições simultâneas com
    // o mesmo código não passam juntas.
    const step = delta === null ? null : Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS) + delta;
    const accepted =
      step !== null &&
      (
        await this.prisma.user.updateMany({
          where: { id: user.id, OR: [{ totpLastUsedStep: null }, { totpLastUsedStep: { lt: step } }] },
          data: { totpLastUsedStep: step },
        })
      ).count === 1;

    if (!accepted) {
      await this.prisma.auditLog.create({
        data: {
          action: 'LOGIN_2FA_FAILED',
          resource: 'AUTH',
          details: `Invalid or reused TOTP code for user ${user.email}`,
          ipAddress: ip,
          userId: user.id,
        },
      });
      throw new UnauthorizedException('Código 2FA inválido');
    }

    await this.prisma.auditLog.create({
      data: {
        action: 'LOGIN_SUCCESS',
        resource: 'AUTH',
        details: `User ${user.email} logged in with 2FA`,
        ipAddress: ip,
        userId: user.id,
      },
    });

    return this.generateTokens(user);
  }

  async generateTotpSecret(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    if (user.totpEnabled) {
      throw new BadRequestException('2FA já está ativado');
    }

    const secret = authenticator.generateSecret();
    const otpAuthUrl = authenticator.keyuri(user.email, 'Claro Omnichannel', secret);
    const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);

    const encrypted = this.encryptSecret(secret);
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecret: encrypted },
    });

    return { secret, qrCodeDataUrl, otpAuthUrl };
  }

  async enableTotp(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.totpSecret) {
      throw new BadRequestException('Inicie a configuração do 2FA primeiro');
    }

    const secret = this.decryptSecret(user.totpSecret);
    const isValid = authenticator.verify({ token: code, secret });

    if (!isValid) {
      throw new BadRequestException('Código inválido. Tente novamente.');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: true },
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'TOTP_ENABLED',
        resource: 'AUTH',
        details: `2FA enabled for user ${user.email}`,
        userId,
      },
    });

    return { message: '2FA ativado com sucesso!' };
  }

  async disableTotp(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.totpEnabled || !user.totpSecret) {
      throw new BadRequestException('2FA não está ativado');
    }

    const secret = this.decryptSecret(user.totpSecret);
    const isValid = authenticator.verify({ token: code, secret });

    if (!isValid) {
      throw new UnauthorizedException('Código inválido');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: false, totpSecret: null },
    });

    return { message: '2FA desativado com sucesso' };
  }

  async refreshToken(token: string) {
    let payload: any;
    try {
      payload = this.jwtService.verify(token, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, name: true, email: true, role: true, totpEnabled: true, isActive: true },
    });
    if (!user || !user.isActive) throw new UnauthorizedException();
    return this.generateTokens(user);
  }

  private generateTokens(user: any) {
    const payload = { sub: user.id, email: user.email, role: user.role };

    const accessToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_SECRET,
      expiresIn: process.env.JWT_EXPIRATION || '15m',
    });

    const refreshToken = this.jwtService.sign(
      { sub: user.id },
      {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: process.env.JWT_REFRESH_EXPIRATION || '7d',
      },
    );

    return {
      requiresOtp: false,
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        totpEnabled: user.totpEnabled,
      },
    };
  }
}
