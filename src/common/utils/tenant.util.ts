import { ROLES } from '../constants/roles.constant';
import { JwtPayload } from '../types/jwt-payload.type';

/**
 * Construye el filtro `where` por clínica para aislar datos entre tenants.
 * El SuperAdministrador no tiene clínica asignada y puede ver todo.
 */
export function tenantWhere(user: JwtPayload): { id_clinica?: number } {
  if (user.role === ROLES.SUPER_ADMIN) return {};
  return { id_clinica: user.clinicaId ?? -1 };
}
