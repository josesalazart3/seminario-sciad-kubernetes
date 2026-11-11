// Registros de acceso (ingreso/egreso) y notificaciones. Reconciliado al contrato real (Fase 3).

// RegistroAccesoResultadoDto (respuesta de un escaneo autorizado).
export interface RegistroAccesoResultado {
  id: string;
  personaId: number;
  personaNombre: string;
  zonaId: number;
  zonaNombre: string;
  tipo: 'ingreso' | 'egreso';
  fecha: string; // yyyy-mm-dd
  hora: string; // HH:mm:ss
  estado: string; // 'autorizado'
  timestamp: string; // ISO
}

// AccesoDelDiaDto (fila de GET /registros-acceso/hoy).
export interface AccesoDelDia {
  personaId: number;
  personaNombre: string;
  zonaId: number;
  zonaNombre: string;
  ultimoTipo: 'ingreso' | 'egreso';
  ultimaHora: string; // HH:mm:ss
  dentro: boolean;
}

// RegistroHistorialDto (fila de GET /registros-acceso, historial paginado).
export interface RegistroHistorial {
  id: string;
  personaId: number;
  personaNombre: string;
  zonaId: number;
  zonaNombre: string;
  fecha: string; // yyyy-mm-dd
  hora: string; // HH:mm:ss
  tipo: 'ingreso' | 'egreso';
  registradoPor: string;
}

// NotificacionDto.
export interface Notificacion {
  id: string;
  usuarioId?: number | null;
  tipo: string; // 'concentracion' | 'token_revocado' | 'fuera_horario' | ...
  mensaje: string;
  fecha: string; // ISO timestamp
  leida: boolean;
  personaId?: number | null;
  personaNombre?: string | null;
}
