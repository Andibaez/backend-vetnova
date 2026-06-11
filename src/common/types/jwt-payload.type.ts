import type { RoleName } from '../constants/roles.constant';

export class JwtPayload {
  sub: number;
  name: string;
  email: string;
  role: RoleName;
  clinicaId: number | null;
  iat?: number;
  exp?: number;
}
