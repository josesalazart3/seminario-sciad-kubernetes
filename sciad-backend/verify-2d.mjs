// Verificación real de la Fase 2D (CU-06 historial, CU-07 reportes, CU-08 auditoría, CU-09 notificaciones)
// contra el contenedor. Uso: node verify-2d.mjs
// Cada corrida usa sufijos únicos (timestamp) en DPIs/nombres para poder repetirse sin chocar.
// Unidades de E2E:
//   - "ayer ingreso sin egreso" se siembra insertando directo en BD (el API no permite fechas pasadas).
//   - "concentración inusual" se simula con 12 escaneos de ingreso frescos a la misma zona (12 >= umbral 10).
import { strict as assert } from 'node:assert';
import { execSync } from 'node:child_process';
import { dpiPrueba, nombrePrueba } from './datos-prueba.mjs';

const BASE = process.env.SCIAD_BASE ?? 'http://localhost:3000';
const H = { 'Content-Type': 'application/json' };
const PG = { ...process.env, PGPASSWORD: 'sciad_local_dev_2026' };
const PSQL = (sql) => execSync(`docker exec sciad-db psql -U sciad -d sciad -v ON_ERROR_STOP=1 -c "${sql}"`, { env: PG, encoding: 'utf8' });

const R = Date.now().toString().slice(-8);
// "hoy" = día de Guatemala (UTC-6): el backend guarda y filtra por hora de Guatemala (Fase 4)
const hoy = new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10);
const ayer = new Date(Date.now() - 6 * 3600e3 - 86400000).toISOString().slice(0, 10);
const horaAhora = new Date().toISOString().slice(11, 19);
const fecha = (ms) => new Date(ms).toISOString().slice(0, 10);
const iniVig = fecha(Date.now() - 1 * 86400000);
const finVig = fecha(Date.now() + 30 * 86400000);

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
  const ct = r.headers.get('content-type') ?? '';
  let json = null;
  if (ct.includes('application/json')) { try { json = await r.json(); } catch { /* vacío */ } }
  const text = ct.includes('text/csv') ? (await r.text()) : null;
  return { status: r.status, body: json, text, ct };
}
async function login(email, pass) {
  const { status, body } = await call('POST', '/api/auth/login', { body: { email, password: pass } });
  assert.ok(body?.token, `No se obtuvo token para ${email} (status ${status})`);
  return { token: body.token, usuarioId: +body.user?.id, body };
}

// ---------- Sesiones ----------
const admin = await login('admin@sciad.gt', 'sciad123');
const seg = await login('seguridad@sciad.gt', 'sciad123');
const ger = await login('gerencia@sciad.gt', 'sciad123');
const A = admin.token, S = seg.token, G = ger.token;
const adminId = admin.usuarioId, gerId = ger.usuarioId;
console.log(`Sesiones OK (admin#${adminId}, seg, ger#${gerId}); sufijo=${R}, hoy=${hoy}\n`);

