import { Injectable, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, _info: any, context: ExecutionContext) {
    if (err || !user) {
      throw err || new UnauthorizedException('Token inválido ou expirado');
    }

    // setupOnly tokens só podem acessar /auth/totp/* — bloqueados em qualquer outra rota
    if (user.setupOnly) {
      const req = context.switchToHttp().getRequest();
      const url: string = req.url || '';
      if (!url.includes('/auth/totp')) {
        throw new ForbiddenException(
          'Acesso restrito. Configure o 2FA antes de continuar.',
        );
      }
    }

    return user;
  }
}
