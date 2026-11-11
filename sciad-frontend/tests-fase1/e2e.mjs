// TZ: la prueba valida horas locales de Guatemala (portable, se fija antes de usar Date).
process.env.TZ = 'America/Guatemala';
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
mkdirSync(new URL('./out/', import.meta.url), { recursive: true }); // capturas de pantalla
import { createRequire } from 'node:module';
import os from 'node:os';
import { createServer } from './mock-server.mjs';
const require = createRequire(new URL('../package.json', import.meta.url));
const jsQR = require('jsqr'); const { PNG } = require('pngjs');

const PORT = 8099, BASE = `http://localhost:${PORT}`;
const { server, log, movs, TOK } = createServer();
await new Promise((r) => server.listen(PORT, '0.0.0.0', r));

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { (cond ? pass++ : fail++); console.log(`  ${cond ? '✓' : '✗ FALLO'} ${name}${extra ? '  → ' + extra : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, step = 150) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(step); } return null; };

// Navegador: CHROME_PATH (Chrome/Edge instalado; Windows/macOS/Linux) o, en Linux, Chromium vía npm (@sparticuz/chromium).
async function resolverNavegador() {
  if (process.env.CHROME_PATH) return { executablePath: process.env.CHROME_PATH, headless: true };
  if (process.platform !== 'linux') throw new Error('Define CHROME_PATH con la ruta de Chrome/Edge (p. ej. C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe).');
  const chromium = (await import('@sparticuz/chromium')).default;
  return { executablePath: await chromium.executablePath(), headless: 'shell' };
}
const nav = await resolverNavegador();
const browser = await puppeteer.launch({
  ...nav,
  env: { ...process.env, TZ: 'America/Guatemala' },
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
    '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
    `--use-file-for-fake-video-capture=${fileURLToPath(new URL('./fake_cam.y4m', import.meta.url))}`],
});
const mobile = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36';

async function login(page, base, email) {
  await page.goto(`${base}/login`, { waitUntil: 'networkidle0' });
  await page.type('input[type=email], input[formcontrolname=email], sci-input input', email);
  const inputs = await page.$$('form input');
  await inputs[1].type('sciad123');
  await page.click('form button.submit, form button[type=submit], form button');
}

// ───────────────────────── 1) ESCANEO CON CÁMARA (celular) ─────────────────────────
console.log('\n[1] Escaneo con cámara real (viewport de celular, cámara simulada)');
{
  const page = await browser.newPage(); await page.setViewport(mobile); await page.setUserAgent(UA);
  const errs = []; page.on('pageerror', (e) => errs.push(String(e))); page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await login(page, BASE, 'seguridad@sciad.gt');
  await page.waitForFunction(() => location.pathname.includes('/seguridad/escaneo'), { timeout: 10000 });
  check('login SEGURIDAD → /seguridad/escaneo', true);

  const live = await until(() => page.$('.viewport.live'), 12000);
  check('cámara activa (viewport.live) sin pulsar nada', !!live);
  const vsz = await page.evaluate(() => { const v = document.querySelector('video'); return v ? [v.videoWidth, v.videoHeight, !!v.srcObject] : null; });
  check('el <video> recibe fotogramas', vsz && vsz[0] > 0, JSON.stringify(vsz));
  const iconos = await page.$$eval('sci-icon svg', (n) => n.filter((s) => s.children.length > 0).length);
  check('los íconos de la app se dibujan (SVG con contenido)', iconos > 3, `íconos con contenido=${iconos}`);
  const zona = await page.$eval('#zona-sel', (e) => e.value);
  check('zona preseleccionada automáticamente', zona === '1', `zona=${zona}`);

  // 1.a QR válido → ingreso (exactamente UNA petición aunque el QR esté 6 s frente a la cámara)
  const ok1 = await until(() => page.$('.overlay.ok'), 45000);
  check('QR válido → alerta VERDE', !!ok1);
  if (ok1) {
    const t = await page.$eval('.overlay.ok', (e) => e.innerText);
    check('muestra persona y tipo INGRESO', /Juan Pérez López/.test(t) && /INGRESO/.test(t), t.replace(/\n/g, ' | '));
    const hh = await page.$eval('.overlay.ok .o-when', (e) => e.textContent.trim());
    const d = new Date(), exp = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const near = Math.abs((+hh.slice(0, 2) * 60 + +hh.slice(3)) - (d.getHours() * 60 + d.getMinutes())) <= 1;
    check('hora mostrada = hora LOCAL (UTC-6), no UTC', near && hh !== new Date().toISOString().slice(11, 16), `mostrada=${hh} local≈${exp} utc=${new Date().toISOString().slice(11, 16)}`);
    await page.screenshot({ path: 'out/shot_scan_ok.png' });
  }
  await sleep(5500); // el QR sigue frente a la cámara varios segundos
  const aPosts1 = log.filter((l) => l.token === TOK.A).length;
  check('NO se duplica el escaneo mientras el QR sigue visible (1 petición)', aPosts1 === 1, `peticiones=${aPosts1}`);

  // 1.b QR revocado → rojo
  const bad = await until(() => page.$('.overlay.bad'), 30000);
  check('QR revocado → alerta ROJA', !!bad);
  if (bad) {
    const t = await page.$eval('.overlay.bad', (e) => e.innerText);
    check('título "Credencial revocada"', /Credencial revocada/.test(t), t.replace(/\n/g, ' | '));
    await page.screenshot({ path: 'out/shot_scan_bad.png' });
  }

  // 1.c QR ajeno → "Código no reconocido" sin llamar al servidor
  const before = log.length;
  const alien = await until(async () => (await page.$$eval('.overlay.bad .o-title', (n) => n.map((x) => x.textContent))).some((x) => /Código no reconocido/.test(x)), 30000);
  check('QR ajeno → "Código no reconocido"', !!alien);
  check('QR ajeno NO genera petición al servidor', log.length === before, `peticiones nuevas=${log.length - before}`);

  // 1.d Reaparece el QR válido (>15 s después) → EGRESO
  const egreso = await until(async () => { const t = await page.$$eval('.overlay.ok', (n) => n.map((x) => x.innerText)); return t.find((x) => /EGRESO/.test(x)); }, 45000);
  check('al volver a presentar la credencial → EGRESO (alternancia del servidor)', !!egreso);

  const seq = log.map((l) => `${l.token === TOK.A ? 'A' : l.token === TOK.REV ? 'REV' : '?'}:${l.status}${l.tipo ? '/' + l.tipo : ''}`).join('  ');
  check('secuencia de peticiones exacta: A ingreso, REV 400, A egreso', seq === 'A:200/ingreso  REV:400  A:200/egreso', seq);
  const rec = await page.$$eval('.rec', (n) => n.length);
  check('lista "Últimos escaneos" registra los resultados', rec >= 3, `filas=${rec}`);
  check('sin errores de consola/JS', errs.length === 0, errs.slice(0, 2).join(' || '));
  await page.close();
}

// ───────────────────────── 2) CONTEXTO NO SEGURO (HTTP por IP de red) ─────────────────────────
console.log('\n[2] Cámara sobre HTTP en IP de red (contexto no seguro) → mensaje claro');
{
  const ip = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
  if (!ip) { console.log('  (sin IP de red en este entorno, se omite)'); }
  else {
    const page = await browser.newPage(); await page.setViewport(mobile); await page.setUserAgent(UA);
    await login(page, `http://${ip}:${PORT}`, 'seguridad@sciad.gt');
    await page.waitForFunction(() => location.pathname.includes('/seguridad/escaneo'), { timeout: 10000 });
    const secure = await page.evaluate(() => window.isSecureContext);
    const msg = await until(() => page.$eval('.cam-error', (e) => e.innerText).catch(() => null), 8000);
    check('isSecureContext=false en http://IP', secure === false, `ip=${ip}`);
    check('explica que se necesita HTTPS y ofrece alternativas', !!msg && /HTTPS/.test(msg) && /foto/.test(msg), msg && msg.replace(/\n/g, ' | '));
    const btn = await page.$$eval('.actions button', (b) => b.map((x) => x.innerText.trim()));
    check('botón "Reintentar cámara" disponible', btn.some((t) => /Reintentar/.test(t)), btn.join(','));
    await page.screenshot({ path: 'out/shot_insecure.png' });
    await page.close();
  }
}

