// E2E REAL (Fase 5): navegador + cámara simulada contra el STACK REAL (nginx + backend .NET + PostgreSQL).
//
//   SCIAD_BASE=http://localhost:8080 node e2e-real.mjs        (por defecto)
//
// No depende de la demo: crea sus propios datos por la API (personas "ZZ E2E …"), así que se puede repetir el
// mismo día (el sistema permite un solo ingreso por persona y día). Al final da de baja lógica a esas personas.
// Escenarios que recorre la cámara: ingreso válido → perfil vencido → credencial revocada → sin perfil → egreso.
// Después comprueba en el backend: registros (fecha/hora de Guatemala), notificaciones y "accesos de hoy".
// Navegador: CHROME_PATH (Chrome/Edge) o, en Linux, Chromium vía npm (@sparticuz/chromium).
process.env.TZ = 'America/Guatemala';
import puppeteer from 'puppeteer-core';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(new URL('../package.json', import.meta.url));
const QRCode = require('qrcode');
const { PNG } = require('pngjs');
const BASE = (process.env.SCIAD_BASE ?? 'http://localhost:8080').replace(/\/$/, '');
const OUT = fileURLToPath(new URL('./out/', import.meta.url));
mkdirSync(OUT, { recursive: true });

let pass = 0, fail = 0;
const check = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? '✓' : '✗ FALLO'} ${n}${x ? '  → ' + x : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const gtNow = () => new Date(Date.now() - 6 * 3600e3);
const fechaGT = (d = 0) => new Date(Date.now() - 6 * 3600e3 + d * 86400e3).toISOString().slice(0, 10);

async function api(method, path, { token, body } = {}) {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch { /* sin cuerpo */ }
  return { status: r.status, body: j };
}
const items = (b) => (Array.isArray(b) ? b : b?.items ?? []);
async function login(email) { const r = await api('POST', '/auth/login', { body: { email, password: 'sciad123' } }); if (!r.body?.token) throw new Error(`login ${email}: HTTP ${r.status}. ¿Está el stack arriba en ${BASE}?`); return r.body.token; }

// ───────────── video de la cámara simulada (Y4M 320x240 a 10 fps), 100 % Node ─────────────
async function crearVideo(file, segs) {
  const W = 320, H = 240, FPS = 10, Q = 200;
  const frames = [];
  for (const s of segs) {
    let qr = null;
    if (s.token) { const png = PNG.sync.read(await QRCode.toBuffer(s.token, { errorCorrectionLevel: 'M', margin: 3, width: 220 })); qr = png; }
    for (let i = 0; i < s.sec * FPS; i++) {
      const rgb = Buffer.alloc(W * H * 3);
      for (let p = 0; p < W * H; p++) { rgb[p * 3] = 150; rgb[p * 3 + 1] = 155; rgb[p * 3 + 2] = 160; }
      if (qr) {
        const jx = Math.round(2 * Math.sin(i / 6)), ox = ((W - Q) >> 1) + jx, oy = (H - Q) >> 1;
        for (let y = 0; y < Q; y++) for (let x = 0; x < Q; x++) {
          const sx = Math.min(qr.width - 1, Math.floor((x * qr.width) / Q)), sy = Math.min(qr.height - 1, Math.floor((y * qr.height) / Q));
          const si = (sy * qr.width + sx) * 4, di = ((oy + y) * W + (ox + x)) * 3;
          rgb[di] = qr.data[si]; rgb[di + 1] = qr.data[si + 1]; rgb[di + 2] = qr.data[si + 2];
        }
      }
      for (let p = 0; p < rgb.length; p++) { const n = (Math.random() + Math.random() + Math.random() - 1.5) * 8; rgb[p] = Math.max(0, Math.min(255, rgb[p] + n)); } // ruido de sensor
      // RGB → YUV 4:2:0
      const Y = Buffer.alloc(W * H), U = Buffer.alloc((W / 2) * (H / 2)), V = Buffer.alloc((W / 2) * (H / 2));
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = (y * W + x) * 3; Y[y * W + x] = 0.299 * rgb[o] + 0.587 * rgb[o + 1] + 0.114 * rgb[o + 2]; }
      for (let y = 0; y < H / 2; y++) for (let x = 0; x < W / 2; x++) {
        let r = 0, g = 0, b = 0; for (const [dy, dx] of [[0, 0], [0, 1], [1, 0], [1, 1]]) { const o = ((2 * y + dy) * W + 2 * x + dx) * 3; r += rgb[o]; g += rgb[o + 1]; b += rgb[o + 2]; }
        r /= 4; g /= 4; b /= 4;
        U[y * (W / 2) + x] = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b; V[y * (W / 2) + x] = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      }
      frames.push(Buffer.from('FRAME\n'), Y, U, V);
    }
  }
  writeFileSync(file, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F${FPS}:1 Ip A1:1 C420jpeg\n`), ...frames]));
}

// ───────────── 1) Datos de prueba por la API ─────────────
console.log(`\nE2E REAL → ${BASE}\n\n[1] Preparación de datos por la API`);
const run = Date.now().toString().slice(-8);
// Fase 8: el nombre de persona no admite dígitos y el DPI es de 13 dígitos (departamento 01–22).
const alfa = (s) => String(s).replace(/\d/g, (d) => 'ABCDEFGHIJ'[d]);
const dpiDe = (k) => `${run}${'ABCD'.indexOf(k) + 1}0101`; // 8 + 1 + 4 = 13 dígitos, departamento 01
const admin = await login('admin@sciad.gt');
let zonas = items((await api('GET', '/zonas-acceso', { token: admin })).body);
let zona = zonas.find((z) => z.estado === 'activo');
if (!zona) zona = (await api('POST', '/zonas-acceso', { token: admin, body: { nombre: 'Zona E2E', nivelSeguridad: 'MEDIO', nivelRiesgo: 'MEDIO', capacidad: 50 } })).body;
console.log(`  zona de la prueba: ${zona.nombre} (id ${zona.id}) — es la que la pantalla preselecciona (primera activa)`);

const defs = [
  { k: 'A', nombre: `ZZ Prueba Valido ${alfa(run)}`, perfil: [-30, 365] },
  { k: 'B', nombre: `ZZ Prueba Vencido ${alfa(run)}`, perfil: [-400, -35] },
  { k: 'C', nombre: `ZZ Prueba Revocada ${alfa(run)}`, perfil: [-30, 365], revocar: true },
  { k: 'D', nombre: `ZZ Prueba SinPerfil ${alfa(run)}`, perfil: null },
];
const P = {};
for (const d of defs) {
  const per = (await api('POST', '/personas', { token: admin, body: { nombre: d.nombre, dpiCodigo: dpiDe(d.k), tipo: 1 } })).body;
  if (d.perfil) await api('POST', '/perfiles-acceso', { token: admin, body: { personaId: +per.id, zonaId: +zona.id, vigenciaInicio: fechaGT(d.perfil[0]), vigenciaFin: fechaGT(d.perfil[1]) } });
  const cred = (await api('POST', `/credenciales/${per.id}/generar`, { token: admin })).body;
  if (d.revocar) await api('POST', `/credenciales/${cred.id}/revocar`, { token: admin, body: { motivo: 'E2E' } });
  P[d.k] = { ...d, id: per.id, token: cred.qr }; // contenido del QR (sobre cifrado)
}
check('4 personas de prueba con credencial creadas (QR cifrado SCIAD1.…)', Object.values(P).every((x) => /^SCIAD1\.[A-Za-z0-9_-]{87}$/.test(x.token ?? '')),Object.values(P).map((x) => x.k + ':' + (x.token ?? '').slice(0, 6)).join(' '));

const video = join(tmpdir(), `sciad-e2e-real-${run}.y4m`);
await crearVideo(video, [
  { sec: 3 }, { token: P.A.token, sec: 6 }, { sec: 3 }, { token: P.B.token, sec: 6 }, { sec: 3 },
  { token: P.C.token, sec: 6 }, { sec: 3 }, { token: P.D.token, sec: 6 }, { sec: 3 }, { token: P.A.token, sec: 6 },
]);
console.log('  video de la cámara simulada generado (45 s: válido, vencido, revocado, sin perfil, válido)');

// ───────────── 2) Navegador + cámara ─────────────
async function nav() {
  if (process.env.CHROME_PATH) return { executablePath: process.env.CHROME_PATH, headless: true };
  if (process.platform !== 'linux') throw new Error('Define CHROME_PATH con la ruta de Chrome/Edge.');
  const chromium = (await import('@sparticuz/chromium')).default;
  return { executablePath: await chromium.executablePath(), headless: 'shell' };
}
const browser = await puppeteer.launch({ ...(await nav()), env: { ...process.env, TZ: 'America/Guatemala' },
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${video}`] });
console.log('\n[2] Escaneo con la cámara (celular simulado)');
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
check('login SIN cuentas demo visibles (build de producción)', (await page.$$('.demo-chip')).length === 0 && !/Cuentas de demostración/.test(await page.evaluate(() => document.body.innerText)));
await page.type('sci-input input', 'seguridad@sciad.gt');
await (await page.$$('form input'))[1].type('sciad123');
await page.click('form button');
await page.waitForFunction(() => location.pathname.includes('/seguridad/escaneo'), { timeout: 15000 });
check('login real de SEGURIDAD → /seguridad/escaneo', true);
check('cámara activa', !!(await page.waitForSelector('.viewport.live', { timeout: 15000 }).catch(() => null)));
const zonaSel = await page.$eval('#zona-sel', (e) => e.value);
check('la pantalla preselecciona la zona esperada', String(zonaSel) === String(zona.id), `ui=${zonaSel} esperada=${zona.id}`);

