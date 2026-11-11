// Verificación real de la Fase 2C (CU-04 escaneo QR + CU-05 accesos del día) contra el contenedor.
// Uso: node verify-2c.mjs
// Cada corrida usa sufijos únicos (timestamp) en DPIs/nombres para poder repetirse sin chocar.
// Las notificaciones (token_revocado / fuera_horario) se confirman por separado con psql.
import { strict as assert } from 'node:assert';
import { dpiPrueba, nombrePrueba } from './datos-prueba.mjs';

const BASE = process.env.SCIAD_BASE ?? 'http://localhost:3000';
const H = { 'Content-Type': 'application/json' };

const R = Date.now().toString().slice(-8); // sufijo único por corrida
const hoyUtc = new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10); // día de Guatemala (UTC-6): el backend lo usa como "hoy" (Fase 4)
const fecha = (ms) => new Date(ms).toISOString().slice(0, 10);
const inicioVigencia = fecha(Date.now() - 1 * 86400000);
const finVigencia = fecha(Date.now() + 30 * 86400000);
const pasadoIni = '2020-01-01';
const pasadoFin = '2020-12-31';

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name} ${extra}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}

async function call(method, path, opts = {}) {
  const headers = { ...H, ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) };
  const r = await fetch(`${BASE}${path}`, {
    method, headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let json = null;
  try { json = await r.json(); } catch { /* vacío */ }
  return { status: r.status, body: json };
}

async function login(email, pass) {
  const { status, body } = await call('POST', '/api/auth/login', { body: { email, password: pass } });
  assert.ok(body?.token, `No se obtuvo token para ${email} (status ${status})`);
  return { token: body.token, usuarioId: body.user?.id, body };
}

const admin = await login('admin@sciad.gt', 'sciad123');
const seg = await login('seguridad@sciad.gt', 'sciad123');
const ger = await login('gerencia@sciad.gt', 'sciad123');
console.log('Tokens obtenidos (admin/seguridad/gerencia), sufijo corrida:', R, `hoy(UTC):${hoyUtc}\n`);
const A = admin.token, S = seg.token, G = ger.token;

// ---------- Setup base: persona + zona validada ----------
async function crearPersona(sufijo) {
  const r = await call('POST', '/api/personas', { token: A, body: { nombre: nombrePrueba(`P2C-${sufijo}-${R}`), dpiCodigo: dpiPrueba(), tipo: 1 } });
  assert.equal(r.status, 201, `Persona ${sufijo} no creada: ${r.status}`);
  return r.body;
}
async function crearZona() {
  const z = await call('POST', '/api/zonas-acceso', { token: A, body: { nombre: `Z2C-${R}`, nivelSeguridad: 'ALTO', nivelRiesgo: 'CRITICO', capacidad: 100 } });
  assert.equal(z.status, 201, `Zona no creada: ${z.status}`);
  return z.body;
}
async function asignarPerfil(personaId, zonaId, ini, fin) {
  const p = await call('POST', '/api/perfiles-acceso', { token: A, body: { personaId: +personaId, zonaId: +zonaId, vigenciaInicio: ini, vigenciaFin: fin } });
  assert.equal(p.status, 201, `Perfil no creado: ${p.status}`);
}
async function generarCredencial(personaId) {
  const c = await call('POST', `/api/credenciales/${personaId}/generar`, { token: A });
  assert.equal(c.status, 201, `Credencial no generada: ${c.status}`);
  return c.body; // { id, qr (sobre cifrado SCIAD1.…), tokenCorto, personaId, estado }
}
const zona = await crearZona();
const zonaId = +zona.id;
console.log(`Zona base (id=${zonaId}) creada.\n`);

console.log('== RBAC (CU-04 requiere SEGURIDAD o ADMIN; Gerencia → 403) ==');
{
  check('POST escaneo sin token -> 401', (await call('POST', '/api/registros-acceso', { body: { token: 'x', zonaId } })).status === 401);
  check('POST escaneo Gerencia -> 403', (await call('POST', '/api/registros-acceso', { token: G, body: { token: 'x', zonaId } })).status === 403);
  check('GET /hoy Gerencia -> 403', (await call('GET', '/api/registros-acceso/hoy', { token: G })).status === 403);
}

console.log('\n== CU-04: escaneo válido + inferencia de tipo (ingreso → egreso) + doble ingreso 409 ==');
let personaA, tokenA;
{
  personaA = await crearPersona('A');
  await asignarPerfil(personaA.id, zonaId, inicioVigencia, finVigencia);
  tokenA = (await generarCredencial(personaA.id)).qr;
  assert.ok(/^SCIAD1\.[A-Za-z0-9_-]{87}$/.test(tokenA), 'el QR no es un sobre SCIAD1.');

  const t0 = performance.now();
  const s1 = await call('POST', '/api/registros-acceso', { token: S, body: { token: tokenA, zonaId } });
  const ms = Math.round(performance.now() - t0);
  check('escaneo 1 (sin ingreso previo) -> 200 tipo=ingreso', s1.status === 200 && s1.body?.tipo === 'ingreso' && s1.body?.estado === 'autorizado');
  check('  response trae persona/zona/hora', s1.body?.personaId === +personaA.id && s1.body?.zonaId === zonaId && !!s1.body?.hora);
  check(`  latencia < 2000 ms (RNF-03)` + (ms < 2000 ? '' : ` — ¡${ms} ms!`), ms < 2000, `(${ms} ms)`);
  check('escaneo 2 (ingreso abierto) -> 200 tipo=egreso', (await call('POST', '/api/registros-acceso', { token: S, body: { token: tokenA, zonaId } })).body?.tipo === 'egreso');
  // Tras ingreso→egreso los conteos quedan iguales → el siguiente se infiere ingreso, pero el modelo
  // permite UN solo ingreso al día (uq_ingreso_diario, CA-05) → 409 determinista (sin carrera).
  const s3 = await call('POST', '/api/registros-acceso', { token: S, body: { token: tokenA, zonaId } });
  check('escaneo 3 (2.º ingreso del día) -> 409 (doble ingreso)', s3.status === 409 && s3.body?.code === 'CONFLICT');
}

console.log('\n== CU-04: ADMIN también puede escanear (policy SEGURIDAD o ADMIN) ==');
{
  const pg = await crearPersona('G');
  await asignarPerfil(pg.id, zonaId, inicioVigencia, finVigencia);
  const tokenG = (await generarCredencial(pg.id)).qr;
  const r = await call('POST', '/api/registros-acceso', { token: A, body: { token: tokenG, zonaId } });
  check('escaneo con ADMIN -> 200 tipo=ingreso', r.status === 200 && r.body?.tipo === 'ingreso');
}

console.log('\n== CU-04: QR que no es un sobre válido -> 400 TOKEN_INVALIDO ==');
{
  const r = await call('POST', '/api/registros-acceso', { token: S, body: { token: 'f'.repeat(64), zonaId } });
  check('QR antiguo de 64 hex -> 400 TOKEN_INVALIDO', r.status === 400 && r.body?.code === 'TOKEN_INVALIDO');
  const alterado = tokenA.slice(0, 30) + (tokenA[30] === 'A' ? 'B' : 'A') + tokenA.slice(31);
  const r2 = await call('POST', '/api/registros-acceso', { token: S, body: { token: alterado, zonaId } });
  check('sobre alterado -> 400 TOKEN_INVALIDO con el mismo mensaje', r2.status === 400 && r2.body?.code === 'TOKEN_INVALIDO' && r2.body?.detail === r.body?.detail);
}

console.log('\n== CU-04 + notificación: credencial revocada (suplantación) ==');
{
  const pb = await crearPersona('B');
  await asignarPerfil(pb.id, zonaId, inicioVigencia, finVigencia);
  const cb = await generarCredencial(pb.id);           // tokenB activo
  await call('POST', `/api/credenciales/${cb.id}/reemitir`, { token: A }); // revoca tokenB
  const r = await call('POST', '/api/registros-acceso', { token: S, body: { token: cb.qr, zonaId } });
  check('token revocado -> 400 CREDENCIAL_REVOCADA', r.status === 400 && r.body?.code === 'CREDENCIAL_REVOCADA');
  // genera notificación token_revocado (se confirma por psql al final)
}

console.log('\n== CU-04: persona inactiva ==');
{
  const pc = await crearPersona('C');
  const tokenC = (await generarCredencial(pc.id)).qr;
  await call('PATCH', `/api/personas/${pc.id}/estado`, { token: A, body: { estado: 'inactivo' } });
  const r = await call('POST', '/api/registros-acceso', { token: S, body: { token: tokenC, zonaId } });
  check('persona inactiva -> 400 PERSONA_INACTIVA', r.status === 400 && r.body?.code === 'PERSONA_INACTIVA');
}

console.log('\n== CU-04: sin perfil para la zona (zona no autorizada) ==');
{
  const pd = await crearPersona('D');
  const tokenD = (await generarCredencial(pd.id)).qr;
  const r = await call('POST', '/api/registros-acceso', { token: S, body: { token: tokenD, zonaId } });
  check('sin perfil -> 400 ZONA_NO_AUTORIZADA', r.status === 400 && r.body?.code === 'ZONA_NO_AUTORIZADA');
}

console.log('\n== CU-04 + notificación: perfil fuera de vigencia (fuera_horario) ==');
{
  const pe = await crearPersona('E');
  await asignarPerfil(pe.id, zonaId, pasadoIni, pasadoFin); // vigencia vencida (2020)
  const tokenE = (await generarCredencial(pe.id)).qr;
  const r = await call('POST', '/api/registros-acceso', { token: S, body: { token: tokenE, zonaId } });
  check('perfil vencido -> 400 FUERA_VIGENCIA', r.status === 400 && r.body?.code === 'FUERA_VIGENCIA');
  // genera notificación fuera_horario (se confirma por psql)
}

console.log('\n== Condición de carrera: N escaneos simultáneos de ingreso → 1 éxito, sin 500 ==');
let carreras = { total: 0, ok: 0, conflicto: 0, otro: {} };
{
  const pf = await crearPersona('F');
  await asignarPerfil(pf.id, zonaId, inicioVigencia, finVigencia);
  const tokenF = (await generarCredencial(pf.id)).qr;

  const N = 20;
  const reqs = Array.from({ length: N }, () => call('POST', '/api/registros-acceso', { token: S, body: { token: tokenF, zonaId } }));
  const resp = await Promise.all(reqs);
  for (const r of resp) {
    carreras.total++;
    if (r.status === 200) carreras.ok++;
    else if (r.status === 409) carreras.conflicto++;
    else carreras.otro[r.status] = (carreras.otro[r.status] || 0) + 1;
  }
  check('ningún 5xx (no crashea con 500)', Object.keys(carreras.otro).length === 0, JSON.stringify(carreras.otro));
  check('al menos un 200 (uno gana)', carreras.ok >= 1, `ok=${carreras.ok}`);
  check('al menos un 409 (carrera mapeada a conflicto)', carreras.conflicto >= 1, `409=${carreras.conflicto}`);
  console.log(`  resumen: total=${carreras.total}, 200=${carreras.ok}, 409=${carreras.conflicto}, otros=${JSON.stringify(carreras.otro)}`);
  console.log('  (se confirma por psql que se insertó ≤1 ingreso para persona F hoy — restricción UNIQUE uq_ingreso_diario)');
}

console.log('\n== CU-05: GET /api/registros-acceso/hoy ==');
{
  const r = await call('GET', '/api/registros-acceso/hoy', { token: S });
  check('GET /hoy -> 200 y array', r.status === 200 && Array.isArray(r.body));
  check('incluye a persona A con flag dentro booleano', r.body.some(x => x.personaId === +personaA.id && typeof x.dentro === 'boolean'));
  const fz = await call('GET', `/api/registros-acceso/hoy?zonaId=${zonaId}`, { token: S });
  check('GET /hoy?zonaId filtra por zona', fz.status === 200 && fz.body.every(x => x.zonaId === zonaId));
}

console.log(`\n===== RESULTADO: ${pass} ✓  /  ${fail} ✗ =====`);
console.log('Notificaciones generadas (token_revocado, fuera_horario) → confirma con psql.');
process.exit(fail === 0 ? 0 : 1);
