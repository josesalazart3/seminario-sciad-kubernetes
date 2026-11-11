// Verificación real de la Fase 2B contra el contenedor corriendo.
// Uso: node verify-2b.mjs   (levanta tokens con curl interno vía fetch)
import { strict as assert } from 'node:assert';
import { dpiPrueba } from './datos-prueba.mjs';

const BASE = process.env.SCIAD_BASE ?? 'http://localhost:3000';
const H = { 'Content-Type': 'application/json' };

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name} ${extra}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}

async function login(email, pass) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: H, body: JSON.stringify({ email, password: pass }),
  });
  const j = await r.json();
  return { status: r.status, token: j.token, body: j };
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

const admin = await login('admin@sciad.gt', 'sciad123');
assert.ok(admin.token, 'No se obtuvo token admin');
const seg = await login('seguridad@sciad.gt', 'sciad123');
const ger = await login('gerencia@sciad.gt', 'sciad123');
console.log(`Tokens obtenidos (admin/seguridad/gerencia).\n`);

console.log('== RBAC base (403 para no-admin, 401 sin token) ==');
check('GET /api/usuarios sin token -> 401', (await call('GET', '/api/usuarios')).status === 401);
check('GET /api/usuarios seguridad -> 403', (await call('GET', '/api/usuarios', { token: seg.token })).status === 403);
check('GET /api/usuarios gerencia -> 403', (await call('GET', '/api/usuarios', { token: ger.token })).status === 403);
check('GET /api/usuarios admin -> 200', (await call('GET', '/api/usuarios', { token: admin.token })).status === 200);

console.log('\n== CU-01 Usuarios ==');
{
  const list = await call('GET', '/api/usuarios?pagina=1&tamanoPagina=2', { token: admin.token });
  check('GET paginado devuelve shape (items,total,pagina,...)', list.status === 200 && Array.isArray(list.body?.items) && typeof list.body?.total === 'number');
  check('Paginación respeta tamanoPagina', list.body?.items?.length <= 2);

  const nuevo = await call('POST', '/api/usuarios', { token: admin.token, body: { nombre: 'Admin 2B', correo: 'admin2b@sciad.gt', password: 'clave12345', rol: 'ADMIN', puesto: 'Auxiliar' } });
  check('POST crea usuario -> 201', nuevo.status === 201);
  check('  id serializado string, rol ADMIN', typeof nuevo.body?.id === 'string' && nuevo.body?.rol === 'ADMIN');
  check('  no se filtra password_hash', !('passwordHash' in (nuevo.body ?? {})) && !('PasswordHash' in (nuevo.body ?? {})));
  const idU = nuevo.body?.id;

  check('POST correo duplicado -> 409', (await call('POST', '/api/usuarios', { token: admin.token, body: { nombre: 'Dup', correo: 'admin2b@sciad.gt', password: 'clave12345', rol: 'ADMIN' } })).status === 409);
  check('POST rol inexistente -> 400', (await call('POST', '/api/usuarios', { token: admin.token, body: { nombre: 'x', correo: 'x@sciad.gt', password: 'clave12345', rol: 'NOEXISTE' } })).status === 400);
  check('POST sin password -> 400', (await call('POST', '/api/usuarios', { token: admin.token, body: { nombre: 'x', correo: 'x2@sciad.gt', rol: 'ADMIN' } })).status === 400);

  const edit = await call('PUT', `/api/usuarios/${idU}`, { token: admin.token, body: { nombre: 'Admin 2B Editado', correo: 'admin2b@sciad.gt', rol: 'ADMIN' } });
  check('PUT edita -> 200', edit.status === 200 && edit.body?.nombre === 'Admin 2B Editado');
  check('PUT usuario inexistente -> 404', (await call('PUT', '/api/usuarios/999999', { token: admin.token, body: { nombre: 'a', correo: 'a@sciad.gt', rol: 'ADMIN' } })).status === 404);

  const des = await call('PATCH', `/api/usuarios/${idU}/estado`, { token: admin.token, body: { estado: 'inactivo' } });
  check('PATCH estado inactivo -> 200 (baja lógica)', des.status === 200 && des.body?.activo === false);
  check('PATCH estado inválido -> 400', (await call('PATCH', `/api/usuarios/${idU}/estado`, { token: admin.token, body: { estado: 'borrado' } })).status === 400);
  check('GET list incluye el inactivo (soft-delete)', (await call(`GET`, '/api/usuarios?estado=todos', { token: admin.token })).body?.items?.some(u => u.email === 'admin2b@sciad.gt' && u.activo === false) === true);
}

