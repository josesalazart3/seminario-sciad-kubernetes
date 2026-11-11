// Fase 7 — Cabeceras de seguridad y CSP estricta, probadas con NGINX REAL + Chromium + la app completa.
// Usa el nginx.conf del repo (solo se cambian root/listen/rutas temporales) y el backend simulado (tests-fase5).
// Requisitos: nginx instalado (apt install nginx), build en ../dist y `npm i` en ../tests-fase1. Linux/WSL.
process.env.TZ = 'America/Guatemala';
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { createBackend } from '../tests-fase5/mock-backend.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONT = path.resolve(HERE, '..');
const DIST = path.join(FRONT, 'dist/sciad-frontend/browser');
const TMP = path.join(HERE, '.tmp'); mkdirSync(TMP, { recursive: true });
const OUT = path.join(HERE, 'out'); mkdirSync(OUT, { recursive: true });
const PORT = 8097, BASE = `http://localhost:${PORT}`;
let pass = 0, fail = 0;
const check = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? '✓' : '✗ FALLO'} ${n}${x ? '  → ' + x : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const raw = (method, p, { headers = {}, body } = {}) => new Promise((res, rej) => { const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers }, (x) => { const b = []; x.on('data', (c) => b.push(c)); x.on('end', () => res({ status: x.statusCode, h: x.headers, body: Buffer.concat(b).toString('utf8') })); }); r.on('error', rej); if (body) r.write(body); r.end(); });

if (!existsSync(DIST)) throw new Error('Falta el build: ng build --configuration production');
try { execFileSync('nginx', ['-v'], { stdio: 'pipe' }); } catch { throw new Error('nginx no está instalado'); }

// backend simulado en :8080 (nginx.conf hace proxy_pass a http://backend:8080 → /etc/hosts)
const { server: back } = createBackend();
await new Promise((r) => back.listen(8080, '127.0.0.1', r));
const hosts = readFileSync('/etc/hosts', 'utf8'); if (!/\bbackend\b/.test(hosts)) writeFileSync('/etc/hosts', hosts + '\n127.0.0.1 backend\n');

const server = readFileSync(path.join(FRONT, process.env.NGINX_CONF ?? 'nginx.conf'), 'utf8').replace('listen       80;', `listen ${PORT};`).replace('root   /usr/share/nginx/html;', `root ${DIST};`);
writeFileSync(path.join(TMP, 'nginx.conf'), `pid ${TMP}/nginx.pid; error_log ${TMP}/err.log; daemon off;
events { worker_connections 64; }
http { include /etc/nginx/mime.types; access_log off; client_body_temp_path ${TMP}/b; proxy_temp_path ${TMP}/p; fastcgi_temp_path ${TMP}/f; uwsgi_temp_path ${TMP}/u; scgi_temp_path ${TMP}/s;
${server}
}`);
let okConf = true; try { execFileSync('nginx', ['-t', '-c', path.join(TMP, 'nginx.conf')], { stdio: 'pipe' }); } catch (e) { okConf = false; console.log(String(e.stderr)); }
check('nginx -t acepta el nginx.conf del repo', okConf);
const ng = spawn('nginx', ['-c', path.join(TMP, 'nginx.conf')], { stdio: 'ignore' });
await sleep(800);

console.log('\n[A] Cabeceras y CSP (nginx real)');
const i1 = await raw('GET', '/index.html'); const i2 = await raw('GET', '/seguridad/escaneo');
const csp = i1.h['content-security-policy'] ?? '';
const nonce = (/nonce-([a-f0-9]{32})/.exec(csp) ?? [])[1];
check('CSP presente con nonce de 128 bits', !!nonce, nonce);
check('el nonce de la cabecera coincide con el del HTML (app-root y script)', !!nonce && (i1.body.match(new RegExp(nonce, 'g')) ?? []).length >= 2 && !/__CSP_NONCE__/.test(i1.body), `${(i1.body.match(new RegExp(nonce ?? 'x', 'g')) ?? []).length} apariciones`);
const nonce2 = (/nonce-([a-f0-9]{32})/.exec(i2.h['content-security-policy'] ?? '') ?? [])[1];
check('el nonce cambia en cada petición (y también en rutas SPA)', !!nonce2 && nonce2 !== nonce);
check("CSP: default-src 'none', script-src 'self' (sin 'unsafe-inline'/'unsafe-eval'), object-src 'none', frame-ancestors 'none'",
  /default-src 'none'/.test(csp) && /script-src 'self';/.test(csp) && !/unsafe-(inline|eval)/.test(csp) && /object-src 'none'/.test(csp) && /frame-ancestors 'none'/.test(csp));
