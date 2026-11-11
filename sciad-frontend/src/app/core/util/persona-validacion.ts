// Reglas de datos de una persona (Fase 8). Copia de ValidacionPersona.cs del backend, que es la fuente de verdad:
// aquí solo sirven para dar mensajes inmediatos en el formulario.
import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export const DPI_LONGITUD = 13;
const NOMBRE_RE = /^(?=.*\p{L})[\p{L}\p{M}' .\-]+$/u;
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y']);

/** Recorta y colapsa espacios repetidos. */
export function normalizarNombre(nombre: string | null | undefined): string {
  return (nombre ?? '').trim().replace(/\s+/g, ' ');
}

/** "maría  JOSÉ de la cruz" → "María José de la Cruz" (solo en la interfaz; el backend no cambia mayúsculas). */
export function nombreTitleCase(nombre: string | null | undefined): string {
  return normalizarNombre(nombre)
    .toLocaleLowerCase('es')
    .split(' ')
    .map((palabra, i) =>
      i > 0 && PARTICULAS.has(palabra)
        ? palabra
        : palabra.replace(/(^|[-'])(\p{L})/gu, (_m, sep: string, letra: string) => sep + letra.toLocaleUpperCase('es')),
    )
    .join(' ');
}

/** Mensaje de error del DPI o null si es válido (13 dígitos, no todos iguales, departamento 01–22). */
export function errorDpi(dpi: string | null | undefined): string | null {
  const v = (dpi ?? '').replace(/[\s-]/g, '');
  if (!v) return 'El DPI es obligatorio.';
  if (!/^[0-9]{13}$/.test(v)) return `El DPI debe tener exactamente ${DPI_LONGITUD} dígitos numéricos.`;
  if (new Set(v).size === 1) return 'El DPI no puede tener todos los dígitos iguales.';
  const depto = Number(v.slice(9, 11));
  if (depto < 1 || depto > 22) return 'El DPI no es válido: el código de departamento (dígitos 10 y 11) debe estar entre 01 y 22.';
  return null;
}

/** Mensaje de error del nombre o null si es válido (3–120 caracteres; letras, espacios, apóstrofo, punto y guion). */
export function errorNombre(nombre: string | null | undefined): string | null {
  const v = normalizarNombre(nombre);
  if (!v) return 'El nombre es obligatorio.';
  if (/\d/.test(v)) return 'El nombre no puede contener números.';
  if (v.length < 3 || v.length > 120) return 'El nombre debe tener entre 3 y 120 caracteres.';
  if (!NOMBRE_RE.test(v)) return 'El nombre solo puede contener letras, espacios, apóstrofo, punto y guion.';
  return null;
}

function validador(fn: (v: string) => string | null, clave: string): ValidatorFn {
  return (c: AbstractControl): ValidationErrors | null => {
    const msg = fn(c.value);
    return msg ? { [clave]: msg } : null;
  };
}

export const dpiValidator = validador(errorDpi, 'dpi');
export const nombreValidator = validador(errorNombre, 'nombre');