const esperado = [/Acceso autorizado.*INGRESO/, /Fuera de vigencia/, /Credencial revocada/, /Zona no autorizada/, /Acceso autorizado.*EGRESO/];
const etiquetas = ['válido → INGRESO (verde)', 'perfil vencido → "Fuera de vigencia" (rojo)', 'revocada → "Credencial revocada" (rojo)', 'sin perfil → "Zona no autorizada" (rojo)', 'válido otra vez → EGRESO (verde)'];
const vistos = []; let ultimo = ''; const t0 = Date.now();
while (Date.now() - t0 < 150000 && vistos.length < esperado.length) {
  const t = await page.evaluate(() => { const o = document.querySelector('.overlay'); return o ? o.innerText.replace(/\s+/g, ' ').trim() : ''; });
  if (t && t !== ultimo) { vistos.push(t); if (vistos.length === 1) await page.screenshot({ path: join(OUT, 'real_1_ingreso.png') }); if (vistos.length === 3) await page.screenshot({ path: join(OUT, 'real_3_revocada.png') }); }
  ultimo = t; await sleep(80);
}
esperado.forEach((re, i) => check(etiquetas[i], re.test(vistos[i] ?? ''), (vistos[i] ?? '(no apareció)').slice(0, 90)));
check('ningún QR de más: exactamente 5 resultados en el orden esperado', vistos.length === 5 && !vistos.some((v) => /no reconocido/i.test(v)), `${vistos.length} resultados`);

