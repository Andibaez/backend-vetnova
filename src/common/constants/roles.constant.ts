export const ROLES = {
  ADMIN: 'Administrador',
  VETERINARIO: 'Veterinario',
  RECEPCIONISTA: 'Recepcionista',
  CLIENTE: 'Cliente',
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];
export const ROLES_ARRAY = Object.values(ROLES) as RoleName[];
