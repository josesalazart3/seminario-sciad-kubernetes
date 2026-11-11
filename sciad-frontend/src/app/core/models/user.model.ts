// Entidades del modelo Entidad-Relación de referencia (DERCAS/PG2).
// Solo se agregan campos de UI cuando son estrictamente necesarios
// (ej. avatar) y se deja constancia en la bitácora.

export type Rol = 'ADMIN' | 'SEGURIDAD' | 'GERENCIA';

export const ROL_LABELS: Record<Rol, string> = {
  ADMIN: 'Administrador',
  SEGURIDAD: 'Personal de Seguridad',
  GERENCIA: 'Gerencia / Auditoría',
};

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  puesto: string;
  activo: boolean;
  avatarInitials: string; // UI — iniciales para avatar (derivado de nombre)
  fechaCreacion: string; // ISO
}

export interface CredencialesLogin {
  email: string;
  password: string;
}