// ───────────── 3) Lo que quedó en el backend ─────────────
console.log('\n[3] Verificación en el backend real');
const hist = items((await api('GET', `/registros-acceso?personaId=${P.A.id}&tamanoPagina=50`, { token: admin })).body);
check('persona válida: 2 registros (ingreso y egreso)', hist.length === 2 && hist.some((h) => h.tipo === 'ingreso') && hist.some((h) => h.tipo === 'egreso'), hist.map((h) => `${h.tipo} ${h.fecha} ${h.hora}`).join(' | '));
const g = gtNow(); const hoyGT = g.toISOString().slice(0, 10);
check('fecha guardada = día de Guatemala (Fase 4)', hist.length > 0 && hist.every((h) => h.fecha === hoyGT), `guardada=${hist[0]?.fecha} esperada=${hoyGT}`);
const minGuardado = (h) => { const [hh, mm] = h.hora.split(':').map(Number); return hh * 60 + mm; };
const ahoraMin = g.getUTCHours() * 60 + g.getUTCMinutes();
check('hora guardada = hora de Guatemala (±3 min), no UTC', hist.length > 0 && hist.every((h) => Math.abs(minGuardado(h) - ahoraMin) <= 3 || Math.abs(minGuardado(h) - ahoraMin) >= 1437), `guardada=${hist[0]?.hora} guatemala≈${String(g.getUTCHours()).padStart(2, '0')}:${String(g.getUTCMinutes()).padStart(2, '0')}`);
for (const k of ['B', 'C', 'D']) { const h = items((await api('GET', `/registros-acceso?personaId=${P[k].id}&tamanoPagina=50`, { token: admin })).body); check(`persona ${k} (${P[k].nombre.split(' ')[2]}): 0 registros (rechazada)`, h.length === 0, `${h.length}`); }
const ger = await login('gerencia@sciad.gt');
const nots = items((await api('GET', '/notificaciones?tamanoPagina=500', { token: ger })).body);
check('Gerencia recibió "fuera_horario" por la persona de perfil vencido', nots.some((n) => n.tipo === 'fuera_horario' && (n.personaNombre ?? '').includes(P.B.nombre)));
check('Gerencia recibió "token_revocado" por la credencial revocada', nots.some((n) => n.tipo === 'token_revocado' && (n.personaNombre ?? '').includes(P.C.nombre)));

