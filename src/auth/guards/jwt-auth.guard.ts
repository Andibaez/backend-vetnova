import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtPayload } from '../../common/types/jwt-payload.type';
import { AUTH_COOKIE } from '../auth-cookies.util';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; cookies?: Record<string, string>; user?: JwtPayload }>();
    const auth = request.headers['authorization'];

    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : request.cookies?.[AUTH_COOKIE];

    if (!token) {
      throw new UnauthorizedException('Token de autenticación requerido.');
    }

    try {
      const payload = this.jwt.verify<JwtPayload & { type?: string }>(token);
      if (payload.type === 'reset') {
        throw new UnauthorizedException('Token inválido o expirado.');
      }
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Token inválido o expirado.');
    }
  }
}
