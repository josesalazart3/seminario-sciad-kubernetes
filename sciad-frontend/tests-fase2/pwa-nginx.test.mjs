// Fase 2 — Levanta el build de Angular detrás de NGINX REAL usando el nginx.conf del repo
// (solo se cambian root/listen/rutas temporales), con un backend falso que devuelve 401,
// y comprueba cabeceras, manifest, íconos e instalabilidad con Chromium.
// Requisitos: nginx instalado en el sistema (apt install nginx), build en ../dist y `npm i` en ../tests-fase1.
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONT = path.resolve(HERE, '..');
const DIST = path.join(FRONT, 'dist/sciad-frontend/browser');
const TMP = path.join(HERE, '.tmp'); mkdirSync(TMP, { recursive: true });
const PORT = 8097;
let pass = 0, fail = 0;
const check = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? '✓' : '✗ FALLO'} ${n}${x ? '  → ' + x : ''}`); };
const get = (p, headers = {}) => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p, headers }, (r) => { let b = []; r.on('data', (c) => b.push(c)); r.on('end', () => res({ status: r.statusCode, h: r.headers, body: Buffer.concat(b) })); }).on('error', rej));

if (!existsSync(DIST)) throw new Error('Falta el build: ng build --configuration production');
try { execFileSync('nginx', ['-v'], { stdio: 'pipe' }); } catch { throw new Error('nginx no está instalado'); }

// backend falso en :8080 (el nginx.conf hace proxy_pass a http://backend:8080 → se resuelve por /etc/hosts)
const back = http.createServer((q, r) => { r.writeHead(401, { 'Content-Type': 'application/problem+json' }); r.end('{"code":"UNAUTHORIZED"}'); });
await new Promise((r) => back.listen(8080, '127.0.0.1', r));
const hosts = readFileSync('/etc/hosts', 'utf8'); if (!/\bbackend\b/.test(hosts)) writeFileSync('/etc/hosts', hosts + '\n127.0.0.1 backend\n');

// nginx.conf del repo → envuelto en un nginx.conf completo
let server = readFileSync(path.join(FRONT, 'nginx.conf'), 'utf8')
  .replace('listen       80;', `listen ${PORT};`).replace('root   /usr/share/nginx/html;', `root ${DIST};`);
const main = `pid ${TMP}/nginx.pid; error_log ${TMP}/err.log; daemon off;
events { worker_connections 64; }
http { include /etc/nginx/mime.types; access_log off;
  client_body_temp_path ${TMP}/b; proxy_temp_path ${TMP}/p; fastcgi_temp_path ${TMP}/f; uwsgi_temp_path ${TMP}/u; scgi_temp_path ${TMP}/s;
${server}
}`;
writeFileSync(path.join(TMP, 'nginx.conf'), main);
const t = (() => { try { execFileSync('nginx', ['-t', '-c', path.join(TMP, 'nginx.conf')], { stdio: 'pipe' }); return true; } catch (e) { console.log(String(e.stderr)); return false; } })();
check('nginx -t acepta el nginx.conf del repo', t);
const ng = spawn('nginx', ['-c', path.join(TMP, 'nginx.conf')], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));

console.log('\n[A] Cabeceras HTTP (nginx real)');
let r = await get('/manifest.webmanifest');
check('manifest: 200 y application/manifest+json', r.status === 200 && /application\/manifest\+json/.test(r.h['content-type']), `${r.status} ${r.h['content-type']}`);
check('manifest: Cache-Control no-cache', /no-cache/.test(r.h['cache-control'] ?? ''), r.h['cache-control']);
const man = JSON.parse(r.body.toString());
r = await get('/index.html');
check('index.html: sin caché (no-store) + Permissions-Policy cámara', /no-store|no-cache/.test(r.h['cache-control'] ?? '') && /camera=\(self\)/.test(r.h['permissions-policy'] ?? ''), `${r.h['cache-control']} | ${r.h['permissions-policy']}`);
check('index.html: conserva cabeceras de seguridad', r.h['x-content-type-options'] === 'nosniff' && r.h['x-frame-options'] === 'DENY');
r = await get('/seguridad/escaneo');
check('ruta SPA (/seguridad/escaneo) cae a index.html SIN caché', r.status === 200 && /<app-root/.test(r.body.toString()) && /no-store|no-cache/.test(r.h['cache-control'] ?? ''), r.h['cache-control']);
const js = readFileSync(path.join(DIST, 'index.html'), 'utf8').match(/main-[A-Za-z0-9_-]+\.js/)[0];
r = await get('/' + js);
check('asset con hash: caché larga immutable', /immutable/.test(r.h['cache-control'] ?? '') && r.status === 200, r.h['cache-control']);
r = await get('/chunk-INEXISTENTE.js');
check('asset viejo inexistente → 404 (no devuelve index.html)', r.status === 404, String(r.status));
r = await get('/api/zonas-acceso');
check('proxy /api/ llega al backend', r.status === 401 && /UNAUTHORIZED/.test(r.body.toString()), String(r.status));

console.log('\n[B] Manifest e íconos');
for (const ic of man.icons) {
  const f = await get(ic.src);
  const [w, h] = [f.body.readUInt32BE(16), f.body.readUInt32BE(20)];
  check(`ícono ${ic.src} (${ic.purpose}) existe y mide ${ic.sizes}`, f.status === 200 && f.h['content-type'] === 'image/png' && `${w}x${h}` === ic.sizes, `${f.status} ${w}x${h}`);
}
r = await get('/icons/apple-touch-icon.png');
check('apple-touch-icon 180x180', r.status === 200 && r.body.readUInt32BE(16) === 180);
check('manifest: standalone, start_url y theme_color', man.display === 'standalone' && man.start_url === '/' && man.theme_color === '#3b5bdb');

console.log('\n[C] Chromium reconoce el manifest');
const nav = process.env.CHROME_PATH
  ? { executablePath: process.env.CHROME_PATH, headless: true }
  : { executablePath: await (await import('@sparticuz/chromium')).default.executablePath(), headless: 'shell' };
const browser = await puppeteer.launch({ ...nav, args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage();
await page.goto(`http://localhost:${PORT}/login`, { waitUntil: 'networkidle0' });
const cdp = await page.createCDPSession();
const m = await cdp.send('Page.getAppManifest');
check('Chromium parsea el manifest sin errores', (m.errors ?? []).length === 0 && !!m.data, JSON.stringify(m.errors ?? []));
const ins = await cdp.send('Page.getInstallabilityErrors');
const ids = (ins.installabilityErrors ?? []).map((e) => e.errorId);
console.log('  ℹ errores de instalabilidad según Chromium:', ids.length ? ids.join(', ') : '(ninguno)');
const meta = await page.evaluate(() => ({ link: document.querySelector('link[rel=manifest]')?.getAttribute('href'), apple: document.querySelector('link[rel=apple-touch-icon]')?.getAttribute('href'), theme: document.querySelector('meta[name=theme-color]')?.content }));
check('index enlaza manifest, apple-touch-icon y theme-color', meta.link === 'manifest.webmanifest' && !!meta.apple && meta.theme === '#3b5bdb', JSON.stringify(meta));
await browser.close(); ng.kill(); back.close();
console.log(`\nRESULTADO: ${pass} ✓  ${fail} ✗`);
process.exit(fail ? 1 : 0);
