import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from '../../common/types/jwt-payload.type';
import { Request } from 'express';

type AuthenticatedRequest = Request & { user: JwtPayload };

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  },
);
