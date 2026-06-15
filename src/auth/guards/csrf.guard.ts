import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { CSRF_COOKIE } from '../auth-cookies.util';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ method: string; cookies?: Record<string, string>; headers: Record<string, string> }>();

    if (!MUTATING_METHODS.has(request.method)) return true;

    const cookieToken = request.cookies?.[CSRF_COOKIE];
    const headerToken = request.headers['x-csrf-token'];

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      throw new ForbiddenException('Token CSRF inválido o ausente.');
    }

    return true;
  }
}
