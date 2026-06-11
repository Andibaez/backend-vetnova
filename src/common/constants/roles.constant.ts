export const ROLES = {
  SUPER_ADMIN: 'SuperAdministrador',
  ADMIN: 'Administrador',
  VETERINARIO: 'Veterinario',
  CLIENTE: 'Cliente',
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];
export const ROLES_ARRAY = Object.values(ROLES) as RoleName[];
