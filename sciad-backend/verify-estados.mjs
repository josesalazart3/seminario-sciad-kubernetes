// ============================================================================
// SCIAD — Fase 8.4: Activos / Deshabilitados (baja lógica) de usuarios, personas y zonas, contra la API REAL.
//   - Los GET de lista aceptan estado=activo|inactivo|todos (por defecto: activo); otro valor → 400.
//   - Deshabilitar / reactivar usan el PATCH …/estado que ya existía (mismo RBAC, sin endpoints nuevos).
//   - Usuario deshabilitado: no inicia sesión y su sesión abierta se invalida en la revalidación (≤ 30 s).
//   - Un administrador no puede deshabilitarse a sí mismo (= el último administrador activo nunca queda deshabilitado).
//   - Persona / zona deshabilitada: el escaneo da rojo y NO crea registro; perfiles y registros antiguos se conservan;
//     reactivar una persona no toca sus credenciales.
// Termina con código 1 si falla algo.
//
//   node verify-estados.mjs          (API en http://localhost:3000; ~40 s por la espera de la revalidación de sesión)
//
// Datos: crea una persona y una zona «ZZ Estados …» (las borra el siguiente scripts/reset-datos) y reutiliza siempre
// el mismo usuario de prueba zz-estados@sciad.gt, que queda DESHABILITADO al terminar. Hace 3 inicios de sesión de ese
// usuario (límite de PG2: 5 / 5 min por IP): córralo con la ventana de login libre.
// ============================================================================
import { getToken } from './token-store.mjs';
import { dpiPrueba, nombrePrueba } from './datos-prueba.mjs';