console.log('\n== CU-02 Personas ==');
let idP, idP2;
// Fase 8: DPI de 13 dígitos válidos (y nuevos en cada corrida, para no chocar con datos anteriores).
const DPI1 = dpiPrueba(), DPI2 = dpiPrueba(), DPI3 = dpiPrueba();
{
  const per = await call('POST', '/api/personas', { token: admin.token, body: { nombre: 'Colaborador Uno', dpiCodigo: DPI1, tipo: 1 } });
  check('POST persona colaborador -> 201', per.status === 201);
  check('  tipo 1 = colaborador', per.body?.tipo === 1);
  idP = per.body?.id;

  const vis = await call('POST', '/api/personas', { token: admin.token, body: { nombre: 'Visitante Dos', dpiCodigo: DPI2, tipo: 2 } });
  check('POST persona visitante (tipo 2) -> 201', vis.status === 201 && vis.body?.tipo === 2);
  idP2 = vis.body?.id;

  check('POST dpi duplicado -> 409', (await call('POST', '/api/personas', { token: admin.token, body: { nombre: 'Zeta Duplicado', dpiCodigo: DPI1, tipo: 1 } })).status === 409);
  check('POST tipo inválido -> 400', (await call('POST', '/api/personas', { token: admin.token, body: { nombre: 'Zeta Tipo', dpiCodigo: DPI3, tipo: 99 } })).status === 400);

  const l1 = await call('GET', '/api/personas?tipo=1&estado=activo', { token: admin.token });
  check('GET filtro tipo=1 estado=activo', l1.status === 200 && l1.body?.items?.every(p => p.tipo === 1 && p.estado === 'activo'));
  check('GET filtro tipo inexistente -> 400', (await call('GET', '/api/personas?tipo=7', { token: admin.token })).status === 400);

  const edit = await call('PUT', `/api/personas/${idP}`, { token: admin.token, body: { nombre: 'Colaborador Uno Editado', dpiCodigo: DPI1, tipo: 1 } });
  check('PUT edita persona -> 200', edit.status === 200 && edit.body?.nombre === 'Colaborador Uno Editado');

  const des = await call('PATCH', `/api/personas/${idP}/estado`, { token: admin.token, body: { estado: 'inactivo' } });
  check('PATCH persona inactivo -> 200', des.status === 200 && des.body?.estado === 'inactivo');
  // reactivar para el flujo E2E
  await call('PATCH', `/api/personas/${idP}/estado`, { token: admin.token, body: { estado: 'activo' } });
  check('PATCH persona reactivada -> activo', (await call('GET', `/api/personas?tipo=1&estado=activo`, { token: admin.token })).body?.items?.some(p => p.id === idP) === true);
}