check("CSP: style-src solo 'self' + nonce (sin 'unsafe-inline')", /style-src 'self' 'nonce-[a-f0-9]{32}'/.test(csp));
check('HTML: Cache-Control no-store', /no-store/.test(i1.h['cache-control'] ?? '') && /no-store/.test(i2.h['cache-control'] ?? ''), i1.h['cache-control']);
for (const [n, v] of [['x-content-type-options', 'nosniff'], ['x-frame-options', 'DENY'], ['referrer-policy', 'no-referrer'], ['cross-origin-opener-policy', 'same-origin'], ['cross-origin-resource-policy', 'same-origin']])
  check(`HTML: ${n}: ${v}`, i1.h[n] === v, i1.h[n]);
check('Permissions-Policy: cámara solo del propio origen, el resto denegado', /camera=\(self\)/.test(i1.h['permissions-policy'] ?? '') && /microphone=\(\)/.test(i1.h['permissions-policy'] ?? '') && /geolocation=\(\)/.test(i1.h['permissions-policy'] ?? ''));
check('el servidor no revela su versión', !/\d/.test(i1.h['server'] ?? '') && !i1.h['x-powered-by'], i1.h['server']);
const api = await raw('GET', '/api/zonas-acceso');
check('/api/: Cache-Control no-store + Pragma no-cache', /no-store/.test(api.h['cache-control'] ?? '') && api.h['pragma'] === 'no-cache', api.h['cache-control']);
check('/api/: nosniff, DENY y sin Server con versión', api.h['x-content-type-options'] === 'nosniff' && api.h['x-frame-options'] === 'DENY' && !/\d/.test(api.h['server'] ?? ''));
const js = (i1.body.match(/main-[A-Za-z0-9_-]+\.js/) ?? [])[0];
const st = await raw('GET', '/' + js);
check('estático con hash: caché larga pública + nosniff (no contiene datos sensibles)', /immutable/.test(st.h['cache-control'] ?? '') && st.h['x-content-type-options'] === 'nosniff');
for (const p of ['/.git/config', '/.env', '/main.js.map', `/${js}.map`]) { const r = await raw('GET', p); check(`${p} → 404`, r.status === 404, String(r.status)); }
check('método TRACE → 405', (await raw('TRACE', '/')).status === 405);
check('cuerpo de /api mayor a 64 KB → 413', (await raw('POST', '/api/auth/login', { headers: { 'Content-Type': 'application/json', 'Content-Length': 70000 }, body: 'x'.repeat(70000) })).status === 413);
check('no hay secretos en el JavaScript de producción (contraseña/cuentas demo)', !readFileSync(path.join(DIST, js), 'utf8').includes('sciad123') && !/admin@sciad\.gt/.test(readFileSync(path.join(DIST, js), 'utf8')));

