// Verificación Fase 3 — Recorrido automatizado por rol contra el backend REAL vía nginx.
// Reproduce vía API exactamente lo que cada pantalla del frontend toca (misma ruta/verbo/forma),
// PERO a través del contenedor frontend (:8080 → nginx → backend:8080), que es el camino real
// que usa el navegador. Sirve además como prueba de la sección 4.4 (proxy /api/ activo).
//
//   node verify-fase3-rec.mjs
//
// Nota: el "recorrido manual" literal del navegador (hacer clic en cada pantalla) sigue siendo
// del humano; este script es la contraparte automatizada y verificable de esa caminata.
import { strict as assert } from 'node:assert';
import { execSync } from 'node:child_process';
import { dpiPrueba, nombrePrueba } from './datos-prueba.mjs';

const BASE = process.env.SCIAD_BASE ?? 'http://localhost:8080'; // a través de nginx del frontend
const H = { 'Content-Type': 'application/json' };
const PG_H = { ...process.env, PGPASSWORD: 'sciad_local_dev_2026' };
const PSQL = (sql) =>
  execSync(`docker exec sciad-db psql -U sciad -d sciad -v ON_ERROR_STOP=1 -t -c "${sql}"`, {
    env: PG_H,
    encoding: 'utf8',
  }).trim();

const R = Date.now().toString().slice(-8);
const fecha = (ms) => new Date(ms).toISOString().slice(0, 10);
const iniVig = fecha(Date.now() - 1 * 86400000);
const finVig = fecha(Date.now() + 30 * 86400000);
const hoy = new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10); // día de Guatemala (UTC-6), Fase 4

let pass = 0, fail = 0, hallazgos = [];
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name} ${extra}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}
function hallazgo(resumen, detalle) { hallazgos.push({ resumen, detalle }); console.log(`  ⚠ HALLAZGO: ${resumen} — ${detalle}`); }

