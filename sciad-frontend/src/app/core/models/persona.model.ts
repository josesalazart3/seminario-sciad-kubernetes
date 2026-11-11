// Personas (colaboradores y visitantes). Reconciliado al contrato real del backend (Fase 3).
// PersonaDto: { id, nombre, dpiCodigo, tipo, estado }
// tipo: 1 = colaborador, 2 = visitante. estado: 'activo' | 'inactivo'.

export type TipoPersona = 1 | 2;

export const TIPO_PERSONA_LABELS: Record<number, string> = {
  1: 'Colaborador',
  2: 'Visitante',
};

export interface Persona {
  id: string;
  nombre: string;
  dpiCodigo: string;
  tipo: TipoPersona;
  estado: string; // 'activo' | 'inactivo'
}

/** Cuerpo de POST /api/personas y PUT /api/personas/{id}. */
export interface PersonaPayload {
  nombre: string;
  dpiCodigo: string;
  tipo: TipoPersona;
}