console.log('\n== CU-03 Zonas ==');
let idZ;
{
  const z = await call('POST', '/api/zonas-acceso', { token: admin.token, body: { nombre: 'Sala de Servidores', nivelSeguridad: 'ALTO', nivelRiesgo: 'CRITICO', capacidad: 120 } });
  check('POST zona -> 201', z.status === 201 && z.body?.nivelSeguridad === 'ALTO');
  check('  nivelRiesgo y capacidad devueltos', z.status === 201 && z.body?.nivelRiesgo === 'CRITICO' && z.body?.capacidad === 120);
  check('  estado inicial activo', z.status === 201 && z.body?.estado === 'activo');
  idZ = z.body?.id;
  check('GET zonas incluye la nueva', (await call('GET', '/api/zonas-acceso', { token: admin.token })).body?.some(zz => zz.id === idZ) === true);
  check('POST zona sin nivelRiesgo -> 400', (await call('POST', '/api/zonas-acceso', { token: admin.token, body: { nombre: 'x', nivelSeguridad: 'ALTO' } })).status === 400);
  check('POST zona sin nivelSeguridad -> 400', (await call('POST', '/api/zonas-acceso', { token: admin.token, body: { nombre: 'x', nivelRiesgo: 'BAJO' } })).status === 400);
  check('POST capacidad inválida -> 400', (await call('POST', '/api/zonas-acceso', { token: admin.token, body: { nombre: 'x', nivelSeguridad: 'ALTO', nivelRiesgo: 'BAJO', capacidad: -5 } })).status === 400);
  const up = await call('PUT', `/api/zonas-acceso/${idZ}`, { token: admin.token, body: { nombre: 'Sala Servidores Norte', nivelSeguridad: 'ALTO', nivelRiesgo: 'MEDIO', capacidad: 80 } });
  check('PUT zona actualiza nivelRiesgo/capacidad -> 200', up.status === 200 && up.body?.nivelRiesgo === 'MEDIO' && up.body?.capacidad === 80 && up.body?.nombre === 'Sala Servidores Norte');
  check('PUT zona inexistente -> 404', (await call('PUT', '/api/zonas-acceso/999999', { token: admin.token, body: { nombre: 'a', nivelSeguridad: 'ALTO', nivelRiesgo: 'BAJO' } })).status === 404);

  const des = await call('PATCH', `/api/zonas-acceso/${idZ}/estado`, { token: admin.token, body: { estado: 'inactivo' } });
  check('PATCH zona inactivo -> 200 (baja lógica)', des.status === 200 && des.body?.estado === 'inactivo');
  check('PATCH zona estado inválido -> 400', (await call('PATCH', `/api/zonas-acceso/${idZ}/estado`, { token: admin.token, body: { estado: 'borrado' } })).status === 400);
  check('PATCH zona inexistente -> 404', (await call('PATCH', '/api/zonas-acceso/999999/estado', { token: admin.token, body: { estado: 'inactivo' } })).status === 404);
  check('GET incluye la inactiva (soft-delete)', (await call('GET', '/api/zonas-acceso?estado=todos', { token: admin.token })).body?.some(zz => zz.id === idZ && zz.estado === 'inactivo') === true);
  // reactivar para el flujo E2E de perfiles (la zona debe estar activa)
  await call('PATCH', `/api/zonas-acceso/${idZ}/estado`, { token: admin.token, body: { estado: 'activo' } });
  check('PATCH zona reactivada -> activo', (await call('GET', '/api/zonas-acceso', { token: admin.token })).body?.some(zz => zz.id === idZ && zz.estado === 'activo') === true);
}

console.log('\n== CU-04 Perfiles de acceso ==');
let idPF;
{
  check('POST perfil persona inactiva? (reactivada antes) -> 201', (await call('POST', '/api/perfiles-acceso', { token: admin.token, body: { personaId: +idP, zonaId: +idZ, vigenciaInicio: '2026-09-01', vigenciaFin: '2026-12-31' } })).status === 201);
  const pf = await call('POST', '/api/perfiles-acceso', { token: admin.token, body: { personaId: +idP, zonaId: +idZ, vigenciaInicio: '2026-09-01', vigenciaFin: '2026-12-31' } });
  // el primero ya existe; usamos este como referencia
  idPF = pf.body?.id;
  check('POST perfil -> 201', pf.status === 201 && pf.body?.personaNombre === 'Colaborador Uno Editado');

  check('POST vigencia fin < inicio -> 400', (await call('POST', '/api/perfiles-acceso', { token: admin.token, body: { personaId: +idP, zonaId: +idZ, vigenciaInicio: '2026-12-31', vigenciaFin: '2026-09-01' } })).status === 400);
  check('POST persona inexistente -> 404', (await call('POST', '/api/perfiles-acceso', { token: admin.token, body: { personaId: 999999, zonaId: +idZ, vigenciaInicio: '2026-09-01', vigenciaFin: '2026-12-31' } })).status === 404);
  check('POST zona inexistente -> 404', (await call('POST', '/api/perfiles-acceso', { token: admin.token, body: { personaId: +idP, zonaId: 999999, vigenciaInicio: '2026-09-01', vigenciaFin: '2026-12-31' } })).status === 404);

  // adenda 2B: una zona inactiva no admite nuevos perfiles (igual que persona inactiva)
  const zInact = await call('POST', '/api/zonas-acceso', { token: admin.token, body: { nombre: 'Zona Temporal Inactiva', nivelSeguridad: 'ALTO', nivelRiesgo: 'BAJO' } });
  const idZInact = zInact.body?.id;
  await call('PATCH', `/api/zonas-acceso/${idZInact}/estado`, { token: admin.token, body: { estado: 'inactivo' } });
  check('POST perfil zona inactiva -> 400', (await call('POST', '/api/perfiles-acceso', { token: admin.token, body: { personaId: +idP, zonaId: +idZInact, vigenciaInicio: '2026-09-01', vigenciaFin: '2026-12-31' } })).status === 400);

  const vis = await call('PATCH', `/api/personas/${idP2}/estado`, { token: admin.token, body: { estado: 'inactivo' } });
  check('(prep) visitante inactivo', vis.status === 200);
  check('POST perfil persona inactiva -> 400', (await call('POST', '/api/perfiles-acceso', { token: admin.token, body: { personaId: +idP2, zonaId: +idZ, vigenciaInicio: '2026-09-01', vigenciaFin: '2026-12-31' } })).status === 400);

  const lp = await call('GET', `/api/perfiles-acceso?personaId=${idP}`, { token: admin.token });
  check('GET por persona', lp.status === 200 && lp.body?.some(p => p.personaId === idP && p.zonaId === idZ));
  const lz = await call('GET', `/api/perfiles-acceso?zonaId=${idZ}`, { token: admin.token });
  check('GET por zona', lz.status === 200 && lz.body?.some(p => p.zonaId === idZ));

  check('DELETE perfil -> 204', (await call('DELETE', `/api/perfiles-acceso/${idPF}`, { token: admin.token })).status === 204);
  check('DELETE perfil inexistente -> 404', (await call('DELETE', '/api/perfiles-acceso/999999', { token: admin.token })).status === 404);
}