console.log('\n[B] La aplicación completa funciona bajo la CSP (0 violaciones)');
const apiCall = async (m, p, body, token) => { const r = await fetch(`${BASE}/api${p}`, { method: m, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch {} return j; };
const admin = (await apiCall('POST', '/auth/login', { email: 'admin@sciad.gt', password: 'sciad123' })).token;
const zona = await apiCall('POST', '/zonas-acceso', { nombre: 'Entrada', nivelSeguridad: 'MEDIO', nivelRiesgo: 'BAJO', capacidad: 10 }, admin);
const per = await apiCall('POST', '/personas', { nombre: 'Juan CSP', dpiCodigo: '2412300010101', tipo: 1 }, admin);
await apiCall('POST', '/perfiles-acceso', { personaId: +per.id, zonaId: +zona.id, vigenciaInicio: '2020-01-01', vigenciaFin: '2099-01-01' }, admin);
await apiCall('POST', `/credenciales/${per.id}/generar`, null, admin);

const nav = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH, headless: true } : { executablePath: await (await import('@sparticuz/chromium')).default.executablePath(), headless: 'shell' };
const y4m = path.join(FRONT, 'tests-fase1', 'fake_cam.y4m');
const browser = await puppeteer.launch({ ...nav, env: { ...process.env, TZ: 'America/Guatemala' }, args: ['--no-sandbox', '--disable-gpu', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', ...(existsSync(y4m) ? [`--use-file-for-fake-video-capture=${y4m}`] : [])] });
async function sesion(email, rutas, vp = { width: 1366, height: 800 }) {
  const pg = await browser.newPage(); await pg.setViewport(vp);
  const violaciones = [], errores = [];
  await pg.evaluateOnNewDocument(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ← ${e.blockedURI || 'inline'} ${String(e.sample || '').slice(0, 40)}`)); });
  pg.on('console', (m) => { if (/Content Security Policy|Refused to/.test(m.text())) violaciones.push(m.text().slice(0, 160)); });
  pg.on('pageerror', (e) => errores.push(String(e).slice(0, 120)));
  await pg.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
  await pg.type('sci-input input', email); await (await pg.$$('form input'))[1].type('sciad123'); await pg.click('form button');
  await pg.waitForFunction(() => !location.pathname.includes('/login'), { timeout: 15000 });
  for (const r of rutas) { await pg.goto(`${BASE}${r}`, { waitUntil: 'networkidle0' }); await sleep(500); const v = await pg.evaluate(() => window.__csp); violaciones.push(...v.map((x) => `${r}: ${x}`)); }
  return { pg, violaciones, errores };
}
const A = await sesion('admin@sciad.gt', ['/admin/dashboard', '/admin/usuarios', '/admin/personas', '/admin/zonas', '/admin/perfiles', '/admin/credenciales', '/admin/auditoria', '/admin/reportes', '/admin/accesos', '/admin/escaneo']);
check('Admin: 10 pantallas sin ninguna violación de CSP ni errores JS', A.violaciones.length === 0 && A.errores.length === 0, [...A.violaciones, ...A.errores].slice(0, 3).join(' | '));
const almacen = await A.pg.evaluate(() => ({ sess: !!sessionStorage.getItem('sciad.session'), loc: !!localStorage.getItem('sciad.session') }));
check('el JWT vive en sessionStorage y NO queda en localStorage (disco)', almacen.sess && !almacen.loc, JSON.stringify(almacen));
const estilos = await A.pg.evaluate(() => [...document.querySelectorAll('style')].every((s) => s.nonce || s.getAttribute('nonce') !== null));
check('los <style> de Angular llevan nonce', estilos);
const iconos = await A.pg.evaluate(() => [...document.querySelectorAll('sci-icon svg')].filter((s) => s.children.length).length);
check('los íconos se dibujan bajo la CSP', iconos > 3, `${iconos}`);
// credencial: QR (data:) y gafete (iframe con <style nonce>)
await A.pg.goto(`${BASE}/admin/credenciales`, { waitUntil: 'networkidle0' });
await A.pg.waitForSelector('button[aria-label="Ver"]'); await A.pg.click('button[aria-label="Ver"]');
const qrOk = await A.pg.waitForSelector('img.qr-img', { timeout: 8000 }).then(() => true).catch(() => false);
check('el QR (imagen data:) se muestra bajo la CSP', qrOk);
await A.pg.evaluate(() => { window.__ifr = []; const o = Node.prototype.appendChild; Node.prototype.appendChild = function (n) { const r = o.call(this, n); if (n.tagName === 'IFRAME') window.__ifr.push(n); return r; }; });
const [, bImp] = await A.pg.$$('.qr-actions button'); await bImp.click(); await sleep(1500);
const gaf = await A.pg.evaluate(() => { const d = window.__ifr[0]?.contentDocument; const b = d?.querySelector('.badge'); return b ? { borde: getComputedStyle(b).borderTopWidth, nombre: d.querySelector('.name')?.textContent } : null; });
check('el gafete impreso conserva su estilo (style con nonce dentro del iframe)', !!gaf && gaf.borde !== '0px' && gaf.nombre === 'Juan CSP', JSON.stringify(gaf));
check('sin violaciones de CSP al imprimir el gafete', (await A.pg.evaluate(() => window.__csp)).length === 0);
const S = await sesion('seguridad@sciad.gt', ['/seguridad/escaneo', '/seguridad/accesos'], { width: 390, height: 844, isMobile: true, hasTouch: true });
check('Seguridad (celular): escáner y accesos sin violaciones de CSP', S.violaciones.length === 0 && S.errores.length === 0, [...S.violaciones, ...S.errores].slice(0, 3).join(' | '));
const camara = await S.pg.waitForSelector('.viewport.live', { timeout: 8000 }).then(() => true).catch(() => false);
console.log(`  ℹ cámara simulada ${camara ? 'activa' : 'no disponible en este entorno (no afecta la CSP)'}`);
const G = await sesion('gerencia@sciad.gt', ['/gerencia/trazabilidad', '/gerencia/notificaciones', '/gerencia/reportes']);
check('Gerencia: 3 pantallas sin violaciones de CSP', G.violaciones.length === 0 && G.errores.length === 0, [...G.violaciones, ...G.errores].slice(0, 3).join(' | '));
await A.pg.screenshot({ path: path.join(OUT, 'csp_admin.png') });
await browser.close(); ng.kill(); back.close();
console.log(`\nRESULTADO: ${pass} ✓  ${fail} ✗`);
process.exit(fail ? 1 : 0);
