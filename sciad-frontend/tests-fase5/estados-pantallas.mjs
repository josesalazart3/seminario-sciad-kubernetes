// ============================================================================
// SCIAD — Fase 8.4: pestañas Activos / Deshabilitados / Todos en Usuarios, Personas y Zonas de acceso (navegador real).
// Para cada pantalla: deshabilitar (con confirmación) → desaparece de Activos SIN recargar → aparece en Deshabilitados
// → Reactivar → vuelve a Activos. Además: F5 en cada pestaña carga los datos solo, conteos, URL y teclado (← →).
//
//   node verify-estados.mjs   (antes, en sciad-backend: deja los registros «ZZ Estados …» de prueba)
//   CHROME_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe" node estados-pantallas.mjs
// ============================================================================
import puppeteer from 'puppeteer-core';
import { getToken } from '../../sciad-backend/token-store.mjs';

const BASE = (process.env.SCIAD_FRONT ?? 'http://localhost:8080').replace(/\/$/, '');
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
let fallos = 0;
const check = (n, ok, d = '') => { if (!ok) fallos++; console.log(`  ${ok ? '✓' : '✗'} ${n}${d !== '' ? `  → ${d}` : ''}`); };

const token = await getToken('admin@sciad.gt');
const api = async (method, path, body) => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
  return r.json().catch(() => null);
};
const items = (b) => (Array.isArray(b) ? b : b?.items ?? []);
const user = await api('GET', '/auth/me');

// Registros de prueba de verify-estados.mjs (se activan aquí para empezar desde "Activos").
const usr = items(await api('GET', '/usuarios?estado=todos&tamanoPagina=500')).find((u) => u.email === 'zz-estados@sciad.gt');
const per = items(await api('GET', '/personas?estado=todos&tamanoPagina=500')).find((p) => p.nombre.startsWith('ZZ Estados Persona'));
const zon = items(await api('GET', '/zonas-acceso?estado=todos')).find((z) => z.nombre.startsWith('ZZ Estados Zona'));
if (!usr || !per || !zon) throw new Error('Faltan los registros «ZZ Estados …»: ejecute antes sciad-backend/verify-estados.mjs');
await api('PATCH', `/usuarios/${usr.id}/estado`, { estado: 'activo' });
await api('PATCH', `/personas/${per.id}/estado`, { estado: 'activo' });
await api('PATCH', `/zonas-acceso/${zon.id}/estado`, { estado: 'activo' });

const PANTALLAS = [
  { ruta: '/admin/usuarios', nombre: usr.nombre, singular: 'Usuario', fin: async () => api('PATCH', `/usuarios/${usr.id}/estado`, { estado: 'inactivo' }) },
  { ruta: '/admin/personas', nombre: per.nombre, singular: 'Persona' },
  { ruta: '/admin/zonas', nombre: zon.nombre, singular: 'Zona', fin: async () => api('PATCH', `/zonas-acceso/${zon.id}/estado`, { estado: 'inactivo' }) },
];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 900 });
await page.evaluateOnNewDocument((s) => sessionStorage.setItem('sciad.session', JSON.stringify(s)), { user, token });
const errores = [];
page.on('pageerror', (e) => errores.push(String(e).slice(0, 120)));

const pausa = (ms = 150) => new Promise((r) => setTimeout(r, ms));
const filas = () => page.$$eval('main table tbody tr:not(.sci-skel-row)', (trs) => trs.map((t) => t.innerText.replace(/\s+/g, ' ')));
const tieneFila = async (nombre) => (await filas()).some((t) => t.includes(nombre));
const pestana = () => page.$eval('[role="tab"][aria-selected="true"]', (b) => b.dataset.estado);
const conteos = () => page.$$eval('[role="tab"]', (bs) => Object.fromEntries(bs.map((b) => [b.dataset.estado, Number(b.querySelector('.count').textContent)])));
const listo = () => page.waitForFunction(() => !document.querySelector('main .sci-skel-row') && !!document.querySelector('main table tbody tr, main sci-empty-state'), { timeout: 5000 });
const esperarFila = (nombre, presente) => page.waitForFunction((n, p) => [...document.querySelectorAll('main table tbody tr')].some((t) => t.innerText.includes(n)) === p, { timeout: 5000 }, nombre, presente).then(() => true, () => false);

