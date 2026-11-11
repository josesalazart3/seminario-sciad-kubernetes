// ============================================================================
// SCIAD — Fase 8: verificación de las validaciones de datos contra la API REAL.
// Casos de la sección 3.1 (DPI, nombre, tipo, duplicado) + correo, vigencia y caracteres de control.
// Termina con código de salida 1 si falla alguno.
//
//   node verify-validaciones.mjs                 (API en http://localhost:3000)
//   SCIAD_BASE=http://localhost:8080 node verify-validaciones.mjs
//
// No son pruebas unitarias a propósito (las unitarias deben seguir siendo 162, PG2_V2).
// Usa token-store.mjs para no gastar el límite de login (5 intentos / 5 min).
// ============================================================================
import { getToken } from './token-store.mjs';
import { dpiPrueba } from './datos-prueba.mjs';

const BASE = (process.env.SCIAD_BASE ?? 'http://localhost:3000').replace(/\/$/, '');
let fallos = 0, total = 0;

function check(nombre, ok, detalle = '') {
  total++;
  if (!ok) fallos++;
  console.log(`  ${ok ? '✓' : '✗'} ${nombre}${detalle ? `  → ${detalle}` : ''}`);
}

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

const T = await getToken('admin@sciad.gt');
const crear = (nombre, dpiCodigo, tipo = 1) => call('POST', '/api/personas', { token: T, body: { nombre, dpiCodigo, tipo } });
const detalle = (r) => `${r.status} ${r.body?.detail ?? ''}`.trim();

console.log('\n== DPI (13 dígitos, no todos iguales, departamento 01–22) ==');
for (const [dpi, motivo] of [
  ['1234567', '7 dígitos'],
  ['12345678901234', '14 dígitos'],
  ['12345678A1234', 'contiene una letra'],
  ['0000000000000', 'todos iguales'],
  ['1111111111111', 'todos iguales'],
  ['2412348829901', 'departamento 99'],
  ['2412348820001', 'departamento 00'],
  ['2412348822301', 'departamento 23'],
]) {
  const r = await crear('Prueba Validacion', dpi);
  check(`DPI ${dpi} (${motivo}) → 400`, r.status === 400, detalle(r));
}

// El DPI de ejemplo 2412348820101 (departamento 01) debe aceptarse. Si ya existe de una corrida anterior, se comprueba
// que existe y se prueba la creación válida con otro DPI nuevo (el script debe poder repetirse).
const DPI_EJEMPLO = '2412348820101';
const lista = await call('GET', '/api/personas?tamanoPagina=500&estado=todos', { token: T });
const ejemplo = (lista.body?.items ?? []).some((p) => p.dpiCodigo === DPI_EJEMPLO)
  ? null
  : await crear('Persona Ejemplo', DPI_EJEMPLO);
if (ejemplo) {
  check(`DPI ${DPI_EJEMPLO} (departamento 01) → 201`, ejemplo.status === 201, detalle(ejemplo));
} else {
  console.log(`  (el DPI ${DPI_EJEMPLO} ya existía de una corrida anterior)`);
  const r = await crear('Persona Ejemplo', dpiPrueba());
  check('DPI válido nuevo → 201', r.status === 201, detalle(r));
}
const dup = await crear('Persona Duplicada', DPI_EJEMPLO);
check(`mismo DPI ${DPI_EJEMPLO} otra vez → 409 "Ya existe una persona con ese DPI"`, dup.status === 409 && /Ya existe una persona con ese DPI/.test(dup.body?.detail ?? ''), detalle(dup));

const conGuiones = dpiPrueba();
const g = await crear('Persona Con Guiones', `${conGuiones.slice(0, 4)} ${conGuiones.slice(4, 9)}-${conGuiones.slice(9)}`);
check('DPI con espacios y guiones → 201 y se guardan solo los 13 dígitos', g.status === 201 && g.body?.dpiCodigo === conGuiones, `${g.status} ${g.body?.dpiCodigo}`);

if (g.body?.id) {
  const put14 = await call('PUT', `/api/personas/${g.body.id}`, { token: T, body: { nombre: 'Persona Con Guiones', dpiCodigo: '12345678901234', tipo: 1 } });
  check('PUT (editar) con DPI de 14 dígitos → 400', put14.status === 400, detalle(put14));
  const put12 = await call('PUT', `/api/personas/${g.body.id}`, { token: T, body: { nombre: 'Persona Con Guiones', dpiCodigo: '123456789012', tipo: 1 } });
  check('PUT (editar) con DPI de 12 dígitos → 400', put12.status === 400, detalle(put12));
}

