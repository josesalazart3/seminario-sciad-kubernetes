// Reportes (CU-07). Reconciliado al contrato real del backend (Fase 3).
// ReporteDto: { id, periodo, totalRegistros, generado, generadoPor }
export interface Reporte {
  id: string;
  periodo: string; // ej. "2026-08-01 a 2026-08-31"
  totalRegistros: number;
  generado: string; // yyyy-mm-dd
  generadoPor: string;
}