// ============================================================================
// SCIAD — Fase 4 (Seguridad): SEC-05 Matriz RBAC completa, SEC-02 Inyección SQL,
//                            SEC-03 XSS (reflejo), SEC-07 sanity de cabeceras.
// Uso: node verify-seguridad.mjs          (matriz + payloads contra localhost:3000)
//      node verify-seguridad.mjs --report  (además escribe evidencia/matriz-rbac.md)
// Exit: 0 si todo pasa; 1 si hay algún fallo.
//
// SEC-04 (rate limiting) NO se prueba aquí a propósito: bloquearía la IP durante
// 5 min y rompería el orden de las demás pruebas. Se verifica en verify-rl.mjs
// (correr al final de la sesión de pruebas).
// ============================================================================
import { writeFileSync, mkdirSync } from 'node:fs';
import { getToken } from './token-store.mjs';

const REPORT = process.argv.includes('--report');
const BASE = process.env.SCIAD_BASE ?? 'http://localhost:3000';
const PASSWORD = 'sciad123';
const H = { 'Content-Type': 'application/json' };
const R = Date.now().toString().slice(-8);

let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name} ${extra}`); }
  else { fail++; fails.push(`✗ ${name} ${extra}`); console.log(`  ✗ ${name} ${extra}`); }
}

async function call(method, path, opts = {}) {
  const headers = { ...H, ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) };
  const t0 = Date.now();
  const hasBody = opts.body !== undefined && opts.body !== null && !['GET', 'HEAD'].includes(method);
  const r = await fetch(`${BASE}${path}`, {
    method, headers,
    body: hasBody ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal ?? undefined,
  });
  const ms = Date.now() - t0;
  const ct = r.headers.get('content-type') ?? '';
  let json = null;
  if (ct.includes('application/json')) { try { json = await r.json(); } catch { /* vacío */ } }
  return { status: r.status, body: json, ms, raw: JSON.stringify(json ?? '') };
}

// ---------- Sesiones de los 3 roles (reusa cache para no quemar rate-limit) ----------
console.log('== Sesiones demo (3 roles) ==');
const ADMIN = await getToken('admin@sciad.gt', PASSWORD);
const SEG   = await getToken('seguridad@sciad.gt', PASSWORD);
const GER   = await getToken('gerencia@sciad.gt', PASSWORD);
console.log(`  Sesiones OK (admin / seguridad / gerencia), sufijo=${R}\n`);

// ============================================================================
// SEC-05 — Matriz completa endpoint × rol (+ anónimo)
// Semántica: para un rol permitido la petición DEBE pasar autorización (status
// distinto de 401/403; puede ser 200/201/400/404/409). Para un rol denegado DEBE
// ser 403. Anónimo sobre un endpoint protegido DEBE ser 401. Nunca se muta
// estado: los id's de PUT/PATCH/DELETE son inexistentes (999999999) y los cuerpos
// de creación son inválidos para que la autorización sea lo único que se evalúe.
// ============================================================================
console.log('== SEC-05: Matriz RBAC endpoint × rol ==');
// [método, ruta, cuerpo, rolesAutorizados, anonOK]
const MATRIZ = [
  ['GET',    '/api/auth/me',                        null, ['ADMIN', 'SEGURIDAD', 'GERENCIA'], false],
  ['GET',    '/api/auth/role-check',                null, ['ADMIN'], false],
  ['GET',    '/api/zonas-acceso',                   null, ['ADMIN', 'SEGURIDAD', 'GERENCIA'], false],
  ['POST',   '/api/zonas-acceso',                   {},   ['ADMIN'], false],
  ['PUT',    '/api/zonas-acceso/999999999',         { nombre: 'X', nivelSeguridad: 'ALTO' }, ['ADMIN'], false],
  ['PATCH',  '/api/zonas-acceso/999999999/estado',  { estado: 'inactivo' }, ['ADMIN'], false],
  ['GET',    '/api/personas',                       null, ['ADMIN'], false],
  ['POST',   '/api/personas',                       {},   ['ADMIN'], false],
  ['PUT',    '/api/personas/999999999',             {},   ['ADMIN'], false],
  ['PATCH',  '/api/personas/999999999/estado',      {},   ['ADMIN'], false],
  ['GET',    '/api/perfiles-acceso',                null, ['ADMIN'], false],
  ['POST',   '/api/perfiles-acceso',                {},   ['ADMIN'], false],
  ['DELETE', '/api/perfiles-acceso/999999999',      null, ['ADMIN'], false],
  ['GET',    '/api/credenciales',                   null, ['ADMIN'], false],
  ['POST',   '/api/credenciales/999999999/generar', null, ['ADMIN'], false],
  ['POST',   '/api/credenciales/999999999/reemitir',null, ['ADMIN'], false],
  ['POST',   '/api/credenciales/999999999/revocar', null, ['ADMIN'], false],
  ['GET',    '/api/usuarios',                       null, ['ADMIN'], false],
  ['POST',   '/api/usuarios',                       {},   ['ADMIN'], false],
  ['PUT',    '/api/usuarios/999999999',             {},   ['ADMIN'], false],
  ['PATCH',  '/api/usuarios/999999999/estado',      {},   ['ADMIN'], false],
  ['GET',    '/api/registros-acceso',               null, ['ADMIN', 'GERENCIA'], false],
  ['GET',    '/api/registros-acceso/hoy',           null, ['ADMIN', 'SEGURIDAD'], false],
  ['POST',   '/api/registros-acceso',               {},   ['ADMIN', 'SEGURIDAD'], false],
  ['GET',    '/api/notificaciones',                 null, ['ADMIN', 'GERENCIA'], false],
  ['PATCH',  '/api/notificaciones/999999999/leida', { leida: true }, ['ADMIN', 'GERENCIA'], false],
  ['GET',    '/api/auditoria',                      null, ['ADMIN', 'GERENCIA'], false],
  ['POST',   '/api/auditoria/verificar',            null, ['ADMIN'], false],
  ['PATCH',  '/api/auditoria/999999999/estado',     { estado: 'en_revision' }, ['ADMIN', 'GERENCIA'], false],
  ['GET',    '/api/reportes',                       null, ['ADMIN', 'GERENCIA'], false],
  ['POST',   '/api/reportes/generar',               { desde: '2026-09-01', hasta: '2026-09-08' }, ['ADMIN', 'GERENCIA'], false],
  ['GET',    '/api/health',                         null, ['ADMIN', 'SEGURIDAD', 'GERENCIA'], true],
];
const ROLES = ['ADMIN', 'SEGURIDAD', 'GERENCIA'];
const TOKENS = { ADMIN, SEGURIDAD: SEG, GERENCIA: GER };

const matrixRows = [];   // filas en markdown para el reporte
matrixRows.push('| Endpoint | Método | Anónimo | ADMIN | SEGURIDAD | GERENCIA | ¿Correcto? |');
matrixRows.push('|---|---|---|---|---|---|---|');

for (const [method, path, body, allowed, anonOk] of MATRIZ) {
  const labels = ['anon', ...ROLES];
  // Una sola llamada por (endpoint × estado) — se reutiliza para el check y la fila resumida.
  const res = {};
  for (const label of labels) {
    const token = label === 'anon' ? null : TOKENS[label];
    res[label] = (await call(method, path, token ? { token, body } : { body })).status;
  }
  for (const label of labels) {
    const expectOk = label === 'anon' ? anonOk : allowed.includes(label);
    const ok = label === 'anon'
      ? ((res.anon === 401 && !anonOk) || (anonOk && res.anon === 200))
      : (expectOk ? (res[label] !== 401 && res[label] !== 403) : res[label] === 403);
    const expectTag = label === 'anon' ? (anonOk ? '200' : '401') : (expectOk ? '≠401/403' : '403');
    check(`${method} ${path}  [${label}] → ${res[label]} (esperaba ${expectTag})`, ok);
  }
  const correcto = labels.every(a => {
    const expectOk = a === 'anon' ? anonOk : allowed.includes(a);
    return a === 'anon' ? ((res.anon === 401 && !anonOk) || (anonOk && res.anon === 200))
      : (expectOk ? (res[a] !== 401 && res[a] !== 403) : res[a] === 403);
  });
  matrixRows.push(`| \`${path}\` | ${method} | ${res.anon} | ${res.ADMIN} | ${res.SEGURIDAD} | ${res.GERENCIA} | ${correcto ? '✅' : '❌'} |`);
}