await page.goto(`${BASE}/seguridad/accesos`, { waitUntil: 'networkidle0' });
const txt = await page.evaluate(() => document.body.innerText);
check('"Accesos del turno" lista a la persona válida como fuera (egresó)', txt.includes(P.A.nombre) && /fuera/i.test(txt));
await page.screenshot({ path: join(OUT, 'real_accesos.png') });


// ───────────── 4) Recorrido por TODAS las pantallas (Admin y Gerencia) ─────────────
console.log('\n[4] Recorrido por las pantallas con datos reales (sin errores, tamaños de página válidos)');
async function recorrer(email, rutas) {
  const pg = await browser.newPage(); await pg.setViewport({ width: 1366, height: 800 });
  const problemas = [], paginas = [];
  pg.on('pageerror', (e) => problemas.push(`JS: ${String(e).slice(0, 100)}`));
  pg.on('response', (r) => { const u = r.url(); if (u.includes('/api/') && r.status() >= 400) problemas.push(`HTTP ${r.status()} ${u.replace(BASE, '')}`); });
  pg.on('request', (r) => { const u = new URL(r.url()); if (/\/api\/(registros-acceso|notificaciones|auditoria|reportes)$/.test(u.pathname) && u.searchParams.has('tamanoPagina')) paginas.push(Number(u.searchParams.get('tamanoPagina'))); });
  await pg.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
  await pg.type('sci-input input', email); await (await pg.$$('form input'))[1].type('sciad123'); await pg.click('form button');
  await pg.waitForFunction(() => !location.pathname.includes('/login'), { timeout: 15000 });
  const resultados = {};
  for (const r of rutas) {
    await pg.goto(`${BASE}${r}`, { waitUntil: 'networkidle0' }); await sleep(400);
    resultados[r] = await pg.evaluate(() => ({ h1: document.querySelector('h1')?.textContent?.trim() ?? '', texto: document.body.innerText }));
  }
  return { pg, problemas, paginas, resultados };
}
const adminRutas = ['/admin/dashboard', '/admin/usuarios', '/admin/personas', '/admin/zonas', '/admin/perfiles', '/admin/credenciales', '/admin/auditoria', '/admin/reportes', '/admin/accesos', '/admin/escaneo'];
const A = await recorrer('admin@sciad.gt', adminRutas);
check(`Admin: ${adminRutas.length} pantallas cargan sin errores JS ni respuestas ≥ 400`, A.problemas.length === 0, A.problemas.slice(0, 3).join(' | '));
check('Admin: todas las listas paginadas piden tamanoPagina ≤ 100 (el backend ignora lo mayor y devuelve 20)', A.paginas.length > 0 && A.paginas.every((n) => n >= 1 && n <= 100), `pedidos=${[...new Set(A.paginas)].join(',')}`);
const totalHoy = (await api('GET', `/registros-acceso?desde=${hoyGT}&hasta=${hoyGT}&tamanoPagina=1`, { token: admin })).body?.total;
const kpi = Number((/Accesos hoy\s*(\d+)/.exec(A.resultados['/admin/dashboard'].texto) ?? [])[1]);
check('Dashboard: KPI "Accesos hoy" = total real del servidor', Number.isFinite(kpi) && kpi === totalHoy, `kpi=${kpi} servidor=${totalHoy}`);
await A.pg.screenshot({ path: join(OUT, 'real_admin_dashboard.png') });
const G = await recorrer('gerencia@sciad.gt', ['/gerencia/trazabilidad', '/gerencia/notificaciones', '/gerencia/reportes']);
check('Gerencia: 3 pantallas cargan sin errores ni respuestas ≥ 400', G.problemas.length === 0, G.problemas.slice(0, 3).join(' | '));
check('Gerencia: tamaños de página ≤ 100', G.paginas.every((n) => n >= 1 && n <= 100), `pedidos=${[...new Set(G.paginas)].join(',')}`);

// ───────────── limpieza (baja lógica) ─────────────
for (const k of Object.keys(P)) await api('PATCH', `/personas/${P[k].id}/estado`, { token: admin, body: { estado: 'inactivo' } });
await browser.close();
console.log(`\nRESULTADO: ${pass} ✓  ${fail} ✗   (capturas en tests-fase5/out/)`);
process.exit(fail ? 1 : 0);
