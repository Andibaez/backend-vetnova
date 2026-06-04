import type { RoleName } from '../constants/roles.constant';

export class JwtPayload {
  sub: number;
  name: string;
  email: string;
  role: RoleName;
  iat?: number;
  exp?: number;
}
