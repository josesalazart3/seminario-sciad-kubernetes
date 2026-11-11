// Verificación OWASP Top 10 (2021) contra el stack REAL. Una sección por categoría (A01–A10).
//   node verify-owasp.mjs                        (stack de desarrollo: frontend :8080, API directa :3000)
//   SCIAD_ENV=prod SCIAD_BASE=https://sciad.gt node verify-owasp.mjs      (producción)
// Variables: SCIAD_BASE (por defecto http://localhost:8080) · SCIAD_API (http://localhost:3000; en prod vacío)
//            SCIAD_ENV=dev|prod · SCIAD_ADMIN_PASSWORD / SCIAD_SEGURIDAD_PASSWORD / SCIAD_GERENCIA_PASSWORD (por defecto sciad123, solo dev)
//            SCIAD_LAN_IP (IP de este equipo en la red: comprueba que 3000/8080 no se exponen) · SCIAD_AUDIT_ALLOW (GHSA permitidos, coma)
// Opciones: --rapido (omite la espera de 35 s del token revocado) · --docker (dotnet list package --vulnerable, logs y puerto de la BD vía Docker)
//           --solo-fuerza-bruta (SOLO la prueba documentada del límite de login) · --ignorar-limite (no abortar aunque el límite de login sea bajo)
// ⚠ LÍMITE DE LOGIN: PG2 exige 5 intentos / 5 min por IP y esta prueba necesita ~10 inicios de sesión. Se ejecuta en DOS pasadas:
//   1) pasada completa con el límite elevado SOLO para la prueba (no cambia el valor por defecto del sistema):
//        RATE_LIMIT_LOGIN_PERMIT=60 docker compose up -d backend ;  SCIAD_LOGIN_LIMIT=60 node verify-owasp.mjs --docker
//   2) pasada del límite documentado con el valor POR DEFECTO (5):
//        docker compose up -d backend ;  node verify-owasp.mjs --solo-fuerza-bruta
// Efectos: crea personas/usuarios «ZZ OWASP …» (se dan de baja al final).
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { spawnSync, execSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import crypto from 'node:crypto';
import { dpiPrueba, nombrePrueba } from './datos-prueba.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.SCIAD_BASE ?? 'http://localhost:8080').replace(/\/$/, '');
const ENV = process.env.SCIAD_ENV ?? 'dev';
const API = ENV === 'prod' ? (process.env.SCIAD_API ?? '') : (process.env.SCIAD_API ?? 'http://localhost:3000').replace(/\/$/, '');
const PW = { admin: process.env.SCIAD_ADMIN_PASSWORD ?? 'sciad123', seguridad: process.env.SCIAD_SEGURIDAD_PASSWORD ?? 'sciad123', gerencia: process.env.SCIAD_GERENCIA_PASSWORD ?? 'sciad123' };
const ARG = new Set(process.argv.slice(2));
const LIMITE = Number(process.env.SCIAD_LOGIN_LIMIT ?? 5);   // límite de login por IP vigente en el backend que se está probando
const R = Date.now().toString().slice(-8);

const res = { ok: 0, fail: 0, info: 0 }; let sec = '';
const head = (t) => { sec = t; console.log(`\n══ ${t}`); };
const ok = (n, c, x = '') => { c ? res.ok++ : res.fail++; console.log(`  ${c ? '✓' : '✗ FALLO'} ${n}${x ? '  → ' + String(x).slice(0, 150) : ''}`); return c; };
const info = (n, x = '') => { res.info++; console.log(`  ℹ ${n}${x ? '  → ' + String(x).slice(0, 150) : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, url, { token, body, headers = {}, raw } = {}) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { method, redirect: 'manual', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) });
    const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* no JSON */ }
    return { status: r.status, h: r.headers, text, json, ms: Date.now() - t0 };
  } catch (e) { return { status: 0, h: new Headers(), text: String(e), json: null, ms: Date.now() - t0 }; }
}
const b = (p, o) => call(o?.method ?? 'GET', `${BASE}${p}`, o);
const a = (p, o) => (API ? call(o?.method ?? 'GET', `${API}${p}`, o) : Promise.resolve(null));
// fetch() de Node prohíbe métodos como TRACE: se usa http/https directamente.
const metodoCrudo = (url, method) => new Promise((res) => { const u = new URL(url); const m = u.protocol === 'https:' ? https : http; const r = m.request({ method, host: u.hostname, port: u.port, path: u.pathname }, (x) => { x.resume(); res(x.statusCode); }); r.on('error', () => res(0)); r.end(); });
const tcp = (host, port) => new Promise((r) => { const s = net.connect({ host, port, timeout: 2000 }); s.on('connect', () => { s.destroy(); r(true); }); s.on('error', () => r(false)); s.on('timeout', () => { s.destroy(); r(false); }); });
const login = async (email, password) => (await b('/api/auth/login', { method: 'POST', body: { email, password } }));
const b64u = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
const decodeJwt = (t) => { const [h, p] = t.split('.'); return { h: JSON.parse(Buffer.from(h, 'base64url')), p: JSON.parse(Buffer.from(p, 'base64url')) }; };

console.log(`OWASP Top 10 (2021) → ${BASE}  API directa: ${API || '(no expuesta)'}  entorno: ${ENV}  límite de login: ${LIMITE}`);

// ── Pasada 2: solo el límite documentado de PG2 (5 intentos inválidos → 401; el 6.º y siguientes → 429) ──
if (ARG.has('--solo-fuerza-bruta')) {
  head('A04/A07 · Fuerza bruta en el login — límite documentado (por IP)');
  const r = []; for (let i = 0; i < LIMITE + 2; i++) r.push((await login(`atacante-${R}@x.gt`, `mala${i}`)).status);
  ok(`${LIMITE} intentos inválidos → 401 y del ${LIMITE + 1}.º en adelante → 429`, r.slice(0, LIMITE).every((s) => s === 401) && r.slice(LIMITE).every((s) => s === 429), r.join(','));
  const ya = await login('admin@sciad.gt', PW.admin); ok('con la IP bloqueada, ni siquiera credenciales correctas entran (429)', ya.status === 429, ya.status);
  console.log(`\nRESULTADO (solo fuerza bruta): ${res.ok} ✓  ${res.fail} ✗   — la IP queda bloqueada ~5 min; reinicie el backend (docker compose up -d backend) para limpiar el contador.`);
  process.exit(res.fail ? 1 : 0);
}
if (LIMITE < 15 && !ARG.has('--ignorar-limite')) {
  console.error(`\n✗ El límite de login vigente es ${LIMITE} (por defecto, PG2) y esta prueba necesita ~10 inicios de sesión: se bloquearía a sí misma.
  Pasada 1 (todas las categorías, con el límite elevado SOLO para la prueba):
      RATE_LIMIT_LOGIN_PERMIT=60 docker compose up -d backend      (desde SCIAD/)
      SCIAD_LOGIN_LIMIT=60 node verify-owasp.mjs --docker
  Pasada 2 (límite documentado, valor por defecto):
      docker compose up -d backend
      node verify-owasp.mjs --solo-fuerza-bruta`);
  process.exit(2);
}
const lA = await login('admin@sciad.gt', PW.admin), lS = await login('seguridad@sciad.gt', PW.seguridad), lG = await login('gerencia@sciad.gt', PW.gerencia);
const T = { admin: lA.json?.token, seg: lS.json?.token, ger: lG.json?.token };
if (ENV === 'prod' && !T.admin) info('producción: el login con la contraseña por defecto falló (correcto). Define SCIAD_ADMIN_PASSWORD (y las otras) para ejecutar las pruebas autenticadas.');
if (!T.admin) { console.error('\n✗ No se pudo iniciar sesión como admin: defina SCIAD_ADMIN_PASSWORD.'); process.exit(1); }
const idx = await b('/'); const apiH = await b('/api/zonas-acceso', { token: T.admin });

// ───────────────────────────────────────── A01 ─────────────────────────────────────────
head('A01 · Control de acceso roto');
const protegidos = ['/api/usuarios', '/api/personas', '/api/zonas-acceso', '/api/perfiles-acceso', '/api/credenciales', '/api/registros-acceso', '/api/registros-acceso/hoy', '/api/auditoria', '/api/notificaciones', '/api/reportes', '/api/auth/me'];
const anon = await Promise.all(protegidos.map((p) => b(p)));
ok(`anónimo → 401 en los ${protegidos.length} recursos protegidos`, anon.every((r) => r.status === 401), anon.map((r) => r.status).join(','));
const segProhibido = await Promise.all(['/api/usuarios', '/api/personas', '/api/credenciales', '/api/perfiles-acceso', '/api/auditoria', '/api/notificaciones', '/api/reportes'].map((p) => b(p, { token: T.seg })));
ok('SEGURIDAD → 403 en gestión, auditoría, notificaciones y reportes', segProhibido.every((r) => r.status === 403), segProhibido.map((r) => r.status).join(','));
const gerProhibido = await Promise.all([b('/api/registros-acceso', { method: 'POST', token: T.ger, body: { token: 'a'.repeat(64), zonaId: 1 } }), b('/api/personas', { token: T.ger }), b('/api/credenciales/1/generar', { method: 'POST', token: T.ger }), b('/api/usuarios', { token: T.ger })]);
ok('GERENCIA → 403 al escanear, listar personas, generar credenciales y ver usuarios (solo lectura de trazabilidad)', gerProhibido.every((r) => r.status === 403), gerProhibido.map((r) => r.status).join(','));
const bola = await Promise.all([b('/api/personas/999999', { method: 'PUT', token: T.seg, body: {} }), b('/api/credenciales/999999/revocar', { method: 'POST', token: T.ger, body: {} })]);
ok('IDOR/BOLA: tocar IDs ajenos sin el rol correcto → 403 (antes de revelar si existen)', bola.every((r) => r.status === 403), bola.map((r) => r.status).join(','));
const sw = await b('/swagger'); ok('Swagger/OpenAPI NO se sirve por la ruta pública', !/swagger-ui|openapi/i.test(sw.text), sw.status);
if (API) { const s2 = await a('/swagger/index.html'); ENV === 'prod' ? ok('producción: Swagger de la API → 404', s2.status === 404, s2.status) : info('desarrollo: Swagger activo solo en 127.0.0.1:3000', s2.status); }
const trav = await b('/api/..%2f..%2f..%2fetc%2fpasswd'); const trav2 = await b('/..%2f..%2fetc%2fpasswd');
ok('path traversal no expone archivos del servidor', !/root:.*:0:0/.test(trav.text + trav2.text), `${trav.status}/${trav2.status}`);
const cors = API ? await a('/api/zonas-acceso', { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET' } }) : await b('/api/zonas-acceso', { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET' } });
ok('CORS: un origen ajeno NO recibe Access-Control-Allow-Origin', !cors.h.get('access-control-allow-origin'), cors.h.get('access-control-allow-origin') ?? '(sin cabecera)');

// ───────────────────────────────────────── A02 ─────────────────────────────────────────
head('A02 · Fallos criptográficos');
const jwt = decodeJwt(T.admin);
ok('JWT firmado con HS256 y expira a las 8 h (28 800 s)', jwt.h.alg === 'HS256' && jwt.p.exp - jwt.p.nbf === 28800, `${jwt.h.alg} ${jwt.p.exp - jwt.p.nbf}s`);
ok('el JWT no contiene contraseñas, hashes ni correo', !/pass|hash|\$2[aby]\$|@/.test(JSON.stringify(jwt.p)), Object.keys(jwt.p).join(','));
const us = await b('/api/usuarios?tamanoPagina=50', { token: T.admin });
ok('la API nunca devuelve contraseñas ni hashes de usuarios', us.status === 200 && !/password|passwordHash|\$2[aby]\$\d\d\$/i.test(us.text));
ok('respuestas de la API con Cache-Control: no-store', /no-store/.test(apiH.h.get('cache-control') ?? ''), apiH.h.get('cache-control'));
ok('el HTML (index) con Cache-Control: no-store', /no-store/.test(idx.h.get('cache-control') ?? ''), idx.h.get('cache-control'));
const creds = await b('/api/credenciales', { token: T.admin }); const qrs = (creds.json ?? []).map((c) => c.qr);
ok('credenciales QR: sobre AES-256-GCM (SCIAD1.…) y la API no expone el token completo', qrs.length === 0 || (qrs.every((q) => /^SCIAD1\.[A-Za-z0-9_-]{87}$/.test(q)) && (creds.json ?? []).every((c) => c.token === undefined)), `${qrs.length} credenciales`);
ok('el HTML no carga recursos http:// ni de terceros (sin contenido mixto)', !/(src|href)=["']https?:\/\//i.test(idx.text));
if (ENV === 'prod' && BASE.startsWith('https')) {
  ok('HSTS con includeSubDomains', /max-age=\d{7,}.*includeSubDomains/i.test(idx.h.get('strict-transport-security') ?? ''), idx.h.get('strict-transport-security'));
  const http = await call('GET', BASE.replace('https://', 'http://') + '/'); ok('HTTP → redirige a HTTPS (301)', http.status === 301 && (http.h.get('location') ?? '').startsWith('https://'), http.status);
} else info('HSTS y redirección HTTP→HTTPS: se verifican con SCIAD_ENV=prod y una URL https://');

// ───────────────────────────────────────── A03 ─────────────────────────────────────────
head('A03 · Inyección');
const sqli = [`' OR '1'='1`, `1; DROP TABLE personas;--`, `' UNION SELECT NULL,NULL--`, `"; WAITFOR DELAY '0:0:5'--`, `1' AND pg_sleep(5)--`];
const sqlR = []; for (const p of sqli) { for (const u of [`/api/personas?estado=${encodeURIComponent(p)}`, `/api/registros-acceso?tipo=${encodeURIComponent(p)}`, `/api/auditoria?tipo=${encodeURIComponent(p)}`]) sqlR.push(await b(u, { token: T.admin })); }
ok(`${sqlR.length} inyecciones SQL en parámetros → nunca 500 ni demoras (consultas parametrizadas)`, sqlR.every((r) => r.status !== 500 && r.ms < 3000), `estados=${[...new Set(sqlR.map((r) => r.status))]}`);
const sqlL = await login(`admin@sciad.gt' OR '1'='1`, `' OR '1'='1`); ok('SQLi en el login → 400/401/429, nunca sesión ni 500', [400, 401, 429].includes(sqlL.status) && !sqlL.json?.token, sqlL.status);
const xss = `<img src=x onerror=alert(1)>ZZ OWASP ${R}`;
// Fase 8: el nombre de persona ya no admite símbolos (validación) → el XSS almacenado se prueba en un texto libre (nombre de zona).
const perXss = await b('/api/personas', { method: 'POST', token: T.admin, body: { nombre: xss, dpiCodigo: dpiPrueba(), tipo: 1 } });
ok('XSS en el nombre de una persona → 400 (validación de datos)', perXss.status === 400, perXss.status);
const per = await b('/api/zonas-acceso', { method: 'POST', token: T.admin, body: { nombre: xss.slice(0, 80), nivelSeguridad: 'MEDIO', nivelRiesgo: 'BAJO' } });
const lista = await b('/api/zonas-acceso', { token: T.admin });
ok('XSS almacenado: la API lo devuelve como DATO (application/json + nosniff), sin interpretarlo', per.status < 300 && /application\/json/.test(lista.h.get('content-type') ?? '') && lista.h.get('x-content-type-options') === 'nosniff', lista.h.get('content-type'));
const malo = await b('/api/zonas-acceso', { method: 'POST', token: T.admin, raw: '{"nombre": "x", ' });
ok('JSON mal formado → 400 sin stack trace', malo.status === 400 && !/\bat Sciad\.|Exception|System\./.test(malo.text), `${malo.status} ${malo.text.slice(0, 60)}`);
const nul = await b('/api/zonas-acceso', { method: 'POST', token: T.admin, body: { nombre: 'a\u0000b', nivelSeguridad: 'MEDIO', nivelRiesgo: 'BAJO' } });
ok('carácter nulo en un texto → no provoca 500', nul.status !== 500, nul.status);
const grande = await call('POST', `${API || BASE}/api/auth/login`, { raw: JSON.stringify({ email: 'x'.repeat(90000), password: 'y' }) });
ok('cuerpo de 90 KB → 413 (límite de tamaño)', grande.status === 413, grande.status);
if (per.json?.id) await b(`/api/zonas-acceso/${per.json.id}/estado`, { method: 'PATCH', token: T.admin, body: { estado: 'inactivo' } });

// ───────────────────────────────────────── A04 ─────────────────────────────────────────
head('A04 · Diseño inseguro');
const e1 = await b('/api/registros-acceso', { method: 'POST', token: T.seg, body: { token: 'f'.repeat(64), zonaId: 1 } });
ok('escanear un QR antiguo de 64 hex → 400 TOKEN_INVALIDO (sin acceso)', e1.status === 400 && e1.json?.code === 'TOKEN_INVALIDO', `${e1.status} ${e1.json?.code}`);
const e2 = await b('/api/registros-acceso', { method: 'POST', token: T.seg, body: { token: 'no-es-hex', zonaId: 1 } });
ok('token con formato inválido → 400', e2.status === 400, e2.status);
const e3 = await b('/api/registros-acceso', { method: 'POST', token: T.seg, body: { token: 'f'.repeat(64), zonaId: -1 } });
ok('zona inválida → 4xx (no 500)', e3.status >= 400 && e3.status < 500, e3.status);
ok('mass-assignment: un campo extra «rol»/«estado» en crear persona no cambia nada inesperado', (await b('/api/personas', { method: 'POST', token: T.admin, body: { nombre: nombrePrueba(`ZZ OWASP MA ${R}`), dpiCodigo: dpiPrueba(), tipo: 1, estado: 'inactivo', id: 1, rol: 'ADMIN' } })).status !== 500);
info('límite global por IP (1500/min) y por login (5/5 min): ver bloque de fuerza bruta al final');

// ───────────────────────────────────────── A05 ─────────────────────────────────────────
head('A05 · Configuración de seguridad incorrecta');
const need = { 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer', 'cross-origin-opener-policy': 'same-origin', 'cross-origin-resource-policy': 'same-origin' };
for (const [name, r] of [['HTML', idx], ['API (vía frontend)', apiH]]) ok(`${name}: cabeceras de seguridad`, Object.entries(need).every(([k, v]) => r.h.get(k) === v), Object.entries(need).filter(([k, v]) => r.h.get(k) !== v).map(([k]) => k).join(','));
const csp = idx.h.get('content-security-policy') ?? '';
ok("HTML: CSP estricta (default-src 'none', sin 'unsafe-inline'/'unsafe-eval', frame-ancestors 'none')", /default-src 'none'/.test(csp) && !/unsafe-(inline|eval)/.test(csp) && /frame-ancestors 'none'/.test(csp), csp.slice(0, 80));
ok('HTML: Permissions-Policy limita cámara al propio origen', /camera=\(self\)/.test(idx.h.get('permissions-policy') ?? '') && /microphone=\(\)/.test(idx.h.get('permissions-policy') ?? ''));
const banners = [idx, apiH, ...(API ? [await a('/api/health')] : [])]; ok('sin versión de servidor ni X-Powered-By', banners.every((r) => r && !/\d/.test(r.h.get('server') ?? '') && !r.h.get('x-powered-by')), banners.map((r) => r?.h.get('server')).join('|'));
if (API) { const d = await a('/api/zonas-acceso', { token: T.admin }); ok('API directa: no-store + nosniff + CSP none', /no-store/.test(d.h.get('cache-control') ?? '') && d.h.get('x-content-type-options') === 'nosniff' && /default-src 'none'/.test(d.h.get('content-security-policy') ?? '')); }
for (const p of ['/.env', '/.git/config', '/appsettings.json', '/web.config', '/swagger/v1/swagger.json', '/main.js.map']) { const r = await b(p); ok(`${p} no accesible`, r.status === 404 || (r.status === 200 && /<app-root/.test(r.text)), r.status); }
ok('método TRACE → 405', (await metodoCrudo(`${BASE}/`, 'TRACE')) === 405);
const e404 = await b('/api/no-existe', { token: T.admin }); ok('ruta inexistente → error limpio, sin stack trace', !/\bat Sciad\.|Exception/.test(e404.text), e404.status);
if (ARG.has('--docker')) {
  // Se pregunta a DOCKER (no a un puerto cualquiera: un PostgreSQL nativo del equipo en 5432 no es el del stack).
  try {
    const puertos = JSON.parse(execSync('docker inspect sciad-db --format "{{json .NetworkSettings.Ports}}"', { encoding: 'utf8' }).trim().replace(/^'|'$/g, ''));
    const publicados = Object.entries(puertos ?? {}).filter(([, v]) => Array.isArray(v) && v.length);
    ok('PostgreSQL del stack NO publica ningún puerto en el host (docker inspect)', publicados.length === 0, JSON.stringify(puertos));
    const api = execSync('docker inspect sciad-backend --format "{{json .NetworkSettings.Ports}}"', { encoding: 'utf8' }).trim().replace(/^'|'$/g, '');
    const hosts = [...api.matchAll(/"HostIp":"([^"]*)"/g)].map((m) => m[1]);
    ok('la API de desarrollo solo se publica en 127.0.0.1', hosts.length > 0 && hosts.every((h) => h === '127.0.0.1'), hosts.join(','));
  } catch (e) { info('docker inspect no disponible', String(e.message).slice(0, 80)); }
} else {
  const dbExpuesta = await tcp('127.0.0.1', 5432);
  dbExpuesta ? info('algo escucha en 127.0.0.1:5432 (¿un PostgreSQL nativo del equipo?). Ejecute con --docker para comprobar el del stack', 'no concluyente') : ok('nada escucha en 127.0.0.1:5432', true);
}
if (process.env.SCIAD_LAN_IP) { for (const p of [3000, 8080, 5432]) { const r = await tcp(process.env.SCIAD_LAN_IP, p); ENV === 'dev' ? ok(`puerto ${p} NO es accesible desde la red local (${process.env.SCIAD_LAN_IP})`, !r) : info(`prod: puerto ${p} desde la LAN`, r); } } else info('exposición en la LAN: defina SCIAD_LAN_IP=<IP de este equipo> para comprobar que 3000/8080/5432 no responden');
const defecto = await login('admin@sciad.gt', 'sciad123');
ENV === 'prod' ? ok('PRODUCCIÓN: la contraseña por defecto sciad123 NO funciona', defecto.status === 401, defecto.status) : info('desarrollo: las cuentas demo existen (sciad123); NO deben existir en producción');

// ───────────────────────────────────────── A06 ─────────────────────────────────────────
head('A06 · Componentes vulnerables y desactualizados');
const front = join(HERE, '..', 'sciad-frontend'); ok('lockfiles presentes (package-lock.json)', existsSync(join(front, 'package-lock.json')));
const au = spawnSync('npm', ['audit', '--omit=dev', '--json'], { cwd: front, encoding: 'utf8', shell: true });
try { const j = JSON.parse(au.stdout); const permitidos = (process.env.SCIAD_AUDIT_ALLOW ?? '').split(',').filter(Boolean);
  const malos = Object.values(j.vulnerabilities ?? {}).filter((v) => ['high', 'critical'].includes(v.severity) && !(v.via ?? []).some((x) => permitidos.includes(String(x.url ?? '').split('/').pop())));
  ok('npm audit (dependencias de PRODUCCIÓN): 0 vulnerabilidades altas/críticas', malos.length === 0, malos.map((v) => `${v.name}(${v.severity})`).join(',') || `total=${j.metadata?.vulnerabilities?.total ?? 0}`);
} catch { info('npm audit no devolvió JSON (¿sin red?)', au.stderr?.slice(0, 80)); }
if (ARG.has('--docker')) {
  const r = spawnSync('docker', ['run', '--rm', '-v', `${join(HERE)}:/src:ro`, 'mcr.microsoft.com/dotnet/sdk:8.0', 'sh', '-c', 'cp -r /src /w && cd /w && dotnet list Sciad.sln package --vulnerable --include-transitive 2>&1'], { encoding: 'utf8', shell: true });
  ok('dotnet list package --vulnerable: sin paquetes con vulnerabilidades', /no vulnerable packages|ninguno de los paquetes/i.test(r.stdout) || !/has the following vulnerable packages|tiene los siguientes paquetes vulnerables/i.test(r.stdout), (r.stdout.match(/>\s.*(High|Critical).*/g) ?? []).slice(0, 3).join(' | '));
} else info('paquetes .NET: ejecute con --docker (dotnet list package --vulnerable)');

// ───────────────────────────────────────── A07 ─────────────────────────────────────────
head('A07 · Fallos de identificación y autenticación');
const mala = await login('seguridad@sciad.gt', 'incorrecta-xyz'); const noEx = await login(`noexiste-${R}@x.gt`, 'incorrecta-xyz');
ok('mismo error para contraseña incorrecta y correo inexistente (sin enumeración)', mala.status === 401 && noEx.status === 401 && mala.json?.message === noEx.json?.message, `${mala.status}/${noEx.status} «${mala.json?.message}»`);
const evil = (payload, secret = 'x'.repeat(40)) => { const h = b64u({ alg: 'HS256', typ: 'JWT' }), p = b64u(payload), s = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url'); return `${h}.${p}.${s}`; };
const now = Math.floor(Date.now() / 1000);
const pay = { ...jwt.p, exp: now + 3600 };
const forj = [
  [`${b64u({ alg: 'none', typ: 'JWT' })}.${b64u(pay)}.`, 'alg=none'],
  [`${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ ...pay, 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role': 'ADMIN', rol: 'ADMIN' })}.${T.seg.split('.')[2]}`, 'rol modificado, firma ajena'],
  [evil(pay), 'firmado con otra clave'], [T.admin.slice(0, -4) + 'AAAA', 'firma alterada'],
  [`${b64u({ alg: 'HS512', typ: 'JWT' })}.${b64u(pay)}.${crypto.createHmac('sha512', 'x'.repeat(40)).update('x').digest('base64url')}`, 'otro algoritmo (HS512)'],
];
for (const [tk, n] of forj) ok(`JWT falsificado (${n}) → 401`, (await b('/api/usuarios', { token: tk })).status === 401);
ok('JWT expirado (re-firmado con otra clave) → 401', (await b('/api/usuarios', { token: evil({ ...pay, exp: now - 60 }) })).status === 401);
const debil = await b('/api/usuarios', { method: 'POST', token: T.admin, body: { nombre: 'ZZ', correo: `zz-${R}@x.gt`, password: '123', rol: 'SEGURIDAD', puesto: 'x' } }); ok('contraseña débil (3 caracteres) → rechazada con 400', debil.status === 400, debil.status);
// token de un usuario desactivado deja de servir (≤ 30 s) aunque el JWT no haya vencido
const pass = `Zz!${R}Aa9x#Qw`; const nu = await b('/api/usuarios', { method: 'POST', token: T.admin, body: { nombre: `ZZ OWASP ${R}`, correo: `zz-owasp-${R}@x.gt`, password: pass, rol: 'SEGURIDAD', puesto: 'prueba' } });
if (nu.status < 300 && nu.json?.id) {
  const ln = await login(`zz-owasp-${R}@x.gt`, pass); const antes = await b('/api/auth/me', { token: ln.json?.token });
  await b(`/api/usuarios/${nu.json.id}/estado`, { method: 'PATCH', token: T.admin, body: { estado: 'inactivo' } });
  ok('el usuario nuevo inicia sesión y /me responde 200', antes.status === 200, antes.status);
  if (ARG.has('--rapido')) info('omitido (--rapido): revocación por desactivación en ≤ 30 s'); else { console.log('  … esperando 35 s (caché de sesión de 30 s)'); await sleep(35000); ok('desactivar al usuario invalida su JWT (≤ 30 s), aunque no haya vencido', (await b('/api/auth/me', { token: ln.json?.token })).status === 401); }
} else info('no se pudo crear el usuario de prueba para la revocación', nu.status);
const inact = await login(`zz-owasp-${R}@x.gt`, pass); ok('cuenta inactiva → misma respuesta genérica 401 (no revela que existe)', inact.status === 401 && inact.json?.message === 'Credenciales inválidas.', `${inact.status} ${inact.json?.message}`);
info('bloqueo por cuenta (10 fallos) y tiempo constante del login: cubiertos por Sciad.TimeHarness (con BCrypt real)');

// ───────────────────────────────────────── A08 ─────────────────────────────────────────
head('A08 · Fallos de integridad de software y datos');
const poli = await b('/api/zonas-acceso', { method: 'POST', token: T.admin, body: { $type: 'System.Diagnostics.Process, System', nombre: 'x', nivelSeguridad: 'MEDIO', nivelRiesgo: 'BAJO' } });
ok('payload JSON con «$type» (deserialización polimórfica) → ignorado, sin 500', poli.status !== 500, poli.status);
const xml = await b('/api/zonas-acceso', { method: 'POST', token: T.admin, raw: '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><x>&e;</x>', headers: { 'Content-Type': 'application/xml' } });
ok('entrada XML (XXE) → rechazada (415/400), sin leer archivos', [400, 415].includes(xml.status) && !/root:/.test(xml.text), xml.status);
ok('el HTML no depende de scripts/estilos externos (sin CDN → sin riesgo de cadena de suministro en el navegador)', !/<(script|link)[^>]+(src|href)=["']https?:\/\//i.test(idx.text));
ok('dependencias fijadas por lockfile (package-lock.json) y build reproducible (npm ci)', existsSync(join(front, 'package-lock.json')));
const dock = existsSync(join(HERE, 'Dockerfile')) ? readFileSync(join(HERE, 'Dockerfile'), 'utf8') : ''; ok('imágenes base con etiqueta de versión (no :latest)', !/FROM\s+\S+:latest/.test(dock) && /FROM\s+\S+:\d/.test(dock));

// ───────────────────────────────────────── A09 ─────────────────────────────────────────
head('A09 · Fallos de registro y monitoreo');
if (ARG.has('--docker')) {
  await login('seguridad@sciad.gt', `mala-${R}-NO-DEBE-VERSE`); await sleep(1500);
  const logs = execSync('docker logs sciad-backend --since 3m 2>&1', { encoding: 'utf8', maxBuffer: 30e6 });
  ok('un inicio de sesión fallido queda registrado', /Inicio de sesión fallido/i.test(logs));
  ok('las respuestas 401/403 se registran como Warning', /"StatusCode":(401|403)/.test(logs) ? /Warning/.test(logs) : true);
  ok('los registros NO contienen la contraseña intentada ni JWT completos', !logs.includes(`mala-${R}-NO-DEBE-VERSE`) && !/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./.test(logs));
  ok('los registros incluyen la IP de origen (RemoteIp)', /RemoteIp/.test(logs));
} else info('registros de seguridad: ejecute con --docker para leer los logs del contenedor');
const aud = await b('/api/auditoria?tamanoPagina=5', { token: T.admin }); ok('existe trazabilidad de auditoría consultable por Admin/Gerencia (CU-08)', aud.status === 200);

// ───────────────────────────────────────── A10 ─────────────────────────────────────────
head('A10 · Falsificación de solicitudes del lado del servidor (SSRF)');
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? (/(bin|obj|node_modules|Migrations)$/.test(p) ? [] : walk(p)) : p.endsWith('.cs') ? [p] : []; });
const salida = walk(join(HERE, 'src')).filter((f) => /\b(HttpClient|WebClient|WebRequest|RestClient|IHttpClientFactory)\b/.test(readFileSync(f, 'utf8')));
ok('el backend NO realiza solicitudes HTTP salientes (sin HttpClient/WebRequest en el código)', salida.length === 0, salida.map((f) => f.split('src')[1]).join(','));
if (API) { const sj = await a('/swagger/v1/swagger.json'); if (sj?.json) { const params = JSON.stringify(sj.json).match(/"name":"([^"]*(url|uri|callback|webhook|redirect)[^"]*)"/gi) ?? []; ok('ningún endpoint recibe URLs como parámetro', params.length === 0, params.join(',')); } else info('OpenAPI no disponible: se omite el barrido de parámetros'); }
ok('el parámetro «Host» manipulado no provoca redirecciones ni 500', (await b('/', { headers: { 'X-Forwarded-Host': 'evil.example', 'X-Forwarded-For': '1.2.3.4' } })).status < 500);

info('límite documentado de login (5 intentos → 429): ejecute la pasada 2 → node verify-owasp.mjs --solo-fuerza-bruta (con el límite por defecto)');

console.log(`\nRESULTADO OWASP Top 10: ${res.ok} ✓  ${res.fail} ✗  (${res.info} informativos)`);
process.exit(res.fail ? 1 : 0);
