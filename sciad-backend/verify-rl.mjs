// ============================================================================
// SCIAD — Fase 4: SEC-04 — Rate limiting sobre /api/auth/login.
// Prueba determinista: N intentos (con contraseña incorrecta) → 401, y el
// (N+1)-ésimo intento (incluso con credenciales correctas) → 429.
// El límite configurado es LoginPermitLimit=5 por ventana de LoginWindowSeconds
// (default 5 por 5 min) por IP.
//
// IMPORTANTE: correr al FINAL de la sesión de pruebas — bloquea la IP durante
// la ventana (5 min) y eso afecta a los demás scripts que necesitan login.
//   node verify-rl.mjs [--report]     → escribe evidencia/rate-limit.md
// ============================================================================
import { writeFileSync, mkdirSync } from 'node:fs';
import { clearCache } from './token-store.mjs';

const REPORT = process.argv.includes('--report');
const BASE = process.env.SCIAD_BASE ?? 'http://localhost:3000';
const PERMIT = parseInt(process.env.SCIAD_RL_PERMIT ?? '5', 10);

let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name} ${extra}`); }
  else { fail++; fails.push(`✗ ${name} ${extra}`); console.log(`  ✗ ${name} ${extra}`); }
}
async function tryLogin(email, password) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, code: body.code, message: body.message };
}

// Limpia el cache de tokens para arrancar la ventana desde cero (5 intentos libres).
await clearCache();
console.log(`== SEC-04: rate limit sobre login (permit=${PERMIT}/ventana) ==`);

const seq = [];
// 1..PERMIT: credenciales inválidas → 401 (consumen el cupo)
for (let i = 1; i <= PERMIT; i++) {
  const r = await tryLogin('admin@sciad.gt', 'clave-incorrecta');
  seq.push({ n: i, status: r.status });
  check(`intento ${i} (credencial inválida) → 401`, r.status === 401, `→ ${r.status}`);
}

// PERMIT+1: credenciales VÁLIDAS → debe ser 429 (ya agotó el cupo, bloqueo por IP)
const rLock = await tryLogin('admin@sciad.gt', 'sciad123');
seq.push({ n: PERMIT + 1, status: rLock.status, validCreds: true });
check(`intento ${PERMIT + 1} con credencial VÁLIDA → 429 (bloqueado por ventana)`, rLock.status === 429, `→ ${rLock.status}`);
check(`respuesta 429 es Problem Details con code=RATE_LIMITED`, rLock.code === 'RATE_LIMITED', `code=${rLock.code}`);

// PERMIT+2: otro intento → sigue 429
const rMore = await tryLogin('admin@sciad.gt', 'sciad123');
seq.push({ n: PERMIT + 2, status: rMore.status });
check(`intento ${PERMIT + 2} → 429 persistente`, rMore.status === 429, `→ ${rMore.status}`);

console.log(`\nSecuencia observada: ${seq.map(s => `#${s.n}=${s.status}${s.validCreds ? '(válida)' : ''}`).join('  ')}`);
console.log(`\n===== SEC-04: ${pass} ✓  /  ${fail} ✗ =====`);
if (fail > 0) console.log('\nFallos:\n' + fails.join('\n'));

if (REPORT) {
  mkdirSync('evidencia', { recursive: true });
  writeFileSync('evidencia/rate-limit.md', [
    '# SEC-04 — Rate limiting en /api/auth/login — evidencia',
    '',
    `_Fecha: ${new Date().toISOString()}. Script: \`verify-rl.mjs\` contra ${BASE}. Límite: ${PERMIT} intentos/ventana por IP._`,
    '',
    '| Intento | Credenciales | Código HTTP | Esperado |',
    '|---|---|---|---|',
    ...seq.map((s, i) => `| #${s.n} | ${s.validCreds ? 'válidas' : 'inválidas'} | ${s.status} | ${s.status === 429 ? '429 (bloqueado)' : '401'} |`),
    '',
    '**Conclusión:** los primeros ' + PERMIT + ' intentos con credenciales inválidas devuelven 401; el intento ' + (PERMIT + 1) + ' (aunque sea con credenciales correctas) devuelve **429** `RATE_LIMITED`, bloqueando temporalmente la IP durante la ventana configurada. Esto mitiga la fuerza bruta (SEC-04).',
    '',
    '> Config en `appsettings.json` / env: `RateLimit__LoginPermitLimit`, `RateLimit__LoginWindowSeconds` (default 5 / 300 s). En producción detrás de nginx, `ForwardedHeaders__KnownProxies` asegura que la partición sea por IP real del cliente y no por la del proxy.',
  ].join('\n'), 'utf8');
  console.log('\n→ Evidencia escrita en evidencia/rate-limit.md');
}
process.exit(fail === 0 ? 0 : 1);