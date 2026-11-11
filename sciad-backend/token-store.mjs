// ============================================================================
// SCIAD — Fase 4: almacén compartido de tokens de sesión demo.
// Evita quemar el rate-limit de login (5/5 min, SEC-04) re-autenticando en cada
// script de verificación: los tokens JWT duran 8h, así que se cachean en disco
// (evidencia/.tokens.json, autoborrado a la salida o al expirar).
// Uso: import { getToken } from './token-store.mjs';
//   await getToken('admin@sciad.gt', 'sciad123');  → token string
// ============================================================================
import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, 'evidencia', '.tokens.json');
const BASE = process.env.SCIAD_BASE ?? 'http://localhost:3000';

let cache = {};
try { cache = JSON.parse(readFileSync(CACHE, 'utf8')); } catch { /* primero uso */ }

/** Devuelve el token del usuario demo, rehusando el cache si aún no expiró. */
export async function getToken(email, password = 'sciad123') {
  const now = Date.now();
  const hit = cache[email];
  if (hit && hit.exp > now + 60_000) return hit.token; // margen 1 min

  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await r.json().catch(() => ({}));
  if (r.status === 429) {
    throw new Error(`Login rate-limited (429) para ${email}. Espera a que expire la ventana de 5 min o usa una ventana limpia. (SEC-04 en acción.)`);
  }
  if (!body?.token) throw new Error(`Login OK status=${r.status} sin token para ${email}: ${JSON.stringify(body)}`);
  cache[email] = { token: body.token, exp: now + 7.5 * 3600_000 }; // 8h de vida del JWT
  mkdirSync(dirname(CACHE), { recursive: true });
  writeFileSync(CACHE, JSON.stringify(cache, null, 2), 'utf8');
  return body.token;
}

/** Limpia el cache (para hacer una prueba de rate-limit desde cero). */
export async function clearCache() {
  cache = {};
  try { rmSync(CACHE, { force: true }); } catch { /* noop */ }
}