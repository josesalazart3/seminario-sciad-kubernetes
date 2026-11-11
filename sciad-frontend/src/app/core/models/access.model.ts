// Zonas de acceso y perfiles de acceso (asignación persona+zona+vigencia).
// Reconciliado al contrato real del backend (Fase 3):
//  - ZonaDto: { id, nombre, nivelSeguridad, capacidad, nivelRiesgo, estado }
//  - PerfilAccesoDto: { id, personaId, personaNombre, zonaId, zonaNombre, vigenciaInicio, vigenciaFin }

export interface Zona {
  id: string;
  nombre: string;
  nivelSeguridad: string; // ALTO / MEDIO / BAJO
  capacidad: number | null; // aforo máximo simultáneo (nullable)
  nivelRiesgo: string; // CRITICO / ALTO / MEDIO / BAJO
  estado: string; // 'activo' | 'inactivo'
}

/** Perfil de acceso = asignación de una persona a una zona con vigencia (CU-03). */
export interface PerfilAcceso {
  id: string;
  personaId: string;
  personaNombre: string;
  zonaId: string;
  zonaNombre: string;
  vigenciaInicio: string; // ISO (yyyy-mm-dd)
  vigenciaFin: string; // ISO (yyyy-mm-dd)
}
