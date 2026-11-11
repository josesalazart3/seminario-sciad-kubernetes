// Verificación REAL del cierre diario de auditoría (opción A) contra el stack Docker.
//   node verify-cierre.mjs            (API en http://localhost:3000; compose en ../docker-compose.yml)
//
// Comprueba, con la BD real:
//   1) Un ingreso de AYER sin egreso se marca como hallazgo «acceso_sin_egreso» (verificación manual = misma lógica).
//   2) Repetir la verificación NO duplica el hallazgo.
//   3) El cierre AUTOMÁTICO (servicio en segundo plano) lo marca solo, sin que nadie pulse nada: se adelanta la hora del
//      cierre unos minutos (variable AUDITORIA_CIERRE_HORA), se recrea el backend, y se espera a que dispare. (~4 min)
//   4) Restaura la hora por defecto (00:05).
// Siembra los ingresos de ayer por psql (el API no permite fechas pasadas), igual que verify-2d.mjs.
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { dpiPrueba, nombrePrueba } from './datos-prueba.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.SCIAD_BASE ?? 'http://localhost:3000';
const PG = { ...process.env, PGPASSWORD: process.env.PGPASSWORD ?? 'sciad_local_dev_2026' };
const PSQL = (sql) => execSync(`docker exec sciad-db psql -U sciad -d sciad -v ON_ERROR_STOP=1 -c "${sql}"`, { env: PG, encoding: 'utf8' });
const COMPOSE = (args, env = {}) => execSync(`docker compose ${args}`, { cwd: `${HERE}/..`, env: { ...process.env, ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const gt = (extraMs = 0) => new Date(Date.now() - 6 * 3600e3 + extraMs);          // reloj de Guatemala (UTC-6) leído en UTC
const hm = (d) => `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
const ayer = new Date(Date.now() - 6 * 3600e3 - 86400e3).toISOString().slice(0, 10);

let pass = 0, fail = 0;
const check = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? '✓' : '✗ FALLO'} ${n}${x ? '  → ' + x : ''}`); };
async function call(method, path, { token, body } = {}) {
  const r = await fetch(`${BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch { /* sin cuerpo */ }
  return { status: r.status, body: j };
}
const items = (b) => (Array.isArray(b) ? b : b?.items ?? []);
async function esperarSalud(ms = 120000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const r = await fetch(`${BASE}/api/health`); if (r.ok) return true; } catch { /* aún no */ } await sleep(2000); } return false; }
async function hallazgos(token, nombre) { const r = await call('GET', '/api/auditoria?tipo=acceso_sin_egreso&tamanoPagina=100', { token }); return items(r.body).filter((h) => (h.descripcion ?? '').includes(nombrePrueba(nombre))); }

const R = Date.now().toString().slice(-8);
console.log(`\nCierre diario de auditoría → ${BASE}  (ayer en Guatemala = ${ayer})\n`);
const login = await call('POST', '/api/auth/login', { body: { email: 'admin@sciad.gt', password: 'sciad123' } });
if (!login.body?.token) { console.error('✗ No se pudo iniciar sesión como admin.'); process.exit(1); }
const T = login.body.token, adminId = login.body.user.id;
const zona = items((await call('GET', '/api/zonas-acceso', { token: T })).body).find((z) => z.estado === 'activo');
if (!zona) { console.error('✗ No hay ninguna zona activa (ejecuta seed-demo.mjs).'); process.exit(1); }
const crear = async (k) => (await call('POST', '/api/personas', { token: T, body: { nombre: nombrePrueba(`ZZ CIERRE ${k} ${R}`), dpiCodigo: dpiPrueba(), tipo: 1 } })).body;
const A = await crear('A'), B = await crear('B');
const sembrar = (p) => PSQL(`INSERT INTO registros_acceso (persona_id, zona_id, fecha, hora, tipo, usuario_id) VALUES (${p.id}, ${zona.id}, '${ayer}', '08:00:00', 'ingreso', ${adminId});`);

console.log('[1] Verificación manual (misma lógica que el cierre automático)');
check('se sembró el ingreso de ayer de la persona A', /INSERT 0 1/.test(sembrar(A)));
const v1 = await call('POST', '/api/auditoria/verificar', { token: T });
check('POST /auditoria/verificar → 200', v1.status === 200, JSON.stringify(v1.body));
let hA = await hallazgos(T, `ZZ CIERRE A ${R}`);
check('el ingreso de ayer sin egreso queda marcado «acceso_sin_egreso» (abierto)', hA.length === 1 && hA[0].estado === 'abierto', `${hA.length} hallazgo(s)`);
check('la descripción menciona el día del ingreso', hA[0]?.descripcion.includes(ayer));

console.log('\n[2] Sin duplicados');
await call('POST', '/api/auditoria/verificar', { token: T });
await call('POST', '/api/auditoria/verificar', { token: T });
hA = await hallazgos(T, `ZZ CIERRE A ${R}`);
check('tras 2 verificaciones más, sigue habiendo UN solo hallazgo para A', hA.length === 1, `${hA.length}`);

console.log('\n[3] Cierre AUTOMÁTICO (servicio en segundo plano)');
const objetivo = gt(150000);                                  // dentro de ~2,5 min en hora de Guatemala
const horaCierre = hm(objetivo);
console.log(`  adelanto el cierre a las ${horaCierre} (Guatemala) y recreo el backend…`);
COMPOSE('up -d backend', { AUDITORIA_CIERRE_HORA: horaCierre });
check('el backend vuelve a estar sano', await esperarSalud());
const logs0 = execSync('docker logs sciad-backend 2>&1', { encoding: 'utf8', maxBuffer: 20e6 });
check('el log anuncia el cierre diario programado a esa hora', logs0.includes('Cierre diario de auditoría programado') && logs0.includes(horaCierre), (logs0.match(/Cierre diario de auditoría programado[^\n]*/) ?? [''])[0].slice(0, 120));
check('se sembró el ingreso de ayer de la persona B (DESPUÉS de reiniciar)', /INSERT 0 1/.test(sembrar(B)));
check('antes de la hora, B todavía NO está marcada', (await hallazgos(T, `ZZ CIERRE B ${R}`)).length === 0);
// ⚠ el login del script ya no sirve si el backend se recreó con otra clave JWT: se vuelve a iniciar sesión
const T2 = (await call('POST', '/api/auth/login', { body: { email: 'admin@sciad.gt', password: 'sciad123' } })).body?.token ?? T;
console.log('  esperando a que dispare el cierre (máx. 5 min)…');
let hB = [], t0 = Date.now();
while (Date.now() - t0 < 300000) { hB = await hallazgos(T2, `ZZ CIERRE B ${R}`); if (hB.length) break; await sleep(5000); }
check('el cierre automático marcó a B SIN que nadie pulsara «Verificar»', hB.length === 1 && hB[0].estado === 'abierto', `${hB.length} hallazgo(s) tras ${Math.round((Date.now() - t0) / 1000)} s`);
const logs1 = execSync('docker logs sciad-backend 2>&1', { encoding: 'utf8', maxBuffer: 20e6 });
// El backend usa Serilog con JsonFormatter (Program.cs): el MessageTemplate queda sin interpolar
// ("...{Hallazgos} hallazgo(s)...") y el valor real va en Properties ("Hallazgos":N). Se verifican ambos por separado.
check('el log registra la ejecución del cierre diario', logs1.includes('Cierre diario de auditoría: {Hallazgos} hallazgo') && /"Hallazgos":\d+/.test(logs1), (logs1.match(/"Hallazgos":\d+,"Detalle":"[^"]*"/) ?? [''])[0].slice(0, 120));
check('A no se duplicó con el cierre automático', (await hallazgos(T2, `ZZ CIERRE A ${R}`)).length === 1);

console.log('\n[4] Restauración');
COMPOSE('up -d backend', {});
check('backend recreado con la hora por defecto', await esperarSalud());
const logs2 = execSync('docker logs sciad-backend --tail 200 2>&1', { encoding: 'utf8', maxBuffer: 20e6 });
// Mismo motivo que arriba: con Serilog/JsonFormatter la hora va en Properties, no interpolada en el texto.
check('el log anuncia el cierre a las 00:05', logs2.includes('Cierre diario de auditoría programado') && logs2.includes('00:05'));
const T3 = (await call('POST', '/api/auth/login', { body: { email: 'admin@sciad.gt', password: 'sciad123' } })).body?.token;
for (const p of [A, B]) await call('PATCH', `/api/personas/${p.id}/estado`, { token: T3, body: { estado: 'inactivo' } });

console.log(`\nRESULTADO: ${pass} ✓  ${fail} ✗`);
console.log('Nota: los hallazgos «ZZ CIERRE …» quedan abiertos en Auditoría; márcalos «resuelto» o reinicia la BD de pruebas.');
process.exit(fail ? 1 : 0);