for (const P of PANTALLAS) {
  console.log(`\n${P.ruta}  («${P.nombre}»)`);
  const t0 = Date.now();
  await page.goto(BASE + P.ruta, { waitUntil: 'domcontentloaded' });
  await listo();
  check('F5 en «Activos»: los datos aparecen solos', (await pestana()) === 'activos' && (await tieneFila(P.nombre)), `${Date.now() - t0} ms`);
  const c0 = await conteos();
  check('conteos coherentes (Activos + Deshabilitados = Todos)', c0.activos + c0.deshabilitados === c0.todos, JSON.stringify(c0));

  // Deshabilitar con confirmación (sin recargar la página)
  await page.evaluate(() => { window.__sinRecargar = true; });
  await page.click(`main button[aria-label="Deshabilitar ${P.nombre}"]`);
  await page.waitForSelector('sci-confirm-dialog .msg');
  const msg = await page.$eval('sci-confirm-dialog .msg', (e) => e.textContent);
  check('pide confirmación con el nombre', msg.includes(P.nombre), msg.slice(0, 70) + '…');
  await page.click('sci-confirm-dialog button.confirmar');
  check('desaparece de «Activos» al instante', await esperarFila(P.nombre, false));
  const toast = await page.waitForFunction((s) => document.body.innerText.includes(`${s} deshabilitad`), { timeout: 3000 }, P.singular).then(() => true, () => false);
  check('aviso breve de éxito', toast);
  const c1 = await conteos();
  check('conteos actualizados (Activos −1, Deshabilitados +1)', c1.activos === c0.activos - 1 && c1.deshabilitados === c0.deshabilitados + 1, JSON.stringify(c1));
  check('sin recargar la página', await page.evaluate(() => window.__sinRecargar === true));

  // Pestaña Deshabilitados (clic) → está allí con su estado y "Reactivar"
  await page.click('[role="tab"][data-estado="deshabilitados"]');
  check('aparece en «Deshabilitados» con estado Inactivo', await esperarFila(P.nombre, true)
    && (await filas()).find((t) => t.includes(P.nombre)).toLowerCase().includes('inactiv'));
  check('la URL refleja la pestaña (?estado=inactivo)', page.url().includes('estado=inactivo'), page.url().replace(BASE, ''));
  check('tiene botón «Reactivar»', !!(await page.$(`main button[aria-label="Reactivar ${P.nombre}"]`)));

  // F5 en Deshabilitados
  const t1 = Date.now();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await listo();
  check('F5 en «Deshabilitados»: misma pestaña y datos solos', (await pestana()) === 'deshabilitados' && (await esperarFila(P.nombre, true)), `${Date.now() - t1} ms`);

  // Reactivar con confirmación
  await page.click(`main button[aria-label="Reactivar ${P.nombre}"]`);
  await page.waitForSelector('sci-confirm-dialog .msg');
  await page.click('sci-confirm-dialog button.confirmar');
  check('al reactivar sale de «Deshabilitados» al instante', await esperarFila(P.nombre, false));

  // Teclado: ← desde Deshabilitados → Activos (foco itinerante)
  await page.focus('[role="tab"][data-estado="deshabilitados"]');
  await page.keyboard.press('ArrowLeft');
  await pausa();
  const enfocada = await page.evaluate(() => document.activeElement?.dataset?.estado);
  check('teclado: ← mueve a «Activos» y le da el foco', (await pestana()) === 'activos' && enfocada === 'activos', `${await pestana()} / foco=${enfocada}`);
  check('vuelve a «Activos»', await esperarFila(P.nombre, true));

  // F5 en Todos
  const t2 = Date.now();
  await page.goto(`${BASE}${P.ruta}?estado=todos`, { waitUntil: 'domcontentloaded' });
  await listo();
  const c2 = await conteos();
  check('F5 en «Todos»: muestra activos y deshabilitados', (await pestana()) === 'todos' && (await filas()).length === c2.todos, `${(await filas()).length}/${c2.todos} filas, ${Date.now() - t2} ms`);

  if (P.fin) await P.fin();
}

console.log('\n[Estado vacío]');
await page.goto(`${BASE}/admin/zonas?estado=inactivo`, { waitUntil: 'domcontentloaded' });
await listo();
await page.evaluate(() => { const i = document.querySelector('.search-input'); i.value = 'zzz-no-existe'; i.dispatchEvent(new Event('input', { bubbles: true })); });
await pausa();
check('búsqueda sin resultados en una pestaña → estado vacío con mensaje', /No hay zonas que coincidan/.test(await page.$eval('main sci-empty-state', (e) => e.textContent)));
await page.goto(`${BASE}/admin/personas?estado=inactivo`, { waitUntil: 'domcontentloaded' });
await listo();
const vacio = await page.$('main sci-empty-state');
check('pestaña sin registros → "No hay personas deshabilitadas." (o la lista)', vacio
  ? /No hay personas deshabilitadas/.test(await vacio.evaluate((e) => e.textContent))
  : (await filas()).length > 0);

check('sin errores de JavaScript', errores.length === 0, errores.join(' | '));
await browser.close();
console.log(fallos === 0 ? '\n✓ Activos / Deshabilitados correcto en las 3 pantallas.' : `\n✗ ${fallos} comprobación(es) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
