// ============================================================================
// SCIAD — Fase 8.2: el campo CUI/DPI de la interfaz (alta/edición de persona y búsqueda de Personas).
// No guarda nada: solo comprueba el comportamiento del campo en el navegador contra el stack de docker compose.
//
//   CHROME_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe" node campo-dpi.mjs
// ============================================================================
import puppeteer from 'puppeteer-core';
import { getToken } from '../../sciad-backend/token-store.mjs';

const BASE = (process.env.SCIAD_FRONT ?? 'http://localhost:8080').replace(/\/$/, '');
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
let fallos = 0;
const check = (n, ok, d = '') => { if (!ok) fallos++; console.log(`  ${ok ? '✓' : '✗'} ${n}${d !== '' ? `  → ${d}` : ''}`); };

const token = await getToken('admin@sciad.gt');
const user = await (await fetch(`${BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })).json();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const ctx = browser.defaultBrowserContext();
await ctx.overridePermissions(BASE, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
const page = await browser.newPage();
/** Vacía un campo como lo haría el usuario (evento input real) y espera el repintado. */
const pausa = () => new Promise((r) => setTimeout(r, 150));
const limpiar = async (el) => { await el.evaluate((e) => { e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); }); await pausa(); };
await page.evaluateOnNewDocument((s) => sessionStorage.setItem('sciad.session', JSON.stringify(s)), { user, token });
await page.goto(`${BASE}/admin/personas`, { waitUntil: 'networkidle0' });

console.log('\n[1] Formulario "Nueva persona" → campo Código DPI');
await page.click('.page-actions button[iconName="plus"], .page-actions button');
await page.waitForSelector('sci-modal form');
const [nombre, dpi] = await page.$$('sci-modal form sci-input input');
const valor = () => dpi.evaluate((e) => e.value);
const ayuda = () => page.$eval('sci-modal form sci-input:nth-of-type(2) .fld-foot', (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => '');
const guardarDeshabilitado = () => page.$eval('sci-modal button[type="submit"]', (b) => b.hasAttribute('disabled'));

check('inputmode="numeric"', (await dpi.evaluate((e) => e.getAttribute('inputmode'))) === 'numeric');
check('maxlength="13"', (await dpi.evaluate((e) => e.getAttribute('maxlength'))) === '13');
check('Guardar deshabilitado con el formulario vacío', await guardarDeshabilitado());

await dpi.type('12345678901234567890'); await pausa();
check('teclear 20 dígitos → solo quedan 13', (await valor()).length === 13, await valor());
check('contador n/13', /13\/13/.test(await ayuda()), await ayuda());

await limpiar(dpi);
await dpi.type('24a1b2-3 4'); await pausa();
check('letras, guiones y espacios no se escriben', (await valor()) === '241234', await valor());
check('contador 6/13', /6\/13/.test(await ayuda()), await ayuda());

await limpiar(dpi);
await dpi.evaluate((e) => {
  const dt = new DataTransfer(); dt.setData('text', '2412-34882-0101 9999');
  e.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
});
await pausa();
check('pegar "2412-34882-0101 9999" → 13 dígitos sin perder ninguno', (await valor()) === '2412348820101', await valor());

await nombre.type('María José Pérez'); await pausa();
await page.keyboard.press('Tab'); await pausa();
check('con nombre y DPI válidos, Guardar se habilita', !(await guardarDeshabilitado()));

await limpiar(dpi);
await dpi.type('2412348829901'); await pausa();
await page.keyboard.press('Tab'); await pausa();
check('DPI con departamento 99 → error en línea', /departamento/i.test(await ayuda()), await ayuda());
check('… y Guardar deshabilitado', await guardarDeshabilitado());

await limpiar(nombre);
await nombre.type('J0se'); await pausa();
await page.keyboard.press('Tab'); await pausa();
const errNombre = await page.$eval('sci-modal form sci-input:nth-of-type(1) .fld-error', (e) => e.textContent.trim()).catch(() => '');
check('nombre "J0se" → error en línea', /número/i.test(errNombre), errNombre);
await page.keyboard.press('Escape');
await page.$$eval('sci-modal button', (bs) => bs.find((b) => /Cancelar/.test(b.textContent))?.click());

console.log('\n[2] Búsqueda "Buscar por nombre o DPI"');
const buscar = await page.$('.search-input');
await buscar.type('12345678901234567'); await pausa();
const q = await buscar.evaluate((e) => e.value);
check('un DPI en la búsqueda no pasa de 13 dígitos', q.length === 13, q);
const contador = await page.$eval('.search-count', (e) => e.textContent.trim()).catch(() => '');
check('contador n/13 en la búsqueda', contador === '13/13', contador);
await limpiar(buscar);
await buscar.type('María Fernanda Cifuentes'); await pausa();
check('buscar por nombre sigue permitiendo texto largo', (await buscar.evaluate((e) => e.value)) === 'María Fernanda Cifuentes');

await browser.close();
console.log(fallos === 0 ? '\n✓ Campo DPI correcto.' : `\n✗ ${fallos} comprobación(es) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