console.log('\n== CU-05 Credenciales QR ==');
{
  // persona idP está activa y con perfil asignado (perfil en idpf que se borró, no importa)
  const gen = await call('POST', `/api/credenciales/${idP}/generar`, { token: admin.token });
  check('generar -> 201 con QR cifrado (SCIAD1.…) y sin el token completo', gen.status === 201 && /^SCIAD1\.[A-Za-z0-9_-]{87}$/.test(gen.body?.qr) && gen.body?.token === undefined && /^[0-9a-f]{8}$/.test(gen.body?.tokenCorto));
  check('  estado activa', gen.body?.estado === 'activa');
  const idC1 = gen.body?.id;

  check('generar de nuevo -> 409 (ya activa)', (await call('POST', `/api/credenciales/${idP}/generar`, { token: admin.token })).status === 409);

  const genInactiva = await call('POST', `/api/credenciales/${idP2}/generar`, { token: admin.token });
  check('generar persona inactiva -> 400', genInactiva.status === 400);
  check('generar persona inexistente -> 404', (await call('POST', '/api/credenciales/999999/generar', { token: admin.token })).status === 404);

  const re = await call('POST', `/api/credenciales/${idC1}/reemitir`, { token: admin.token });
  check('reemitir -> 201, QR nuevo cifrado (SCIAD1.…)', re.status === 201 && /^SCIAD1\.[A-Za-z0-9_-]{87}$/.test(re.body?.qr) && re.body?.qr !== gen.body?.qr);
  check('  nueva credencial estado activa, reemitidoDe = anterior', re.body?.estado === 'activa' && re.body?.reemitidoDe === +idC1);

  const hist = await call('GET', `/api/credenciales?personaId=${idP}`, { token: admin.token });
  check('historial: >=2 credenciales, anterior quedó revocada', hist.status === 200
    && hist.body?.length >= 2
    && hist.body?.some(c => c.id === idC1 && c.estado === 'revocada')
    && hist.body?.some(c => c.id === re.body?.id && c.estado === 'activa'));

  // no puede haber DELETE físico en credenciales: el controlador no expone DELETE
  check('GET credenciales inválido (persona inexistente) -> 404', (await call('GET', '/api/credenciales?personaId=999999', { token: admin.token })).status === 404);
}

console.log(`\n===== RESULTADO: ${pass} ✓  /  ${fail} ✗ =====`);
process.exit(fail === 0 ? 0 : 1);