// ───────────────────────── 3) ADMIN: QR real, descarga, gafete, escaneo en PC ─────────────────────────
console.log('\n[3] Administrador en escritorio: QR real + gafete + escáner');
{
  const page = await browser.newPage(); await page.setViewport({ width: 1366, height: 800 });
  await login(page, BASE, 'admin@sciad.gt');
  await page.waitForFunction(() => location.pathname.includes('/admin/'), { timeout: 10000 });
  await page.goto(`${BASE}/admin/credenciales`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('table.sci-table tbody tr td');
  const ver = (await page.$$('button[aria-label="Ver"]'))[0]; await ver.click();
  await page.waitForSelector('img.qr-img', { timeout: 8000 });
  const src = await page.$eval('img.qr-img', (i) => i.src);
  const png = PNG.sync.read(Buffer.from(src.split(',')[1], 'base64'));
  const dec = jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data;
  check('el modal muestra un QR REAL que decodifica exactamente al token', dec === TOK.A, `${dec?.slice(0, 12)}…`);
  const nota = await page.$eval('.qr-note', (e) => e.textContent);
  check('aclara que el QR no contiene datos personales', /no incluye datos personales/.test(nota));
  await page.screenshot({ path: 'out/shot_qr_modal.png' });

  // gafete: se arma el iframe de impresión con nombre + QR
  await page.evaluate(() => { window.__iframes = []; const orig = Node.prototype.appendChild; Node.prototype.appendChild = function (n) { const r = orig.call(this, n); if (n.tagName === 'IFRAME') window.__iframes.push(n); return r; }; });
  const [, btnImp] = await page.$$('.qr-actions button');
  await btnImp.click(); await sleep(1500);
  const gaf = await page.evaluate(() => { const f = window.__iframes[0]; const d = f?.contentDocument; return d ? { nombre: d.querySelector('.name')?.textContent, img: !!d.querySelector('img.qr')?.src.startsWith('data:image/png'), tipo: d.querySelector('.tipo')?.textContent } : null; });
  check('"Imprimir gafete" arma el gafete con nombre, tipo y QR', gaf && gaf.nombre === 'Juan Pérez López' && gaf.img, JSON.stringify(gaf));

  // credencial revocada: QR atenuado + sello + sin impresión
  await page.evaluate(() => document.querySelectorAll('button[aria-label="Ver"]')[1].click());
  await page.waitForSelector('.qr-stamp', { timeout: 5000 });
  const disabled = await page.$$eval('.qr-actions button', (b) => b[1].disabled);
  check('credencial revocada: sello "REVOCADA" y gafete deshabilitado', disabled === true);

  // el admin puede abrir el escáner en la PC
  await page.goto(`${BASE}/admin/escaneo`, { waitUntil: 'networkidle0' });
  const live = await until(() => page.$('.viewport.live'), 12000);
  check('Admin: /admin/escaneo abre la cámara de la computadora', !!live);
  const nav = await page.$$eval('.nav a', (a) => a.map((x) => x.innerText.trim()));
  check('menú de Admin incluye "Punto de acceso" y "Accesos de hoy"', nav.includes('Punto de acceso') && nav.includes('Accesos de hoy'), nav.join(' | '));
  await page.screenshot({ path: 'out/shot_admin_scan.png' });

  // pantallas con hora: muestran hora local
  await page.goto(`${BASE}/admin/accesos`, { waitUntil: 'networkidle0' });
  const h = await page.$$eval('.row-right .mono', (n) => n.map((x) => x.textContent.trim()).filter((t) => /\d\d:\d\d/.test(t)));
  const gtH = movs.at(-1)?.hora.slice(0, 5);                 // lo que guarda el backend (hora de Guatemala)
  const utcH = new Date().toISOString().slice(11, 16);        // hora UTC actual
  check('"Accesos de hoy" muestra la hora de Guatemala guardada (≠ UTC)', h.length > 0 && h[0] === gtH && h[0] !== utcH, `mostrada=${h[0]} guardada=${gtH} utc=${utcH}`);
  await page.close();
}

// ───────────────────────── 4) SESIÓN EXPIRADA ─────────────────────────
console.log('\n[4] Token vencido (401) → vuelve al login');
{
  const page = await browser.newPage(); await page.setViewport({ width: 1100, height: 800 });
  await login(page, BASE, 'expira@sciad.gt');
  const back = await page.waitForFunction(() => location.pathname === '/login' && !sessionStorage.getItem('sciad.session') && !localStorage.getItem('sciad.session'), { timeout: 10000 }).then(() => true).catch(() => false);
  check('401 en cualquier endpoint → sesión cerrada y redirige a /login', back);
  await page.close();
}

console.log(`\nRESULTADO: ${pass} ✓  ${fail} ✗`);
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