// ============================================================================
// SEC-02 — Inyección SQL sobre endpoints de búsqueda/filtro y login
// AFIRMACIONES: sin 5xx, sin mensajes de error de BD en el cuerpo, y las
// respuestas NO deben volverse lentas (>2 s) con payloads time-based.
// ============================================================================
console.log('\n== SEC-02: Inyección SQL (payloads típicos) ==');
const SQLI = [
  { method: 'GET', path: `/api/personas?estado=`, payload: `' OR '1'='1`, token: ADMIN, permitidos: [200, 400] },
  { method: 'GET', path: `/api/personas?tipo=`, payload: `1 OR 1=1`, token: ADMIN, permitidos: [200, 400] },
  { method: 'GET', path: `/api/registros-acceso?tipo=`, payload: `' OR '1'='1`, token: ADMIN, permitidos: [200, 400] },
  { method: 'GET', path: `/api/registros-acceso?zonaId=`, payload: `1 OR 1=1`, token: ADMIN, permitidos: [200, 400] },
  { method: 'GET', path: `/api/registros-acceso?personaId=`, payload: `1; SELECT 1`, token: ADMIN, permitidos: [200, 400] },
  { method: 'GET', path: `/api/auditoria?tipo=`, payload: `' UNION SELECT 1--`, token: ADMIN, permitidos: [200, 400] },
  { method: 'GET', path: `/api/auditoria?estado=`, payload: `' OR '1'='1' --`, token: ADMIN, permitidos: [200, 400] },
  { method: 'GET', path: `/api/auditoria?tipo=`, payload: `1) OR (1=1`, token: ADMIN, permitidos: [200, 400] },
  { method: 'GET', path: `/api/auditoria?tipo=`, payload: `' AND pg_sleep(5) IS NULL--`, token: ADMIN, permitidos: [200, 400], timeBomb: true },
  { method: 'POST', path: `/api/auth/login`, payload: null, body: { email: `admin@sciad.gt' --`, password: `x' OR '1'='1`, }, permitidos: [401, 400], timeBomb: true },
];
for (const t of SQLI) {
  const url = t.body ? t.path : `${t.path}${encodeURIComponent(t.payload)}`;
  for (let i = 0; i < 3; i++) { // hasta 3 reintentos por si el pool hizo consulta lenta
    const { status, body, ms, raw } = await call(t.method, url, t.body ? { token: t.token, body: t.body } : { token: t.token });
    const noTimeBomb = !t.timeBomb || ms < 2000;
    const no5xx = status < 500;
    const noSqlLeak = !/syntax error|Npgsql|PostgreSQL|SQLSTATE|exception/i.test(raw);
    const ok = t.permitidos.includes(status) && no5xx && noSqlLeak && noTimeBomb;
    check(`${t.method} ${url} → ${status} · ${ms}ms`, ok, ok ? '' : `(línea: ${raw.slice(0, 140)})`);
    if (ok) break;
    console.log(`    reintento ${i + 1}...`);
  }
}
// Confirmación positiva: el filtro sigue funcionando normalmente tras los ataques.
{
  const { status, body } = await call('GET', `/api/auditoria?tipo=acceso_sin_egreso`, { token: ADMIN });
  check('  filtro legítimo ?tipo=acceso_sin_egreso sigue operativo tras ataques', status === 200 && Array.isArray(body?.items));
}

