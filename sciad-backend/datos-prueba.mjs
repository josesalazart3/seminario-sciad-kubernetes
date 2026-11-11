// ============================================================================
// SCIAD — Fase 8: datos de prueba que cumplen las validaciones de persona.
//   - DPI: 13 dígitos, no todos iguales, departamento (dígitos 10–11) entre 01 y 22.
//   - Nombre: solo letras, espacios, apóstrofo, punto y guion (sin dígitos).
// Uso: import { dpiPrueba, nombrePrueba } from './datos-prueba.mjs';
// ============================================================================
import { randomInt } from 'node:crypto';

/** DPI válido y prácticamente único: 9 dígitos aleatorios + departamento 01–22 + municipio 01. */
export function dpiPrueba() {
  for (;;) {
    const base = String(randomInt(100_000_000, 1_000_000_000));
    const depto = String(randomInt(1, 23)).padStart(2, '0');
    const dpi = `${base}${depto}01`;
    if (new Set(dpi).size > 1) return dpi;
  }
}

/** Convierte un texto con dígitos/símbolos (p. ej. "P2C-A-1739") en un nombre válido ("PCC-A-BHDJ"). */
export function nombrePrueba(texto) {
  return String(texto)
    .replace(/\d/g, (d) => 'ABCDEFGHIJ'[Number(d)])
    .replace(/[^\p{L}\p{M}' .\-]/gu, '-');
}
