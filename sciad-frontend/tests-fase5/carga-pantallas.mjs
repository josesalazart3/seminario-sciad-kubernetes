// ============================================================================
// SCIAD — Fase 8.2: carga inmediata en TODAS las pantallas con datos (contra el stack real de docker compose).
//
// Para cada pantalla:
//   1. entra DIRECTO a la ruta (como F5) sin tocar nada y mide el tiempo hasta que se pintan los datos;
//   2. entra navegando por el menú lateral (como lo usa una persona) y vuelve a medir;
//   3. comprueba que no hay errores de consola y, en las tablas, que se pinta lo mismo que devuelve la API.
// Además simula una caída de la API (500) para comprobar el estado de error con "Reintentar".
//
//   cd sciad-frontend/tests-fase5 && npm install      (puppeteer-core, una vez)
//   CHROME_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe" node carga-pantallas.mjs
//
// Usa token-store.mjs (sin gastar el límite de login de 5 intentos / 5 min): la sesión se inyecta en sessionStorage.
// ============================================================================
import puppeteer from 'puppeteer-core';
import { getToken } from '../../sciad-backend/token-store.mjs';

const BASE = (process.env.SCIAD_FRONT ?? 'http://localhost:8080').replace(/\/$/, '');
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const LIMITE_MS = 5000;
let fallos = 0;
const check = (n, ok, d = '') => { if (!ok) fallos++; console.log(`  ${ok ? '✓' : '✗'} ${n}${d ? `  → ${d}` : ''}`); };

