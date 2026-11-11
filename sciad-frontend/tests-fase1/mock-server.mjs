// Servidor simulado que respeta el CONTRATO real del backend (DTOs, Problem Details con code/detail,
// alternancia ingreso/egreso, 409 por UNIQUE, 401 por token expirado). Sirve además el build de Angular.
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOK = JSON.parse(readFileSync(new URL('./tokens.json', import.meta.url)));
const DIST = fileURLToPath(new URL('../dist/sciad-frontend/browser', import.meta.url));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

export function createServer() {
  const log = [];            // POST /registros-acceso recibidos: {token, status, code, tipo}
  const movs = [];           // movimientos persistidos
  const zonas = [
    { id: '1', nombre: 'Entrada Principal', nivelSeguridad: 'MEDIO', capacidad: 50, nivelRiesgo: 'BAJO', estado: 'activo' },
    { id: '2', nombre: 'Sala de Servidores', nivelSeguridad: 'ALTO', capacidad: 5, nivelRiesgo: 'ALTO', estado: 'activo' },
  ];
  const persona = { id: '7', nombre: 'Juan Pérez López', dpiCodigo: '2345678900101', tipo: 1, estado: 'activo' };
  const creds = [
    { id: '1', personaId: '7', personaNombre: persona.nombre, dpiCodigo: persona.dpiCodigo, tokenCorto: 'c0ffee01', qr: TOK.A, estado: 'activa', emitido: '2026-08-21', motivo: null, reemitidoDe: null },
    { id: '2', personaId: '7', personaNombre: persona.nombre, dpiCodigo: persona.dpiCodigo, tokenCorto: 'deadbe01', qr: TOK.REV, estado: 'revocada', emitido: '2026-08-01', motivo: 'Pérdida', reemitidoDe: null },
  ];
  const users = {
    'admin@sciad.gt': { rol: 'ADMIN', nombre: 'Lic. Marco Antonio Ortíz', token: 'ok.jwt' },
    'seguridad@sciad.gt': { rol: 'SEGURIDAD', nombre: 'Carlos Gómez Rivera', token: 'ok.jwt' },
    'expira@sciad.gt': { rol: 'ADMIN', nombre: 'Sesión Vencida', token: 'expired.jwt' },
  };
  const problem = (res, status, code, detail) => {
    res.writeHead(status, { 'Content-Type': 'application/problem+json' });
    res.end(JSON.stringify({ status, title: 'x', detail, code, message: detail }));
  };
  const json = (res, obj, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  const page = (items) => ({ items, total: items.length, pagina: 1, tamanoPagina: 500, totalPaginas: 1 });
  const body = (req) => new Promise((r) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => r(d ? JSON.parse(d) : {})); });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/')) {
      const auth = req.headers.authorization ?? '';
      const p = url.pathname;
      if (p === '/api/auth/login' && req.method === 'POST') {
        const { email, password } = await body(req);
        const u = users[email];
        if (!u || password !== 'sciad123') return problem(res, 401, 'UNAUTHORIZED', 'Credenciales inválidas.');
        return json(res, { token: u.token, user: { id: '1', nombre: u.nombre, email, rol: u.rol, puesto: 'x', activo: true, avatarInitials: 'XX', fechaCreacion: new Date().toISOString() } });
      }
      if (!auth.startsWith('Bearer ') || auth.includes('expired')) return problem(res, 401, 'UNAUTHORIZED', 'Token ausente, inválido o expirado.');
      if (p === '/api/zonas-acceso') return json(res, zonas);
      if (p === '/api/personas') return json(res, page([persona]));
      if (p === '/api/credenciales' && req.method === 'GET') return json(res, creds);
      if (p === '/api/notificaciones') return json(res, page([]));
      if (p === '/api/registros-acceso/hoy') {
        const rows = [];
        for (const m of movs) { const last = movs.filter((x) => x.personaId === m.personaId).at(-1); if (m === last) rows.push({ personaId: +m.personaId, personaNombre: persona.nombre, zonaId: +m.zonaId, zonaNombre: zonas[+m.zonaId - 1].nombre, ultimoTipo: m.tipo, ultimaHora: m.hora, dentro: m.tipo === 'ingreso' }); }
        return json(res, rows);
      }
      if (p === '/api/registros-acceso' && req.method === 'GET') {
        return json(res, page(movs.map((m, i) => ({ id: String(i + 1), personaId: +m.personaId, personaNombre: persona.nombre, zonaId: +m.zonaId, zonaNombre: zonas[+m.zonaId - 1].nombre, fecha: m.fecha, hora: m.hora, tipo: m.tipo, registradoPor: 'Carlos' }))));
      }
      if (p === '/api/registros-acceso' && req.method === 'POST') {
        const { token, zonaId } = await body(req);
        const entry = { token, status: 0, code: null, tipo: null, at: Date.now() };
        log.push(entry);
        const fail = (status, code, detail) => { entry.status = status; entry.code = code; return problem(res, status, code, detail); };
        if (!/^SCIAD1\.[A-Za-z0-9_-]{87}$/.test(token ?? '')) return fail(400, 'TOKEN_INVALIDO', 'El token de la credencial QR no es válido.');
        const c = creds.find((x) => x.qr === token);
        if (!c) return fail(400, 'TOKEN_INVALIDO', 'El token de la credencial QR no es válido.');
        if (c.estado !== 'activa') return fail(400, 'CREDENCIAL_REVOCADA', 'La credencial está revocada o vencida.');
        const ing = movs.filter((m) => m.tipo === 'ingreso').length, egr = movs.filter((m) => m.tipo === 'egreso').length;
        const tipo = ing > egr ? 'egreso' : 'ingreso';
        if (tipo === 'ingreso' && ing > 0) return fail(409, 'CONFLICT', 'Ya existe un ingreso registrado para esta persona hoy (doble ingreso).');
        const now = new Date();
        const gt = new Date(now.getTime() - 6 * 3600e3); // el backend guarda la hora de Guatemala (UTC-6), Fase 4
        const m = { personaId: '7', zonaId: String(zonaId), tipo, fecha: gt.toISOString().slice(0, 10), hora: gt.toISOString().slice(11, 19) };
        movs.push(m); entry.status = 200; entry.tipo = tipo;
        return json(res, { id: String(movs.length), personaId: 7, personaNombre: persona.nombre, zonaId: +zonaId, zonaNombre: zonas[+zonaId - 1].nombre, tipo, fecha: m.fecha, hora: m.hora, estado: 'autorizado', timestamp: now.toISOString() });
      }
      return json(res, {}, 404);
    }
    let f = join(DIST, url.pathname === '/' ? 'index.html' : url.pathname);
    if (!existsSync(f) || statSync(f).isDirectory()) f = join(DIST, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME[extname(f)] ?? 'application/octet-stream' });
    res.end(readFileSync(f));
  });
  return { server, log, movs, TOK };
}