// ---------- Helpers de setup (igual patrón que 2C) ----------
async function crearPersona(sufijo) {
  const r = await call('POST', '/api/personas', { token: A, body: { nombre: nombrePrueba(`P2D-${sufijo}-${R}`), dpiCodigo: dpiPrueba(), tipo: 1 } });
  assert.equal(r.status, 201, `Persona ${sufijo} no creada: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}
async function crearZona(sufijo) {
  const r = await call('POST', '/api/zonas-acceso', { token: A, body: { nombre: `Z2D-${sufijo}-${R}`, nivelSeguridad: 'ALTO', nivelRiesgo: 'CRITICO', capacidad: 100 } });
  assert.equal(r.status, 201, `Zona ${sufijo} no creada: ${r.status}`);
  return r.body;
}
async function asignarPerfil(personaId, zonaId, ini = iniVig, fin = finVig) {
  const r = await call('POST', '/api/perfiles-acceso', { token: A, body: { personaId: +personaId, zonaId: +zonaId, vigenciaInicio: ini, vigenciaFin: fin } });
  assert.equal(r.status, 201, `Perfil no creado: ${r.status}`);
}
async function credencial(personaId) {
  const c = await call('POST', `/api/credenciales/${personaId}/generar`, { token: A });
  assert.equal(c.status, 201, `Credencial no generada: ${c.status}`);
  return c.body;
}
const escanear = (token, tkn, zonaId) => call('POST', '/api/registros-acceso', { token, body: { token: tkn, zonaId: +zonaId } });

// Zonas de prueba
const zonaHist = await crearZona('HIST');
const zonaConc = await crearZona('CONC');
console.log(`Zonas: hist(id=${zonaHist.id}), conc(id=${zonaConc.id}).\n`);

// Persona de historial: hoy, ingreso→egreso en zonaHist (2 registros para CU-06 y CU-07).
const personaH = await crearPersona('H');
await asignarPerfil(personaH.id, zonaHist.id);
const tknH = (await credencial(personaH.id)).qr;
const esc1 = await escanear(S, tknH, zonaHist.id);
const esc2 = await escanear(S, tknH, zonaHist.id);
assert.ok(esc1.body?.tipo === 'ingreso' && esc2.body?.tipo === 'egreso', `esperaba ingreso→egreso para H, obtuve ${esc1.body?.tipo}→${esc2.body?.tipo}`);
console.log(`Historial sembrado: persona H (id=${personaH.id}) con ingreso→egreso hoy en zonaHist.\n`);

console.log('== RBAC 2D (filtro por rol en cada endpoint) ==');
{
  check('GET /registros-acceso Seguridad -> 403', (await call('GET', '/api/registros-acceso', { token: S })).status === 403);
  check('GET /registros-acceso Gerencia -> 200', (await call('GET', '/api/registros-acceso', { token: G })).status === 200);
  check('GET /registros-acceso/hoy Gerencia -> 403 (sin regresión 2C)', (await call('GET', '/api/registros-acceso/hoy', { token: G })).status === 403);
  check('GET /notificaciones Seguridad -> 403', (await call('GET', '/api/notificaciones', { token: S })).status === 403);
  check('GET /notificaciones Gerencia -> 200', (await call('GET', '/api/notificaciones', { token: G })).status === 200);
  check('GET /auditoria Seguridad -> 403', (await call('GET', '/api/auditoria', { token: S })).status === 403);
  check('GET /auditoria Gerencia -> 200', (await call('GET', '/api/auditoria', { token: G })).status === 200);
  check('POST /auditoria/verificar Gerencia -> 403 (solo Admin)', (await call('POST', '/api/auditoria/verificar', { token: G })).status === 403);
  check('POST /auditoria/verificar Seguridad -> 403', (await call('POST', '/api/auditoria/verificar', { token: S })).status === 403);
  check('GET /reportes Seguridad -> 403', (await call('GET', '/api/reportes', { token: S })).status === 403);
}

console.log('\n== CU-06: historial de accesos ==');
{
  const h = await call('GET', `/api/registros-acceso?personaId=${personaH.id}`, { token: G });
  check('-> 200, paginado', h.status === 200 && h.body?.items !== undefined && h.body.total === 2, `total=${h.body?.total}`);
  check('  con las 2 filas de H (ingreso+egreso, orden desc)', h.body?.items?.length === 2
    && h.body.items.every(x => x.personaId === +personaH.id && x.personaNombre.startsWith(nombrePrueba('P2D-H-'))),
    `tipo=${h.body?.items?.map(x => x.tipo).join(',')}`);
  const fi = await call('GET', `/api/registros-acceso?tipo=ingreso`, { token: G });
  check('  ?tipo=ingreso filtra (todas ingreso)', fi.status === 200 && fi.body.items.every(x => x.tipo === 'ingreso'));
  const pag = await call('GET', `/api/registros-acceso?tamanoPagina=1`, { token: G });
  check('  paginación tamanoPagina=1 -> 1 item, totalPaginas=total', pag.status === 200 && pag.body.items.length === 1 && pag.body.totalPaginas === pag.body.total);
  check('  ?desde>hasta -> 400', (await call('GET', `/api/registros-acceso?desde=${hoy}&hasta=${ayer}`, { token: G })).status === 400);
  check('  ?tipo=malo -> 400', (await call('GET', `/api/registros-acceso?tipo=malo`, { token: G })).status === 400);
  check('  ?zonaId filtra por zona', (await call('GET', `/api/registros-acceso?zonaId=${zonaHist.id}`, { token: G })).body.items.every(x => x.zonaId === +zonaHist.id));
}

console.log('\n== CU-09: notificaciones (lectura + marcar leída con propiedad) ==');
let notifObj;
{
  // Crear una 2.ª gerencia para probar que Otro no puede marcar una notificación ajena.
  const g2 = await call('POST', '/api/usuarios', {
    token: A, body: { nombre: `G2-${R}`, correo: `g2-${R}@sciad.gt`, password: 'sciad123', rol: 'GERENCIA', puesto: 'Gerencia auxiliar' } });
  assert.equal(g2.status, 201, `g2 no creada: ${g2.status}`);
  const ger2 = await login(`g2-${R}@sciad.gt`, 'sciad123');
  const G2 = ger2.token;

  const lista = await call('GET', '/api/notificaciones?tamanoPagina=50', { token: A });
  check('admin ve todas -> 200 paginado', lista.status === 200 && Array.isArray(lista.body?.items));
  const sola = await call('GET', '/api/notificaciones', { token: G });
  check('gerencia ve las suyas -> 200 (no 403) y todas propias', sola.status === 200
    && sola.body.items.every(x => x.usuarioId === gerId));

  // Toma una notificación con destinatario definido para probar propiedad.
  notifObj = lista.body.items.find(x => x.usuarioId != null);
  if (notifObj) {
    const otroToken = notifObj.usuarioId === gerId ? G2 : G; // gerencia distinta del dueño
    const propio = notifObj.usuarioId === gerId ? G : G2;
    const markAjeno = await call('PATCH', `/api/notificaciones/${notifObj.id}/leida`, { token: otroToken, body: { leida: true } });
    check('  otro gerente no marca la notificación ajena -> 400', markAjeno.status === 400, `code=${markAjeno.body?.code}`);
    const markAdmin = await call('PATCH', `/api/notificaciones/${notifObj.id}/leida`, { token: A, body: { leida: true } });
    check('  admin sí puede marcar cualquier notificación -> 200', markAdmin.status === 200 && markAdmin.body?.leida === true);
    const markDueño = await call('PATCH', `/api/notificaciones/${notifObj.id}/leida`, { token: propio, body: { leida: true } });
    check('  el dueño la marca -> 200 leida=true', markDueño.status === 200 && markDueño.body?.leida === true);
    const filtro = await call('GET', `/api/notificaciones?leida=true`, { token: A });
    check('  ?leida=true la incluye', filtro.status === 200 && filtro.body.items.some(x => x.id === notifObj.id));
    check('  PATCH leida con Seguridad -> 403', (await call('PATCH', `/api/notificaciones/${notifObj.id}/leida`, { token: S, body: { leida: true } })).status === 403);
  } else {
    check('  (sin notificaciones con destinatario — se omite prueba de propiedad)', false);
  }
}

console.log('\n== CU-08: auditoría (ayer sin egreso + concentración simulada → verificar) ==');
let hallazgoConc;
{
  // a) Ingreso "ayer" sin egreso, sembrado directo en BD con una persona fresca.
  const personaY = await crearPersona('Y');
  const ins = PSQL(`INSERT INTO registros_acceso (persona_id, zona_id, fecha, hora, tipo, usuario_id) VALUES (${personaY.id}, ${zonaHist.id}, '${ayer}', '${horaAhora}', 'ingreso', ${adminId});`);
  check('  inserto ingreso de "ayer" sin egreso (persona Y) en BD', /INSERT 0 1/.test(ins));

  // b) Concentración: 12 escaneos de ingreso frescos a la misma zona (12 >= umbral 10).
  const scans = [];
  for (let i = 0; i < 12; i++) {
    const p = await crearPersona(`C${i}`);
    await asignarPerfil(p.id, zonaConc.id);
    const t = (await credencial(p.id)).qr;
    const s = await escanear(S, t, zonaConc.id);
    assert.ok(s.status === 200 && s.body?.tipo === 'ingreso', `scan concentración ${i} falló: ${s.status}`);
    scans.push(s);
  }
  check(`  12 ingresos ok en zona ${zonaConc.nombre}`, scans.length === 12);

  // c) Verificar (Admin) → hallazgos de ambos tipos + notificación de concentración.
  const v = await call('POST', '/api/auditoria/verificar', { token: A });
  check('  verificar Executa -> 200', v.status === 200 && typeof v.body?.hallazgosCreados === 'number',
    `hallazgos=${v.body?.hallazgosCreados}`);
  check('  detecta el ingreso sin egreso de días anteriores', (v.body?.porTipo?.acceso_sin_egreso ?? 0) >= 1, JSON.stringify(v.body?.porTipo));
  check('  detecta la concentración inusual en zona', (v.body?.porTipo?.concentracion ?? 0) >= 1);
  check('  genera ≥1 notificación de concentración', (v.body?.notificacionesGeneradas ?? 0) >= 1);

  // d) Confirmar en GET /api/auditoria.
  const hallY = await call('GET', `/api/auditoria?tipo=acceso_sin_egreso`, { token: G });
  check('  GET ?tipo=acceso_sin_egreso contiene el hallazgo de persona Y',
    hallY.status === 200 && hallY.body.items.some(x => x.personaId === +personaY.id && x.estado === 'abierto'));
  const hallConc = await call('GET', `/api/auditoria?tipo=concentracion`, { token: G });
  hallazgoConc = hallConc.body?.items?.find(x => x.descripcion.includes(`zona 'Z2D-CONC-${R}'`));
  check('  hallazgo de concentración para la zona sembrada', !!hallazgoConc);
  if (hallazgoConc) {
    check('  PATCH a estado inválido -> 400', (await call('PATCH', `/api/auditoria/${hallazgoConc.id}/estado`, { token: A, body: { estado: 'cerrado' } })).status === 400);
    const rev = await call('PATCH', `/api/auditoria/${hallazgoConc.id}/estado`, { token: A, body: { estado: 'en_revision' } });
    check('  PATCH estado en_revision -> 200', rev.status === 200 && rev.body?.estado === 'en_revision');
    const res = await call('PATCH', `/api/auditoria/${hallazgoConc.id}/estado`, { token: G, body: { estado: 'resuelto' } });
    check('  PATCH resuelto (Gerencia) -> 200', res.status === 200 && res.body?.estado === 'resuelto');
  } else {
    check('  (sin hallazgo de concentración — se omite PATCH)', false);
  }
  const nf = await call('GET', '/api/notificaciones?tamanoPagina=100', { token: A });
  check('  notificación de concentración generada y sin leer', nf.body?.items?.some(x => x.tipo === 'concentracion' && x.leida === false));
}

console.log('\n== CU-07: reportes (CSV + metadatos) ==');
{
  const r = await call('POST', '/api/reportes/generar', {
    token: A, body: { desde: ayer, hasta: hoy } });
  check('  generar CSV Admin -> 200 text/csv', r.status === 200 && r.ct.includes('text/csv'));
  check('  CSV trae encabezados', r.text?.includes('Fecha,Hora,Persona,Zona,Tipo,RegistradoPor') === true);
  check('  CSV incluye la fila ingreso de persona H', r.text?.includes(personaH.nombre) === true && r.text?.includes('ingreso') === true);
  check('  generar con Gerencia -> 200', (await call('POST', '/api/reportes/generar', { token: G, body: { desde: ayer, hasta: hoy } })).status === 200);
  check('  desde>hasta -> 400', (await call('POST', '/api/reportes/generar', { token: G, body: { desde: hoy, hasta: ayer } })).status === 400);
  check('  tipoEvento inválido -> 400', (await call('POST', '/api/reportes/generar', { token: G, body: { desde: ayer, hasta: hoy, tipoEvento: 'x' } })).status === 400);

  const lista = await call('GET', '/api/reportes', { token: G });
  check('  GET /reportes -> 200 paginado', lista.status === 200 && Array.isArray(lista.body?.items));
  const nuevo = lista.body?.items?.[0];
  check('  primer reporte es el de hoy con total ≥ 2 (ingreso+egreso de H)',
    nuevo && nuevo.id !== undefined && nuevo.periodo === `${ayer} a ${hoy}` && nuevo.totalRegistros >= 2,
    `total=${nuevo?.totalRegistros}, generadoPor=${nuevo?.generadoPor}`);
  const csvDeVuelta = await call('POST', '/api/reportes/generar', { token: A, body: { desde: ayer, hasta: hoy, personaId: +personaH.id } });
  const lineasDatos = csvDeVuelta.text?.split('\n').filter(l => l.trim() !== '').length - 1;
  const filtrado = await call('GET', '/api/reportes', { token: A });
  check('  total_registros del CSV filtrado = filas de H (2)', filtrado.body?.items?.[0]?.totalRegistros === lineasDatos
    && filtrado.body?.items?.[0]?.totalRegistros === 2, `total=${filtrado.body?.items?.[0]?.totalRegistros}`);
}

console.log('\n== Sin DELETE físico ==');
{
  const sinDelete = (await call('GET', '/api/auditoria?tamanoPagina=1', { token: A })).status === 200
    && (await call('GET', '/api/reportes?tamanoPagina=1', { token: A })).status === 200
    && (await call('GET', '/api/notificaciones?tamanoPagina=1', { token: A })).status === 200;
  check('  auditoria/reportes/notificaciones solo son de lectura/actualización (sin endpoints DELETE)', sinDelete);
}

console.log(`\n===== RESULTADO: ${pass} ✓  /  ${fail} ✗ =====`);
if (fail > 0) console.log('→ Revisa los fallos con psql: SELECT tipo, persona_id, estado, fecha FROM auditoria ORDER BY id DESC LIMIT 10;');
process.exit(fail === 0 ? 0 : 1);