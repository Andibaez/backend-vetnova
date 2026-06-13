import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'crypto';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '../constants/auth-cookies.constant';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<{
      method?: string;
      headers: Record<string, string | string[] | undefined>;
    }>();

    if (isPublic || SAFE_METHODS.has(request.method ?? 'GET')) return true;

    this.assertAllowedOrigin(request.headers.origin);

    const csrfCookie = this.extractCookie(String(request.headers.cookie ?? ''), CSRF_COOKIE_NAME);
    const csrfHeader = this.headerValue(request.headers[CSRF_HEADER_NAME]);

    if (!csrfCookie || !csrfHeader || !this.safeEquals(csrfCookie, csrfHeader)) {
      throw new ForbiddenException('Token CSRF inválido o ausente.');
    }

    return true;
  }

  private assertAllowedOrigin(origin?: string | string[]) {
    const value = this.headerValue(origin);
    if (!value) return;

    const allowed = (this.config.get<string>('ALLOWED_ORIGINS') ?? 'http://localhost:3001')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    if (!allowed.includes(value)) {
      throw new ForbiddenException('Origen no permitido.');
    }
  }

  private extractCookie(cookieHeader: string, name: string): string | null {
    const cookies = cookieHeader.split(';').map((cookie) => cookie.trim());
    for (const cookie of cookies) {
      const [key, ...valueParts] = cookie.split('=');
      if (key === name) return decodeURIComponent(valueParts.join('='));
    }
    return null;
  }

  private headerValue(value?: string | string[]) {
    return Array.isArray(value) ? value[0] : value;
  }

  private safeEquals(left: string, right: string) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }
}
