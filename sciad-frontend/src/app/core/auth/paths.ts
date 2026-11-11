import { Rol } from '../models/user.model';

// Ruta de aterrizaje por rol (post-login y home).
export const ROLE_HOME: Record<Rol, string> = {
  ADMIN: '/admin/dashboard',
  SEGURIDAD: '/seguridad/escaneo',
  GERENCIA: '/gerencia/trazabilidad',
};

export function homeFor(rol: Rol | null): string {
  return rol ? ROLE_HOME[rol] : '/login';
}
