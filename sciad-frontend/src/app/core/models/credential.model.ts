// Credenciales QR. Reconciliado al contrato real del backend (Fase 3).
// CredencialDto: { id, personaId, personaNombre, dpiCodigo, tokenCorto, qr, estado, emitido, motivo, reemitidoDe }
// estado: 'activa' | 'revocada' (nunca borrado físico). qr = sobre cifrado «SCIAD1.…» que va en el código QR
// (RNF-01); el token completo no sale del servidor, solo tokenCorto (8 caracteres) para mostrar.

export type CredencialEstado = 'activa' | 'revocada';

export interface Credencial {
  id: string;
  personaId: string;
  personaNombre: string;
  dpiCodigo: string;
  tokenCorto: string;
  qr: string;
  estado: CredencialEstado;
  emitido: string; // ISO (yyyy-mm-dd)
  motivo?: string | null; // motivo de revocación, si aplica
  reemitidoDe?: number | null; // id de la credencial anterior (trazabilidad)
}