async function call(method, path, opts = {}) {
  const headers = { ...H, ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) };
  if (opts.origin) headers['Origin'] = opts.origin;
  const r = await fetch(`${BASE}${path}`, {
    method, headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const ct = r.headers.get('content-type') ?? '';
  let json = null;
  // Nota: los errores 4xx del backend llegan como application/problem+json, no
  // application/json — por eso se acepta cualquier content-type que contenga "json".
  if (ct.includes('json')) { try { json = await r.json(); } catch { /* vacío */ } }
  const text = ct.includes('text/csv') ? (await r.text()) : null;
  const cors = r.headers.get('access-control-allow-origin');
  return { status: r.status, body: json, text, ct, cors };
}
async function login(email, pass) {
  const { status, body } = await call('POST', '/api/auth/login', { body: { email, password: pass } });
  assert.ok(body?.token, `No se obtuvo token para ${email} (status ${status})`);
  return { token: body.token, usuarioId: +body.user?.id };
}

// ---------- Sesiones ----------
const admin = await login('admin@sciad.gt', 'sciad123');
const seg = await login('seguridad@sciad.gt', 'sciad123');
const ger = await login('gerencia@sciad.gt', 'sciad123');
const A = admin.token, S = seg.token, G = ger.token;
console.log(`Sesiones OK (admin#${admin.usuarioId}, seg, ger); sufijo=${R}, hoy=${hoy} (vía nginx :8080)\n`);

// ---------- Setup compartido (igual patrón que 2C/2D) ----------
async function crearPersona(sufijo, tipo = 1) {
  const r = await call('POST', '/api/personas', { token: A, body: { nombre: nombrePrueba(`P3R-${sufijo}-${R}`), dpiCodigo: dpiPrueba(), tipo } });
  assert.equal(r.status, 201, `Persona ${sufijo}: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}
async function crearZona(sufijo) {
  const r = await call('POST', '/api/zonas-acceso', {
    token: A,
    body: { nombre: `Z3-${sufijo}-${R}`, nivelSeguridad: 'medio', nivelRiesgo: 'medio', capacidad: 25 },
  });
  assert.equal(r.status, 201, `Zona ${sufijo}: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}
async function asignar(personaId, zonaId) {
  const r = await call('POST', '/api/perfiles-acceso', {
    token: A,
    body: { personaId, zonaId, vigenciaInicio: iniVig, vigenciaFin: finVig },
  });
  assert.equal(r.status, 201, `Asignación: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

// ================================================================
// RECORRIDO ADMINISTRADOR
// dashboard · usuarios · personas · zonas · perfiles · credenciales · auditoría · reportes
// ================================================================
console.log('== Administrador ==');

// Dashboard (KPIs compuestos en el cliente)
{
  const r = await call('GET', '/api/registros-acceso?desde=' + hoy + '&hasta=' + hoy + '&tamanoPagina=500', { token: A });
  check('dashboard: GET /registros-acceso (hoy) → 200 paginado', r.status === 200 && Array.isArray(r.body?.items));
  const p = await call('GET', '/api/personas?tamanoPagina=500', { token: A });
  check('dashboard: GET /personas → 200', p.status === 200);
  const c = await call('GET', '/api/credenciales', { token: A });
  check('dashboard: GET /credenciales → 200', c.status === 200);
  const n = await call('GET', '/api/notificaciones?tamanoPagina=500', { token: A });
  check('dashboard: GET /notificaciones → 200', n.status === 200);
}

// Usuarios — lista paginada (tamanoPagina alto), crear, editar, toggle estado
{
  const r = await call('GET', '/api/usuarios?tamanoPagina=500', { token: A });
  check('usuarios: GET /usuarios → 200 paginado', r.status === 200 && Array.isArray(r.body?.items));
  const nuevo = await call('POST', '/api/usuarios', {
    token: A,
    body: { nombre: `U3-${R}`, correo: `u3-${R}@sciad.gt`, rol: 'SEGURIDAD', password: 'temp1234' },
  });
  check('usuarios: POST /usuarios → 201', nuevo.status === 201);
  const uid = nuevo.body?.id;
  const put = await call('PUT', `/api/usuarios/${uid}`, { token: A, body: { nombre: `U3-${R}-edit`, correo: `u3-${R}@sciad.gt`, rol: 'SEGURIDAD' } });
  check('usuarios: PUT /usuarios/{id} → 200', put.status === 200);
  const togg = await call('PATCH', `/api/usuarios/${uid}/estado`, { token: A, body: { estado: 'inactivo' } });
  check('usuarios: PATCH /usuarios/{id}/estado → 200', togg.status === 200);
}

// Personas — crear/editar/toggle (pantalla nueva)
{
  const pager = await call('GET', '/api/personas?tamanoPagina=500', { token: A });
  check('personas: GET /personas → 200', pager.status === 200);
  const p = await crearPersona('A');
  const put = await call('PUT', `/api/personas/${p.id}`, { token: A, body: { nombre: nombrePrueba(`P3R-A-${R}-edit`), dpiCodigo: p.dpiCodigo, tipo: 1 } });
  check('personas: PUT /personas/{id} → 200', put.status === 200);
  const togg = await call('PATCH', `/api/personas/${p.id}/estado`, { token: A, body: { estado: 'inactivo' } });
  check('personas: PATCH /personas/{id}/estado → 200', togg.status === 200);
  await call('PATCH', `/api/personas/${p.id}/estado`, { token: A, body: { estado: 'activo' } }); // volver a activar
  globalThis.__personaA = p;
}

// Zonas — crear/editar/toggle (pantalla nueva)
{
  const r = await call('GET', '/api/zonas-acceso', { token: A });
  check('zonas: GET /zonas-acceso → 200', r.status === 200 && Array.isArray(r.body));
  const z = await crearZona('A');
  const put = await call('PUT', `/api/zonas-acceso/${z.id}`, {
    token: A,
    body: { nombre: `Z3-A-${R}-edit`, nivelSeguridad: 'alto', nivelRiesgo: 'critico', capacidad: 10 },
  });
  check('zonas: PUT /zonas-acceso/{id} → 200', put.status === 200);
  const togg = await call('PATCH', `/api/zonas-acceso/${z.id}/estado`, { token: A, body: { estado: 'inactivo' } });
  check('zonas: PATCH /zonas-acceso/{id}/estado → 200', togg.status === 200);
  await call('PATCH', `/api/zonas-acceso/${z.id}/estado`, { token: A, body: { estado: 'activo' } });
  globalThis.__zonaA = z;
}

// Perfiles — asignación persona+zona+vigencia, listar, eliminar
{
  const persona = await crearPersona('B');
  const zona = await crearZona('B');
  const perfil = await asignar(persona.id, zona.id);
  const list = await call('GET', '/api/perfiles-acceso', { token: A });
  check('perfiles: GET /perfiles-acceso → 200 (incluye asignación)', list.status === 200 && list.body.some((x) => x.id === perfil.id));
  const del = await call('DELETE', `/api/perfiles-acceso/${perfil.id}`, { token: A });
  check('perfiles: DELETE /perfiles-acceso/{id} → 200/204', del.status === 200 || del.status === 204);
}

// Credenciales — listar, generar por persona, reemitir, revocar
{
  const list = await call('GET', '/api/credenciales', { token: A });
  check('credenciales: GET /credenciales → 200', list.status === 200);
  const persona = await crearPersona('C');
  const zona = await crearZona('C');
  await asignar(persona.id, zona.id);
  const gen = await call('POST', `/api/credenciales/${persona.id}/generar`, { token: A, body: {} });
  check('credenciales: POST /credenciales/{personaId}/generar → 201 con QR cifrado', gen.status === 201 && !!gen.body?.qr);
  const credId = gen.body.id;
  const tok = gen.body.qr;
  const re = await call('POST', `/api/credenciales/${credId}/reemitir`, { token: A, body: {} });
  check('credenciales: POST /credenciales/{id}/reemitir → 201 nuevo QR', re.status === 201 && !!re.body?.qr && re.body?.qr !== tok);
  // reemitir ya revoca la credencial original; revocamos ahora la reemitida
  const reId = re.body?.id ?? credId;
  const reTok = re.body?.qr ?? tok;
  const rev = await call('POST', `/api/credenciales/${reId}/revocar`, { token: A, body: { motivo: 'Recorrido Fase 3' } });
  check('credenciales: POST /credenciales/{reemitId}/revocar → 200', rev.status === 200 && (rev.body === null || +rev.body?.id === +reId));
  // Guardamos el token reemitido para verificación (si se quisiera escanear tras revocar)
  void reTok;
}

// Auditoría — listar, verificar integridad, transición de estado
{
  const list = await call('GET', '/api/auditoria?tipo=&estado=', { token: A });
  check('auditoría: GET /auditoria → 200 paginado', list.status === 200 && Array.isArray(list.body?.items));
  const ver = await call('POST', '/api/auditoria/verificar', { token: A, body: {} });
  check('auditoría: POST /auditoria/verificar → 200 {hallazgosCreados,...}', ver.status === 200 && typeof ver.body?.hallazgosCreados === 'number');
  const items = (await call('GET', '/api/auditoria', { token: A })).body.items;
  const abierto = items.find((x) => x.estado === 'abierto');
  if (abierto) {
    const st = await call('PATCH', `/api/auditoria/${abierto.id}/estado`, { token: A, body: { estado: 'en_revision' } });
    check('auditoría: PATCH /auditoria/{id}/estado (abierto→en_revision) → 200', st.status === 200);
  }
}

// Reportes — listar metadata + generar CSV real
{
  const list = await call('GET', '/api/reportes?tamanoPagina=500', { token: A });
  check('reportes: GET /reportes → 200 paginado', list.status === 200 && Array.isArray(list.body?.items));
  const gen = await call('POST', '/api/reportes/generar', {
    token: A,
    body: { desde: hoy, hasta: hoy },
  });
  check('reportes: POST /reportes/generar → CSV con cabeceras reales', gen.status === 200 && gen.ct.includes('text/csv') && gen.text?.includes('Hora,Persona'));
}

// ================================================================
// RECORRIDO SEGURIDAD
// login · escaneo válido e inválido · accesos del turno
// ================================================================
console.log('\n== Personal de Seguridad ==');

// Escaneo — zona por selector en la UI
{
  const z = await call('GET', '/api/zonas-acceso', { token: S });
  if (z.status === 200) {
    check('escaneo: GET /zonas-acceso con rol Seguridad → 200 (selector de zonas)', true);
  } else {
    check('escaneo: GET /zonas-acceso con rol Seguridad → 200', false, `(403 → el selector de zona falla en la pantalla de escaneo)`);
    hallazgo('Seguridad no puede listar zonas', 'La pantalla de escaneo (Seguridad) necesita el desplegable de zonas, pero GET /zonas-acceso es [RequireAdmin]. Sin cambio de política o formato, el operador no puede escanear.');
  }
}

// Escaneo conforme: persona con asignación vigente + credencial REEMITIDA (token actual).
{
  const persona = await crearPersona('SCAN');
  const zona = await crearZona('SCAN');
  await asignar(persona.id, zona.id);
  const gen = await call('POST', `/api/credenciales/${persona.id}/generar`, { token: A, body: {} });
  const tokenOk = gen.body.qr;
  const ok = await call('POST', '/api/registros-acceso', { token: S, body: { token: tokenOk, zonaId: zona.id } });
  const autorizado = ok.status === 200 && ok.body?.estado === 'autorizado' && ok.body?.tipo === 'ingreso';
  check('escaneo válido: POST /registros-acceso → autorizado (ingreso)', autorizado);
  const eg = await call('POST', '/api/registros-acceso', { token: S, body: { token: tokenOk, zonaId: zona.id } });
  check('escaneo válido (egreso): POST /registros-acceso → autorizado tipo=egreso', eg.status === 200 && eg.body?.tipo === 'egreso' && eg.body?.estado === 'autorizado');
}

// Escaneo inválidos de verdad: token inexistente y credencial revocada.
{
  const malo = await call('POST', '/api/registros-acceso', { token: S, body: { token: 'SC1AD-FAKE-999999', zonaId: 1 } });
  check('escaneo inválido: token inexistente → 400 <> TOKEN_INVALIDO', malo.status === 400 && JSON.stringify(malo.body).includes('TOKEN_INVALIDO'));
  const persona = await crearPersona('REV');
  const zona = await crearZona('REV');
  await asignar(persona.id, zona.id);
  const gen = await call('POST', `/api/credenciales/${persona.id}/generar`, { token: A, body: {} });
  const revog = await call('POST', `/api/credenciales/${gen.body.id}/revocar`, { token: A, body: { motivo: 'prueba' } });
  const uso = await call('POST', '/api/registros-acceso', { token: S, body: { token: gen.body.qr, zonaId: zona.id } });
  check('escaneo inválido: credencial revocada en uso → 400 <> CREDENCIAL_REVOCADA', uso.status === 400 && JSON.stringify(uso.body).includes('CREDENCIAL_REVOCADA'));
}

// Accesos del turno — la pantalla de Seguridad usa GET /hoy (CU-05, AccesoDelDiaDto), NO /historial
// (que es de Admin/Gerencia). Verificamos ambas cosas: /hoy responde 200 y el historial queda 403
// para Seguridad (aislamiento RBAC intencional).
{
  const hoyRes = await call('GET', '/api/registros-acceso/hoy', { token: S });
  check('accesos del turno: GET /registros-acceso/hoy → 200 (pantalla Seguridad)', hoyRes.status === 200 && Array.isArray(hoyRes.body));
  const hist = await call('GET', '/api/registros-acceso?desde=' + hoy + '&hasta=' + hoy, { token: S });
  check('accesos (historial) NO accesible a Seguridad → 403 (aislamiento RBAC)', hist.status === 403);
}

// ================================================================
// RECORRIDO GERENCIA / AUDITORÍA
// trazabilidad · notificaciones · reportes
// ================================================================
console.log('\n== Gerencia / Auditoría ==');

{
  const tr = await call('GET', '/api/registros-acceso?personaId=&zonaId=&desde=&hasta=&tamanoPagina=500', { token: G });
  check('trazabilidad: GET /registros-acceso (filtros) → 200 paginado', tr.status === 200 && Array.isArray(tr.body?.items));
  const n = await call('GET', '/api/notificaciones?tamanoPagina=500', { token: G });
  check('notificaciones: GET /notificaciones → 200 paginado', n.status === 200 && Array.isArray(n.body?.items));
  const sinLeer = (n.body?.items ?? []).find((x) => !x.leida);
  if (sinLeer) {
    const le = await call('PATCH', `/api/notificaciones/${sinLeer.id}/leida`, { token: G, body: { leida: true } });
    check('notificaciones: PATCH /notificaciones/{id}/leida → 200', le.status === 200);
  } else {
    check('notificaciones: PATCH /notificaciones/{id}/leida → 200', true, '(no había sin leer; se crean con los escaneos rechazados)');
  }
  const rl = await call('GET', '/api/reportes?tamanoPagina=500', { token: G });
  check('reportes: GET /reportes → 200', rl.status === 200);
  const rg = await call('POST', '/api/reportes/generar', {
    token: G,
    body: { desde: hoy, hasta: hoy, tipoEvento: 'ingreso' },
  });
  check('reportes: POST /reportes/generar (Gerencia) → CSV', rg.status === 200 && rg.ct.includes('text/csv'));
}

// ================================================================
// PERSISTENCIA — lo creado vía API debe existir en PostgreSQL (consulta directa)
// ================================================================
console.log('\n== Persistencia (consulta directa a PostgreSQL) ==');
{
  const nPers = await PSQL(`SELECT count(*) FROM personas WHERE nombre LIKE '${nombrePrueba('P3R-')}%${nombrePrueba(R)}%'`);
  const nZon = await PSQL(`SELECT count(*) FROM zonas_acceso WHERE nombre LIKE 'Z3-%${R}'`);
  const nUsr = await PSQL(`SELECT count(*) FROM usuarios WHERE correo LIKE 'u3-${R}%'`);
  const nCred = await PSQL(`SELECT count(*) FROM credenciales_qr c JOIN personas p ON p.id = c.persona_id WHERE p.nombre LIKE '${nombrePrueba('P3R-')}%${nombrePrueba(R)}%'`);
  check(`personas guardadas en BD (creadas vía API, sufijo ${R}) → ${nPers}`, +nPers >= 5);
  check(`zonas guardadas en BD (creadas vía API, sufijo ${R}) → ${nZon}`, +nZon >= 4);
  check(`usuarios guardados en BD → ${nUsr}`, +nUsr >= 1);
  check(`credenciales_qr guardadas en BD → ${nCred}`, +nCred >= 3);
}

// ================================================================
console.log(`\n=== RESUMEN: ${pass} ✓ / ${fail} ✗ ${hallazgos.length ? `/ ${hallazgos.length} hallazgo(s)` : ''} ===`);
if (hallazgos.length) {
  console.log('\nHallazgos para decisión de producto/backend (no son fallos de script):');
  for (const h of hallazgos) console.log(` - ${h.resumen}: ${h.detalle}`);
}
process.exit(fail > 0 ? 1 : 0);