// ============================================================================
// SEC-03 — XSS: el backend no refleja input sin escapar en respuesta JSON
// System.Text.Json escapa '<' como <, así que si se refleja literal hay fallo.
// ============================================================================
console.log('\n== SEC-03: XSS (reflejo en respuestas) ==');
const XSS_PAYLOADS = ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '"><svg/onload=alert(1)>'];
const xssTargets = [
  { method: 'GET', path: `/api/auditoria?tipo=`, token: ADMIN },
  { method: 'GET', path: `/api/registros-acceso?tipo=`, token: ADMIN },
  { method: 'GET', path: `/api/personas?estado=`, token: ADMIN },
  { method: 'POST', path: `/api/auth/login`, token: null, bodyEmail: true },
];
for (const { method, path, token, bodyEmail } of xssTargets) {
  for (const pl of XSS_PAYLOADS) {
    const url = bodyEmail ? path : `${path}${encodeURIComponent(pl)}`;
    const bodyOpts = bodyEmail ? { body: { email: pl, password: 'x' } } : {};
    const { status, raw } = await call(method, url, token ? { token, ...bodyOpts } : bodyOpts);
    // El literal sin escapar (p.ej. <img) NO debe aparecer; el escapado < sí es seguro.
    const literalInjected = pl.replace(/</g, '').replace(/>/g, '');
    const reflects = raw.includes(literalInjected + '>') || raw.includes('<' + literalInjected);
    const looksEscaped = /\\u003C|\\u003E/.test(raw);
    // Si el input se refleja, DEBE estar escapado. Si se refleja sin escapar → fallo.
    const ok = !reflects || looksEscaped;
    check(`${method} ${url.length > 70 ? url.slice(0, 70) + '…' : url} → ${status}`, ok, ok ? '' : `(sin escapar: ${raw.slice(0, 120)})`);
  }
}

// ============================================================================
// SEC-07 (sanity) — cabeceras de seguridad presentes en la API
// ============================================================================
console.log('\n== SEC-07 (sanity API): cabeceras de seguridad ==');
{
  const r = await fetch(`${BASE}/api/health`);
  const hdrs = r.headers;
  check('  responde con content-type JSON', (r.headers.get('content-type') ?? '').includes('application/json'));
  const hst = hdrs.get('strict-transport-security');
  console.log(`  (HSTS en la API: ${hst ?? 'no presente — se termina TLS/HSTS en el proxy nginx, ver DESPLIEGUE.md.md'})`);
}

// ---------- Cierre ----------
console.log(`\n===== SEC-05/SEC-02/SEC-03: ${pass} ✓  /  ${fail} ✗ =====`);
if (fail > 0) { console.log('\nFallos:\n' + fails.join('\n')); }

if (REPORT) {
  mkdirSync('evidencia', { recursive: true });
  const out = `# Matriz RBAC — evidencia automatizada (SEC-05)\n\n_Fecha: ${new Date().toISOString()}. Generada por \`verify-seguridad.mjs\` contra ${BASE}._\n\n### Matriz endpoint × rol (código de estado recibido)\n\n${matrixRows.join('\n')}\n\n> **Lectura:** 401 = sin autenticar; 403 = rol autenticado sin permiso; resto (200/201/400/404/409) = pasó autorización. Columna "Anónimo" además de 401 espera que /api/health sea público (200).\n`;
  writeFileSync('evidencia/matriz-rbac.md', out, 'utf8');
  console.log('\n→ Evidencia escrita en evidencia/matriz-rbac.md');
}
process.exit(fail === 0 ? 0 : 1);