const CUENTAS = { ADMIN: 'admin@sciad.gt', SEGURIDAD: 'seguridad@sciad.gt', GERENCIA: 'gerencia@sciad.gt' };
const sesion = {};
for (const [rol, email] of Object.entries(CUENTAS)) {
  const token = await getToken(email);
  const user = await (await fetch(`${BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })).json();
  sesion[rol] = { user, token };
}
const api = async (path) => (await fetch(`${BASE}/api${path}`, { headers: { Authorization: `Bearer ${sesion.ADMIN.token}` } })).json();

// [rol, ruta, endpoint cuya cantidad debe coincidir con las filas pintadas (o null)]
const PANTALLAS = [
  ['ADMIN', '/admin/dashboard', null],
  ['ADMIN', '/admin/usuarios', async () => (await api('/usuarios?tamanoPagina=500')).items.length],
  ['ADMIN', '/admin/personas', async () => (await api('/personas?tamanoPagina=500')).items.length],
  ['ADMIN', '/admin/zonas', async () => (await api('/zonas-acceso')).length],
  ['ADMIN', '/admin/perfiles', async () => (await api('/perfiles-acceso')).length],
  ['ADMIN', '/admin/credenciales', async () => (await api('/credenciales')).length],
  ['ADMIN', '/admin/auditoria', null],
  ['ADMIN', '/admin/reportes', null],
  ['ADMIN', '/admin/escaneo', null],
  ['ADMIN', '/admin/accesos', null],
  ['SEGURIDAD', '/seguridad/escaneo', null],
  ['SEGURIDAD', '/seguridad/accesos', null],
  ['GERENCIA', '/gerencia/trazabilidad', null],
  ['GERENCIA', '/gerencia/notificaciones', null],
  ['GERENCIA', '/gerencia/reportes', null],
];

/** "Pintado" = sin esqueletos de carga y con contenido final (filas, estado vacío, error, zonas del escáner o KPIs). */
const listo = () => {
  const main = document.querySelector('main') ?? document.body;
  if (main.querySelector('.skel, .sci-skel-row, .skeleton-line')) return false;
  return !!main.querySelector('table tbody tr, sci-empty-state, sci-load-error, .event-list, .list > .row, .list > .item, .list > .note')
    || (main.querySelector('#zona-sel')?.options.length ?? 0) > 1;
};
const estado = (page) => page.evaluate(() => ({
  filas: document.querySelectorAll('main table tbody tr:not(.sci-skel-row)').length,
  vacio: !!document.querySelector('main sci-empty-state:not(sci-load-error sci-empty-state)'),
  error: document.querySelector('main sci-load-error')?.textContent?.trim() ?? null,
}));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
async function nuevaPagina(rol) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 900 });
  await page.evaluateOnNewDocument((s) => sessionStorage.setItem('sciad.session', JSON.stringify(s)), sesion[rol]);
  page.errores = [];
  page.on('console', (m) => { if (m.type() === 'error') page.errores.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => page.errores.push(String(e).slice(0, 160)));
  return page;
}
/** Tiempo desde la acción hasta que la ruta nueva está pintada (y, si se sabe, con todas las filas de la API). */
async function medir(page, accion, ruta, esperado) {
  const t0 = Date.now();
  await accion();
  try {
    await page.waitForFunction(`location.pathname === ${JSON.stringify(ruta)} && (${listo})() && (${esperado} === null
      || document.querySelectorAll('main table tbody tr:not(.sci-skel-row)').length === ${esperado})`, { timeout: LIMITE_MS, polling: 25 });
  } catch { return null; }
  return Date.now() - t0;
}

const tiempos = [];
console.log('\n[1] Entrada directa (F5) y por el menú, sin tocar nada');
for (const [rol, ruta, contar] of PANTALLAS) {
  console.log(`\n${ruta}`);
  const esperado = contar ? await contar() : null;

  const page = await nuevaPagina(rol);
  const msF5 = await medir(page, () => page.goto(BASE + ruta, { waitUntil: 'domcontentloaded' }), ruta, esperado);
  const e1 = await estado(page);
  check(`F5: datos pintados en ≤ ${LIMITE_MS} ms`, msF5 !== null && !e1.error, `${msF5 ?? '—'} ms, filas=${e1.filas}${e1.vacio ? ', estado vacío' : ''}${e1.error ? `, ERROR: ${e1.error}` : ''}`);
  if (esperado !== null) check('F5: se pintan todas las filas que devuelve la API', e1.filas === esperado, `${e1.filas}/${esperado}`);

  // Por el menú: se sale a otra pantalla del mismo rol y se vuelve con un clic en el enlace lateral.
  const otra = PANTALLAS.find(([r, u]) => r === rol && u !== ruta)[1];
  await page.goto(BASE + otra, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(listo, { timeout: LIMITE_MS }).catch(() => undefined);
  const enlace = await page.$(`a[href="${ruta}"]`);
  let msMenu = null, e2 = e1;
  if (enlace) {
    msMenu = await medir(page, () => enlace.click(), ruta, esperado);
    e2 = await estado(page);
    check(`menú: datos pintados en ≤ ${LIMITE_MS} ms`, msMenu !== null && !e2.error, `${msMenu ?? '—'} ms, filas=${e2.filas}`);
    if (esperado !== null) check('menú: se pintan todas las filas que devuelve la API', e2.filas === esperado, `${e2.filas}/${esperado}`);
  } else {
    console.log('  (sin enlace en el menú para esta ruta)');
  }
  check('sin errores en la consola', page.errores.length === 0, page.errores.join(' | '));
  tiempos.push({ Pantalla: ruta, 'F5 (ms)': msF5 ?? 'NO', 'Menú (ms)': enlace ? (msMenu ?? 'NO') : '—', Filas: e2.filas });
  await page.close();
}

console.log('\n[2] Estado de error visible con "Reintentar" (API simulada caída)');
{
  const page = await nuevaPagina('ADMIN');
  let caidas = 0;
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (new URL(req.url()).pathname === '/api/zonas-acceso' && req.method() === 'GET' && caidas === 0) {
      caidas++;
      return req.respond({ status: 500, contentType: 'application/json', body: '{}' });
    }
    return req.continue();
  });
  await page.goto(BASE + '/admin/zonas', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('main sci-load-error', { timeout: LIMITE_MS }).catch(() => undefined);
  const e = await estado(page);
  check('si la API falla se muestra el error (no una lista vacía)', !!e.error, e.error ?? 'sin mensaje');
  const boton = await page.$('main sci-load-error button');
  check('hay botón "Reintentar"', !!boton && /Reintentar/.test(await boton.evaluate((b) => b.textContent)));
  if (boton) {
    await boton.click();
    await page.waitForFunction(() => document.querySelectorAll('main table tbody tr').length > 0, { timeout: LIMITE_MS }).catch(() => undefined);
    const e2 = await estado(page);
    check('"Reintentar" vuelve a cargar y pinta los datos', e2.filas > 0 && !e2.error, `filas=${e2.filas}`);
  }
  await page.close();
}

await browser.close();
console.log('\nTiempo hasta que se pintan los datos:');
console.table(tiempos);
console.log(fallos === 0 ? '✓ Todas las pantallas cargan al entrar.' : `✗ ${fallos} comprobación(es) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
