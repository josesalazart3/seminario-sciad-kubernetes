// Utilidades de fecha/hora.
//
// Desde la Fase 4 el backend guarda `fecha` (DateOnly) y `hora` (TimeOnly) de los registros de acceso en
// **hora de Guatemala** (UTC-6 fijo, sin horario de verano), no en UTC. El "día" del servidor es, por tanto,
// el día de Guatemala (no cambia a las 18:00 locales). Estas funciones interpretan ese par con su
// desplazamiento real y lo muestran en la zona horaria del dispositivo (que en Guatemala es la misma).
// Los instantes verdaderos (p. ej. `timestamp` de un escaneo, `notificacion.fecha`) llegan en UTC con "Z"
// y se muestran con `new Date(iso)`.
const GT_OFFSET_HOURS = -6;
const GT_OFFSET_ISO = '-06:00';

const HORA_RE = /^(\d{2}):(\d{2})(?::(\d{2}))?/;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Convierte (fecha yyyy-mm-dd, hora HH:mm[:ss]) de Guatemala a un Date (instante). null si no es válido. */
export function toDate(fecha: string | null | undefined, hora: string | null | undefined): Date | null {
  if (!fecha || !hora) return null;
  const m = HORA_RE.exec(hora);
  if (!m || !/^\d{4}-\d{2}-\d{2}/.test(fecha)) return null;
  const d = new Date(`${fecha.slice(0, 10)}T${m[1]}:${m[2]}:${m[3] ?? '00'}${GT_OFFSET_ISO}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 'HH:mm' en la hora del dispositivo. Si no se puede convertir, devuelve los primeros 5 caracteres de `hora`. */
export function horaLocal(fecha: string | null | undefined, hora: string | null | undefined): string {
  const d = toDate(fecha, hora);
  if (!d) return (hora ?? '').slice(0, 5);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 'yyyy-mm-dd' en la fecha del dispositivo. Si no se puede convertir, devuelve `fecha` tal cual. */
export function fechaLocal(fecha: string | null | undefined, hora: string | null | undefined): string {
  const d = toDate(fecha, hora);
  if (!d) return fecha ?? '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Fecha de "hoy" según el servidor (día de Guatemala), 'yyyy-mm-dd'. */
export function hoyServidor(now: Date = new Date()): string {
  return new Date(now.getTime() + GT_OFFSET_HOURS * 3_600_000).toISOString().slice(0, 10);
}