const BASE = (process.env.SCIAD_BASE ?? 'http://localhost:3000').replace(/\/$/, '');
const R = Date.now().toString().slice(-6);
let fallos = 0, total = 0;
const check = (n, ok, d = '') => { total++; if (!ok) fallos++; console.log(`  ${ok ? '✓' : '✗'} ${n}${d !== '' ? `  → ${d}` : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, path, { token, body } = {}) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await r.json(); } catch { /* sin cuerpo */ }
  return { status: r.status, body: json };
}
const items = (b) => (Array.isArray(b) ? b : b?.items ?? []);
const ids = (b) => items(b).map((x) => String(x.id));
const T = await getToken('admin@sciad.gt');
const yo = (await call('GET', '/api/auth/me', { token: T })).body;

/** Comprueba el filtro de estado de un listado para un registro que se acaba de deshabilitar. */
async function listas(ruta, id, sep) {
  const def = await call('GET', `${ruta}${sep}tamanoPagina=500`, { token: T });
  const ina = await call('GET', `${ruta}${sep}estado=inactivo&tamanoPagina=500`, { token: T });
  const tod = await call('GET', `${ruta}${sep}estado=todos&tamanoPagina=500`, { token: T });
  check('la lista por defecto (activos) NO lo incluye', def.status === 200 && !ids(def.body).includes(id) && items(def.body).every((x) => x.estado ? x.estado === 'activo' : x.activo));
  check('estado=inactivo lo muestra (y solo deshabilitados)', ids(ina.body).includes(id) && items(ina.body).every((x) => x.estado ? x.estado === 'inactivo' : !x.activo));
  check('estado=todos muestra activos y deshabilitados', ids(tod.body).includes(id) && items(tod.body).length === items(def.body).length + items(ina.body).length,
    `${items(tod.body).length} = ${items(def.body).length} + ${items(ina.body).length}`);
}

console.log('\n== Filtro de estado inválido ==');
for (const ruta of ['/api/usuarios', '/api/personas', '/api/zonas-acceso']) {
  const r = await call('GET', `${ruta}?estado=borrado`, { token: T });
  check(`${ruta}?estado=borrado → 400`, r.status === 400, `${r.status} ${r.body?.detail ?? ''}`);
}

// ---------------------------------------------------------------- Usuarios
console.log('\n== Usuarios ==');
const CORREO = 'zz-estados@sciad.gt', CLAVE = 'Estados-Prueba-2026';
let usr = items((await call('GET', '/api/usuarios?estado=todos&tamanoPagina=500', { token: T })).body).find((u) => u.email === CORREO);
if (!usr) {
  usr = (await call('POST', '/api/usuarios', { token: T, body: { nombre: 'ZZ Usuario Estados', correo: CORREO, password: CLAVE, rol: 'SEGURIDAD', puesto: 'Prueba de estados' } })).body;
} else {
  await call('PUT', `/api/usuarios/${usr.id}`, { token: T, body: { nombre: usr.nombre, correo: CORREO, rol: 'SEGURIDAD', puesto: usr.puesto, password: CLAVE } });
}
await call('PATCH', `/api/usuarios/${usr.id}/estado`, { token: T, body: { estado: 'activo' } });
const login = (email, password) => call('POST', '/api/auth/login', { body: { email, password } });
const l1 = await login(CORREO, CLAVE);
check('(prep) el usuario de prueba activo inicia sesión', l1.status === 200 && !!l1.body?.token, l1.status);
const sesion = l1.body?.token;

const desU = await call('PATCH', `/api/usuarios/${usr.id}/estado`, { token: T, body: { estado: 'inactivo' } });
check('deshabilitar usuario (PATCH /usuarios/{id}/estado) → 200 inactivo', desU.status === 200 && desU.body?.activo === false, desU.status);
await listas('/api/usuarios', String(usr.id), '?');
const l2 = await login(CORREO, CLAVE);
check('un usuario deshabilitado NO puede iniciar sesión (401 genérico, OWASP A07)', l2.status === 401 && !l2.body?.token, `${l2.status} ${l2.body?.detail ?? ''}`);
let invalida = false; const t0 = Date.now();
while (Date.now() - t0 < 40_000) { if ((await call('GET', '/api/auth/me', { token: sesion })).status === 401) { invalida = true; break; } await sleep(2000); }
check('su sesión abierta se invalida en la revalidación (≤ 30 s)', invalida, `${Math.round((Date.now() - t0) / 1000)} s`);

const repU = await call('PATCH', `/api/usuarios/${usr.id}/estado`, { token: T, body: { estado: 'activo' } });
check('reactivar usuario → 200 activo y vuelve a la lista por defecto', repU.status === 200 && repU.body?.activo === true
  && ids((await call('GET', '/api/usuarios?tamanoPagina=500', { token: T })).body).includes(String(usr.id)));
const l3 = await login(CORREO, CLAVE);
check('reactivado, vuelve a iniciar sesión', l3.status === 200 && !!l3.body?.token, l3.status);

const self = await call('PATCH', `/api/usuarios/${yo.id}/estado`, { token: T, body: { estado: 'inactivo' } });
check('un administrador NO puede deshabilitarse a sí mismo → 400', self.status === 400, `${self.status} ${self.body?.detail ?? ''}`);
const admins = items((await call('GET', '/api/usuarios?tamanoPagina=500', { token: T })).body).filter((u) => u.rol === 'ADMIN');
check('el sistema sigue con al menos un administrador activo (quien llama nunca queda deshabilitado)', admins.some((u) => String(u.id) === String(yo.id)), `${admins.length} admin(s) activo(s)`);
await call('PATCH', `/api/usuarios/${usr.id}/estado`, { token: T, body: { estado: 'inactivo' } }); // el usuario de prueba queda deshabilitado

// ---------------------------------------------------------------- Personas y zonas
console.log('\n== Personas ==');
const zona = (await call('POST', '/api/zonas-acceso', { token: T, body: { nombre: `ZZ Estados Zona ${R}`, nivelSeguridad: 'MEDIO', nivelRiesgo: 'MEDIO', capacidad: 10 } })).body;
const per = (await call('POST', '/api/personas', { token: T, body: { nombre: nombrePrueba(`ZZ Estados Persona ${R}`), dpiCodigo: dpiPrueba(), tipo: 1 } })).body;
const hoy = new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10);
const fin = new Date(Date.now() - 6 * 3600e3 + 30 * 86400e3).toISOString().slice(0, 10);
const perfil = (await call('POST', '/api/perfiles-acceso', { token: T, body: { personaId: +per.id, zonaId: +zona.id, vigenciaInicio: hoy, vigenciaFin: fin } })).body;
const cred = (await call('POST', `/api/credenciales/${per.id}/generar`, { token: T })).body;
check('(prep) zona, persona, perfil y credencial creados', !!zona?.id && !!per?.id && !!perfil?.id && cred?.estado === 'activa');
const registros = async () => (await call('GET', `/api/registros-acceso?personaId=${per.id}&tamanoPagina=1`, { token: T })).body?.total ?? -1;
const escanear = () => call('POST', '/api/registros-acceso', { token: T, body: { token: cred.qr, zonaId: +zona.id } });

const desP = await call('PATCH', `/api/personas/${per.id}/estado`, { token: T, body: { estado: 'inactivo' } });
check('deshabilitar persona → 200 inactivo', desP.status === 200 && desP.body?.estado === 'inactivo');
await listas('/api/personas', String(per.id), '?');
const antesP = await registros();
const eP = await escanear();
check('escaneo de persona deshabilitada → rojo PERSONA_INACTIVA', eP.status === 400 && eP.body?.code === 'PERSONA_INACTIVA', `${eP.status} ${eP.body?.code}`);
check('… y NO crea registro de acceso', (await registros()) === antesP, `${antesP} → ${await registros()}`);
const repP = await call('PATCH', `/api/personas/${per.id}/estado`, { token: T, body: { estado: 'activo' } });
const credsP = items((await call('GET', `/api/credenciales?personaId=${per.id}`, { token: T })).body);
check('reactivar persona → 200 activo', repP.status === 200 && repP.body?.estado === 'activo');
check('reactivar NO regenera ni revoca credenciales (la misma, activa)', credsP.length === 1 && credsP[0].id === cred.id && credsP[0].estado === 'activa', credsP.map((c) => `${c.id}:${c.estado}`).join(','));
const okP = await escanear();
check('reactivada, el escaneo vuelve a ser verde (INGRESO)', okP.status === 200 || okP.status === 201, okP.status);

console.log('\n== Zonas de acceso ==');
const desZ = await call('PATCH', `/api/zonas-acceso/${zona.id}/estado`, { token: T, body: { estado: 'inactivo' } });
check('deshabilitar zona → 200 inactivo', desZ.status === 200 && desZ.body?.estado === 'inactivo');
await listas('/api/zonas-acceso', String(zona.id), '?');
const antesZ = await registros();
const eZ = await escanear();
check('escaneo en zona deshabilitada → rojo con motivo claro', eZ.status === 400 && /inactiva/i.test(eZ.body?.detail ?? ''), `${eZ.status} ${eZ.body?.code}: ${eZ.body?.detail}`);
check('… y NO registra movimiento', (await registros()) === antesZ, `${antesZ} → ${await registros()}`);
const nuevoPerfil = await call('POST', '/api/perfiles-acceso', { token: T, body: { personaId: +per.id, zonaId: +zona.id, vigenciaInicio: hoy, vigenciaFin: fin } });
check('no se pueden crear perfiles nuevos en una zona deshabilitada → 400', nuevoPerfil.status === 400, `${nuevoPerfil.status} ${nuevoPerfil.body?.detail ?? ''}`);
const perfilesZ = items((await call('GET', `/api/perfiles-acceso?zonaId=${zona.id}`, { token: T })).body);
const histZ = (await call('GET', `/api/registros-acceso?zonaId=${zona.id}&tamanoPagina=10`, { token: T })).body;
check('los perfiles y registros antiguos de la zona se conservan', perfilesZ.some((p) => p.id === perfil.id) && (histZ?.total ?? 0) >= 1, `perfiles=${perfilesZ.length} registros=${histZ?.total}`);
check('el historial conserva el nombre de la zona deshabilitada', items(histZ).every((r) => r.zonaNombre === zona.nombre));
const repZ = await call('PATCH', `/api/zonas-acceso/${zona.id}/estado`, { token: T, body: { estado: 'activo' } });
check('reactivar zona → 200 y vuelve a la lista por defecto', repZ.status === 200 && ids((await call('GET', '/api/zonas-acceso', { token: T })).body).includes(String(zona.id)));
await call('PATCH', `/api/zonas-acceso/${zona.id}/estado`, { token: T, body: { estado: 'inactivo' } }); // no estorba al escáner

console.log('\n== Dashboard: solo activos, con el total real ==');
const activas = (await call('GET', '/api/personas?estado=activo&tamanoPagina=1', { token: T })).body?.total;
const todas = items((await call('GET', '/api/personas?estado=todos&tamanoPagina=500', { token: T })).body).filter((p) => p.estado === 'activo').length;
check('"Personas activas" = total del servidor con estado=activo', activas === todas, `${activas} = ${todas}`);

console.log(`\n${fallos === 0 ? '✓' : '✗'} ${total - fallos}/${total} comprobaciones correctas.`);
process.exit(fallos === 0 ? 0 : 1);
