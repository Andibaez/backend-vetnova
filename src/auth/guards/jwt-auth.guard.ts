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
import { AUTH_COOKIE_NAME } from '../constants/auth-cookies.constant';

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

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: JwtPayload;
    }>();
    const token = this.extractCookie(
      request.headers.cookie ?? '',
      AUTH_COOKIE_NAME,
    );

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

  private extractCookie(cookieHeader: string, name: string): string | null {
    const cookies = cookieHeader.split(';').map((cookie) => cookie.trim());
    for (const cookie of cookies) {
      const [key, ...valueParts] = cookie.split('=');
      if (key === name) {
        return decodeURIComponent(valueParts.join('='));
      }
    }
    return null;
  }
}