console.log('\n== Nombre (3–120; letras, espacios, apóstrofo, punto, guion) ==');
const j0 = await crear('J0se', dpiPrueba());
check('nombre "J0se" → 400', j0.status === 400, detalle(j0));
const corto = await crear('Al', dpiPrueba());
check('nombre de 2 letras → 400', corto.status === 400, detalle(corto));
const simb = await crear('Ana <b>', dpiPrueba());
check('nombre con símbolos → 400', simb.status === 400, detalle(simb));
const largo = await crear('A'.repeat(121), dpiPrueba());
check('nombre de 121 caracteres → 400', largo.status === 400, detalle(largo));
const mj = await crear('  María   José  Pérez ', dpiPrueba());
check('nombre "  María   José  Pérez " → 201 y se guarda "María José Pérez"', mj.status === 201 && mj.body?.nombre === 'María José Pérez', `${mj.status} "${mj.body?.nombre}"`);
const ap = await crear("Ana O'Neil-Ruiz Jr.", dpiPrueba());
check('nombre con apóstrofo, guion y punto → 201', ap.status === 201, detalle(ap));

console.log('\n== La persona creada aparece de inmediato en la lista ==');
const despues = await call('GET', '/api/personas?tamanoPagina=500&estado=todos', { token: T });
const items = despues.body?.items ?? [];
check('GET /api/personas incluye a la recién creada', items.some((p) => p.id === mj.body?.id), `total=${despues.body?.total}`);
check('la más reciente va primero en la lista', items[0]?.id === ap.body?.id, `primera=${items[0]?.id} esperada=${ap.body?.id}`);

console.log('\n== Tipo ==');
for (const tipo of [0, 3, 99]) {
  const r = await crear('Prueba Tipo', dpiPrueba(), tipo);
  check(`tipo ${tipo} → 400`, r.status === 400, detalle(r));
}

console.log('\n== Texto libre: caracteres de control ==');
const ctl = await crear('Ana\u0007Lopez', dpiPrueba());
check('nombre con carácter de control → 400', ctl.status === 400, detalle(ctl));
const nul = await call('POST', '/api/zonas-acceso', { token: T, body: { nombre: 'a\u0000b', nivelSeguridad: 'MEDIO', nivelRiesgo: 'BAJO' } });
check('zona con NUL → 400', nul.status === 400, detalle(nul));

console.log('\n== Correo de usuario ==');
for (const correo of ['sin-arroba', 'a@b', 'a b@c.gt']) {
  const r = await call('POST', '/api/usuarios', { token: T, body: { nombre: 'Prueba Correo', correo, password: 'Clave-Segura-2026', rol: 'SEGURIDAD' } });
  check(`correo "${correo}" → 400`, r.status === 400, detalle(r));
}

console.log('\n== Vigencia del perfil de acceso ==');
const zonas = (await call('GET', '/api/zonas-acceso', { token: T })).body ?? [];
const zona = zonas.find((z) => z.estado === 'activo');
if (zona && mj.body?.id) {
  const perfil = (ini, fin) => call('POST', '/api/perfiles-acceso', { token: T, body: { personaId: +mj.body.id, zonaId: +zona.id, vigenciaInicio: ini, vigenciaFin: fin } });
  const inv = await perfil('2026-12-31', '2026-01-01');
  check('vigencia hasta < desde → 400', inv.status === 400, detalle(inv));
  const viejo = await perfil('2019-01-01', '2026-12-31');
  check('año 2019 → 400', viejo.status === 400, detalle(viejo));
  const lejano = await perfil('2026-01-01', '2101-01-01');
  check('año 2101 → 400', lejano.status === 400, detalle(lejano));
  const zx = await call('POST', '/api/perfiles-acceso', { token: T, body: { personaId: +mj.body.id, zonaId: 999999, vigenciaInicio: '2026-01-01', vigenciaFin: '2026-12-31' } });
  check('zona inexistente → 404', zx.status === 404, detalle(zx));
} else {
  check('hay una zona activa para probar la vigencia', false, 'no hay zonas activas');
}

console.log(`\n${fallos === 0 ? '✓' : '✗'} ${total - fallos}/${total} casos correctos.`);
process.exit(fallos === 0 ? 0 : 1);
