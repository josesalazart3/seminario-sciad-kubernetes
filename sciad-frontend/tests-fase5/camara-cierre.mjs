// ============================================================================
// SCIAD — Fase 8.5: la cámara se APAGA de verdad al salir de Escanear (luz apagada, pistas «ended», srcObject null).
// Cámara falsa de Chrome alimentada con un vídeo .y4m (tests-fase1/fake_cam.y4m). Se envuelve getUserMedia para
// registrar TODAS las pistas creadas (y, si se pide, retrasar su entrega y simular un permiso lento).
//
// Casos: 1) navegar a otra ruta · 2) ocultar la pestaña (visibilitychange) y volver · 3) botón «Apagar cámara»
//        · 4) recarga (F5) · 5) salir mientras getUserMedia aún está pendiente · 6) volver a Escanear = un solo flujo.
//
//   CHROME_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe" node camara-cierre.mjs
// ============================================================================
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { getToken } from '../../sciad-backend/token-store.mjs';

const BASE = (process.env.SCIAD_FRONT ?? 'http://localhost:8080').replace(/\/$/, '');
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const VIDEO = fileURLToPath(new URL('../tests-fase1/fake_cam.y4m', import.meta.url));
const ESCANEO = '/seguridad/escaneo', OTRA = '/seguridad/accesos';
let fallos = 0;
const check = (n, ok, d = '') => { if (!ok) fallos++; console.log(`  ${ok ? '✓' : '✗'} ${n}${d !== '' ? `  → ${d}` : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const token = await getToken('seguridad@sciad.gt');
const user = await (await fetch(`${BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })).json();

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${VIDEO}`],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await page.evaluateOnNewDocument((s) => {
  sessionStorage.setItem('sciad.session', JSON.stringify(s));
  // Registro de pistas: window.__tracks guarda cada MediaStreamTrack que la app recibe.
  window.__tracks = [];
  const md = navigator.mediaDevices;
  if (md?.getUserMedia) {
    const orig = md.getUserMedia.bind(md);
    md.getUserMedia = async (c) => {
      const stream = await orig(c);
      stream.getTracks().forEach((t) => window.__tracks.push(t)); // la luz ya está encendida
      const demora = Number(sessionStorage.getItem('__demoraGum') || 0);
      if (demora) await new Promise((r) => setTimeout(r, demora)); // permiso/arranque lento
      return stream;
    };
  }
}, { user, token });

const estado = () => page.evaluate(() => ({
  live: window.__tracks.filter((t) => t.readyState === 'live').length,
  ended: window.__tracks.filter((t) => t.readyState === 'ended').length,
  total: window.__tracks.length,
  srcObject: !!document.querySelector('video')?.srcObject,
}));
const esperarLive = () => page.waitForFunction(() => window.__tracks.some((t) => t.readyState === 'live') && !!document.querySelector('video')?.srcObject, { timeout: 15000 }).then(() => true, () => false);
const ocultar = (oculto) => page.evaluate((h) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
  document.dispatchEvent(new Event('visibilitychange'));
}, oculto);
/** Navegación interna (routerLink), como al tocar el menú: el enlace visible o, en móvil, el del menú plegado. */
const clicEnlace = (ruta) => page.evaluate((r) => { const as = [...document.querySelectorAll(`a[href="${r}"]`)]; (as.find((a) => a.offsetParent) ?? as[0]).click(); }, ruta);
const irPorMenu = async (ruta) => { await clicEnlace(ruta); await page.waitForFunction((r) => location.pathname === r, {}, ruta); };

console.log('\n[1] Salir de Escanear navegando a otra pantalla');
await page.goto(BASE + ESCANEO, { waitUntil: 'domcontentloaded' });
check('al entrar, hay una pista de vídeo «live» y el <video> la muestra', await esperarLive(), JSON.stringify(await estado()));
await page.evaluate(() => { window.__video = document.querySelector('video'); });
await irPorMenu(OTRA);
await sleep(300);
let e = await page.evaluate(() => ({ live: window.__tracks.filter((t) => t.readyState === 'live').length, estados: window.__tracks.map((t) => t.readyState), srcObject: window.__video?.srcObject ?? null }));
check('al salir, TODAS las pistas pasan a «ended» (luz apagada)', e.live === 0 && e.estados.every((s) => s === 'ended'), e.estados.join(','));
check('… y video.srcObject es null', e.srcObject === null);

console.log('\n[6] Volver a Escanear: un solo flujo (no se duplican)');
await irPorMenu(ESCANEO);
check('vuelve a abrir la cámara', await esperarLive());
await sleep(500);
e = await estado();
check('exactamente 1 pista «live»; las anteriores siguen «ended»', e.live === 1, JSON.stringify(e));

console.log('\n[2] Cambiar de pestaña del navegador (visibilitychange)');
await page.evaluate(() => { window.__video = document.querySelector('video'); });
await ocultar(true);
await sleep(300);
e = await page.evaluate(() => ({ live: window.__tracks.filter((t) => t.readyState === 'live').length, srcObject: window.__video.srcObject }));
check('pestaña oculta → 0 pistas «live» y srcObject null', e.live === 0 && e.srcObject === null, JSON.stringify(e));
await ocultar(false);
check('al volver a la pestaña (sigue en Escanear, sin resultado pendiente) se reinicia', await esperarLive());
await sleep(500);
e = await estado();
check('… con un solo flujo activo', e.live === 1, JSON.stringify(e));

console.log('\n[3] Botón «Apagar cámara»');
const apagar = await page.$$('button');
let boton = null;
for (const b of apagar) if (/Apagar cámara/.test(await b.evaluate((x) => x.textContent))) boton = b;
check('existe el botón «Apagar cámara»', !!boton);
if (boton) {
  await boton.click();
  await sleep(300);
  e = await estado();
  check('lo apaga de verdad: 0 pistas «live», srcObject null', e.live === 0 && !e.srcObject, JSON.stringify(e));
  await ocultar(true); await sleep(200); await ocultar(false); await sleep(1500);
  e = await estado();
  check('apagada a mano, NO se reenciende sola al volver a la pestaña', e.live === 0, JSON.stringify(e));
}

console.log('\n[4] Recarga (F5) en Escanear');
await page.goto(BASE + ESCANEO, { waitUntil: 'domcontentloaded' });
await esperarLive();
// El registro se hace al ocultar la página, DESPUÉS del manejador de la app (se agrega más tarde que el suyo).
await page.evaluate(() => window.addEventListener('pagehide', () => {
  localStorage.setItem('__alDescargar', JSON.stringify({ live: window.__tracks.filter((t) => t.readyState === 'live').length, srcObject: !!document.querySelector('video')?.srcObject }));
}));
await page.reload({ waitUntil: 'domcontentloaded' });
const alDescargar = JSON.parse(await page.evaluate(() => localStorage.getItem('__alDescargar')) ?? '{}');
check('al recargar, la página anterior apagó su cámara (0 «live», srcObject null en pagehide)', alDescargar.live === 0 && alDescargar.srcObject === false, JSON.stringify(alDescargar));
check('tras la recarga se abre de nuevo', await esperarLive());
await sleep(500);
e = await estado();
check('… con exactamente 1 pista «live»', e.live === 1, JSON.stringify(e));
await page.evaluate(() => localStorage.removeItem('__alDescargar'));

console.log('\n[5] Salir mientras la cámara aún se está iniciando (getUserMedia pendiente)');
await irPorMenu(OTRA);
await page.evaluate(() => sessionStorage.setItem('__demoraGum', '2000'));
await clicEnlace(ESCANEO);
await page.waitForFunction(() => window.__tracks.some((t) => t.readyState === 'live'), { timeout: 10000 }); // flujo obtenido, aún no entregado
const pendiente = await estado();
await irPorMenu(OTRA); // sale ANTES de que getUserMedia se resuelva para la app
await sleep(2600); // se resuelve después de salir
e = await page.evaluate(() => ({ live: window.__tracks.filter((t) => t.readyState === 'live').length, estados: window.__tracks.map((t) => t.readyState) }));
check('al resolverse tras salir, sus pistas se detienen de inmediato (0 «live»)', e.live === 0, `durante el arranque: live=${pendiente.live}; después: ${e.estados.join(',')}`);
await page.evaluate(() => sessionStorage.removeItem('__demoraGum'));

console.log('\n[5b] Ocultar la pestaña mientras la cámara se inicia');
await page.evaluate(() => sessionStorage.setItem('__demoraGum', '2000'));
await irPorMenu(ESCANEO);
await page.waitForFunction(() => window.__tracks.some((t) => t.readyState === 'live'), { timeout: 10000 });
await ocultar(true);
await sleep(2600);
e = await estado();
check('oculta durante el arranque → al resolverse no queda ninguna pista «live»', e.live === 0, JSON.stringify(e));
await page.evaluate(() => sessionStorage.removeItem('__demoraGum'));
await ocultar(false);
check('al volver a la pestaña se inicia normalmente', await esperarLive());
await sleep(500);
check('… con un solo flujo', (await estado()).live === 1, JSON.stringify(await estado()));

await browser.close();
console.log(fallos === 0 ? '\n✓ La cámara se libera en todos los casos.' : `\n✗ ${fallos} comprobación(es) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
