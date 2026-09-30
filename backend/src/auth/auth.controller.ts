import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Get,
  Headers,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyTotpDto, EnableTotpDto } from './dto/verify-totp.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(AuthGuard('local'))
  @Post('login')
  login(@Request() req: any) {
    return this.authService.login(req.user);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('verify-otp')
  verifyOtp(@Body() dto: VerifyTotpDto, @Headers('x-forwarded-for') ip: string) {
    return this.authService.verifyOtpAndLogin(dto.tempToken, dto.code, ip);
  }

  @UseGuards(JwtAuthGuard)
  @Get('totp/setup')
  setupTotp(@CurrentUser('id') userId: string) {
    return this.authService.generateTotpSecret(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('totp/enable')
  enableTotp(@CurrentUser('id') userId: string, @Body() dto: EnableTotpDto) {
    return this.authService.enableTotp(userId, dto.code);
  }

  @UseGuards(JwtAuthGuard)
  @Post('totp/disable')
  disableTotp(@CurrentUser('id') userId: string, @Body() dto: EnableTotpDto) {
    return this.authService.disableTotp(userId, dto.code);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@CurrentUser() user: any) {
    return { user };
  }

  @Public()
  @Post('refresh')
  refreshToken(@Body('refreshToken') token: string) {
    if (!token) return { error: 'Token não fornecido' };
    return this.authService.refreshToken(token);
  }
}
