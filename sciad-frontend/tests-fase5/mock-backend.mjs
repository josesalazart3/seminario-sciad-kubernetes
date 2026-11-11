// Backend SIMULADO fiel al contrato real de SCIAD (DTOs, Problem Details con code/detail, reglas de
// RegistrosAccesoService, hora de Guatemala UTC-6, índice único de ingreso por persona y día, notificaciones).
// Sirve además el build de Angular (como haría nginx). Se usa SOLO para validar los scripts de la Fase 3 y 5
// cuando no hay Docker; contra el stack real se usa la misma prueba con SCIAD_BASE=http://localhost:8080.
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../dist/sciad-frontend/browser', import.meta.url));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const gt = () => new Date(Date.now() - 6 * 3600e3);                         // "ahora" en hora de Guatemala
const fechaGT = () => gt().toISOString().slice(0, 10);

export function createBackend() {
  let seq = 1; const id = () => String(seq++);
  const S = { zonas: [], personas: [], perfiles: [], creds: [], movs: [], notifs: [], log: [] };
  const users = {
    'admin@sciad.gt': { rol: 'ADMIN', nombre: 'Lic. Marco Antonio Ortíz' },
    'seguridad@sciad.gt': { rol: 'SEGURIDAD', nombre: 'Carlos Gómez Rivera' },
    'gerencia@sciad.gt': { rol: 'GERENCIA', nombre: 'Ing. Sofía Herrera' },
  };
  const problem = (res, status, code, detail) => { res.writeHead(status, { 'Content-Type': 'application/problem+json' }); res.end(JSON.stringify({ status, title: 'x', detail, code, message: detail })); };
  const json = (res, obj, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  // Igual que el backend real en historial/notificaciones/auditoría/reportes: tamaño fuera de 1..100 ⇒ 20.
  const page = (it, q) => { const n = Number(q?.get('tamanoPagina') ?? 20); const t = n < 1 || n > 100 ? 20 : n; return { items: it.slice(0, t), total: it.length, pagina: 1, tamanoPagina: t, totalPaginas: it.length ? Math.ceil(it.length / t) : 0 }; };
  const body = (req) => new Promise((r) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => r(d ? JSON.parse(d) : {})); });
  const zonaDto = (z) => ({ id: z.id, nombre: z.nombre, nivelSeguridad: z.nivelSeguridad, capacidad: z.capacidad, nivelRiesgo: z.nivelRiesgo, estado: z.estado });
  const credDto = (c) => { const p = S.personas.find((x) => x.id === c.personaId); return { id: c.id, personaId: c.personaId, personaNombre: p.nombre, dpiCodigo: p.dpiCodigo, tokenCorto: c.corto, qr: c.token, estado: c.estado, emitido: c.emitido, motivo: c.motivo ?? null, reemitidoDe: null }; };
  const perfilDto = (f) => ({ id: f.id, personaId: f.personaId, personaNombre: S.personas.find((x) => x.id === f.personaId).nombre, zonaId: f.zonaId, zonaNombre: S.zonas.find((x) => x.id === f.zonaId).nombre, vigenciaInicio: f.vigenciaInicio, vigenciaFin: f.vigenciaFin });
  const notif = (tipo, persona, mensaje) => S.notifs.push({ id: id(), usuarioId: 3, tipo, mensaje, fecha: new Date().toISOString(), leida: false, personaId: Number(persona.id), personaNombre: persona.nombre });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x'); const p = url.pathname; const m = req.method;
    if (!p.startsWith('/api/')) {
      let f = join(DIST, p === '/' ? 'index.html' : p);
      if (!existsSync(f) || statSync(f).isDirectory()) f = join(DIST, 'index.html');
      res.writeHead(200, { 'Content-Type': MIME[extname(f)] ?? 'application/octet-stream', ...(f.endsWith('index.html') ? { 'Cache-Control': 'no-cache' } : {}) });
      return res.end(readFileSync(f));
    }
    if (p === '/api/auth/login' && m === 'POST') {
      const { email, password } = await body(req); const u = users[email];
      if (!u || password !== 'sciad123') return problem(res, 401, 'UNAUTHORIZED', 'Credenciales inválidas.');
      return json(res, { token: `tok.${u.rol}`, user: { id: '1', nombre: u.nombre, email, rol: u.rol, puesto: 'x', activo: true, avatarInitials: 'XX', fechaCreacion: new Date().toISOString() } });
    }
    const auth = req.headers.authorization ?? '';
    if (!auth.startsWith('Bearer tok.')) return problem(res, 401, 'UNAUTHORIZED', 'Token ausente, inválido o expirado.');
    const rol = auth.slice(11);
    const only = (...r) => (r.includes(rol) ? true : (problem(res, 403, 'FORBIDDEN', 'El rol no tiene permiso para esta operación.'), false));

    if (p === '/api/zonas-acceso' && m === 'GET') return json(res, S.zonas.map(zonaDto));
    if (p === '/api/zonas-acceso' && m === 'POST') { if (!only('ADMIN')) return; const b = await body(req); const z = { id: id(), estado: 'activo', capacidad: null, ...b }; S.zonas.push(z); return json(res, zonaDto(z), 201); }
    if (p === '/api/personas' && m === 'GET') { if (!only('ADMIN')) return;   // PG2 §4.3.2: todo el módulo de gestión es RequireAdmin
    return json(res, { items: S.personas, total: S.personas.length, pagina: 1, tamanoPagina: 500, totalPaginas: 1 }); }   // sin tope (como el backend)
    if (p === '/api/personas' && m === 'POST') { if (!only('ADMIN')) return; const b = await body(req); if (S.personas.some((x) => x.dpiCodigo === b.dpiCodigo)) return problem(res, 409, 'CONFLICT', 'El DPI ya existe.'); const x = { id: id(), estado: 'activo', ...b }; S.personas.push(x); return json(res, x, 201); }
    let mm;
    if ((mm = p.match(/^\/api\/personas\/(\d+)\/estado$/)) && m === 'PATCH') { const x = S.personas.find((q) => q.id === mm[1]); x.estado = (await body(req)).estado; return json(res, x); }
    if (p === '/api/perfiles-acceso' && m === 'GET') { if (!only('ADMIN')) return; let l = S.perfiles; const pid = url.searchParams.get('personaId'); if (pid) l = l.filter((x) => x.personaId === pid); return json(res, l.map(perfilDto)); }
    if (p === '/api/perfiles-acceso' && m === 'POST') { if (!only('ADMIN')) return; const b = await body(req); if (b.vigenciaFin < b.vigenciaInicio) return problem(res, 400, 'VALIDACION', 'La vigencia final no puede ser anterior a la inicial.'); const f = { id: id(), personaId: String(b.personaId), zonaId: String(b.zonaId), vigenciaInicio: b.vigenciaInicio, vigenciaFin: b.vigenciaFin }; S.perfiles.push(f); return json(res, perfilDto(f), 201); }
    if (p === '/api/credenciales' && m === 'GET') { if (!only('ADMIN')) return; let l = S.creds; const pid = url.searchParams.get('personaId'); if (pid) l = l.filter((x) => x.personaId === pid); return json(res, l.map(credDto)); }
    if ((mm = p.match(/^\/api\/credenciales\/(\d+)\/generar$/)) && m === 'POST') { if (!only('ADMIN')) return; if (S.creds.some((c) => c.personaId === mm[1] && c.estado === 'activa')) return problem(res, 409, 'CONFLICT', 'La persona ya tiene una credencial activa.'); const c = { id: id(), personaId: mm[1], token: 'SCIAD1.' + randomBytes(65).toString('base64url'), corto: randomBytes(4).toString('hex'), estado: 'activa', emitido: fechaGT() }; S.creds.push(c); return json(res, credDto(c), 201); }
    if ((mm = p.match(/^\/api\/credenciales\/(\d+)\/revocar$/)) && m === 'POST') { const c = S.creds.find((x) => x.id === mm[1]); if (c.estado === 'revocada') return problem(res, 400, 'VALIDACION', 'La credencial ya está revocada.'); c.estado = 'revocada'; c.motivo = (await body(req)).motivo ?? null; return json(res, credDto(c)); }
    if (p === '/api/notificaciones' && m === 'GET') { if (!only('GERENCIA', 'ADMIN')) return; return json(res, page(S.notifs, url.searchParams)); }
    if (p === '/api/usuarios' && m === 'GET') { if (!only('ADMIN')) return; return json(res, { items: Object.entries(users).map(([email, u], i) => ({ id: String(i + 1), nombre: u.nombre, email, rol: u.rol, puesto: 'x', activo: true, avatarInitials: 'XX', fechaCreacion: new Date().toISOString() })), total: 3, pagina: 1, tamanoPagina: 500, totalPaginas: 1 }); }
    if ((p === '/api/auditoria' || p === '/api/reportes') && m === 'GET') { if (!only('ADMIN', 'GERENCIA')) return; return json(res, page([], url.searchParams)); }

    if (p === '/api/registros-acceso/hoy' && m === 'GET') {
      if (!only('SEGURIDAD', 'ADMIN')) return; const hoy = fechaGT(); const rows = [];
      const keys = [...new Set(S.movs.filter((x) => x.fecha === hoy).map((x) => `${x.personaId}|${x.zonaId}`))];
      for (const k of keys) { const l = S.movs.filter((x) => x.fecha === hoy && `${x.personaId}|${x.zonaId}` === k); const u = l.at(-1); rows.push({ personaId: +u.personaId, personaNombre: S.personas.find((q) => q.id === u.personaId).nombre, zonaId: +u.zonaId, zonaNombre: S.zonas.find((q) => q.id === u.zonaId).nombre, ultimoTipo: u.tipo, ultimaHora: u.hora, dentro: l.filter((x) => x.tipo === 'ingreso').length > l.filter((x) => x.tipo === 'egreso').length }); }
      return json(res, rows);
    }
    if (p === '/api/registros-acceso' && m === 'GET') {
      if (!only('ADMIN', 'GERENCIA')) return;
      const pid = url.searchParams.get('personaId'); let l = S.movs; if (pid) l = l.filter((x) => x.personaId === pid);
      l = [...l].reverse();   // más recientes primero, como el backend
      return json(res, page(l.map((x) => ({ id: x.id, personaId: +x.personaId, personaNombre: S.personas.find((q) => q.id === x.personaId).nombre, zonaId: +x.zonaId, zonaNombre: S.zonas.find((q) => q.id === x.zonaId).nombre, fecha: x.fecha, hora: x.hora, tipo: x.tipo, registradoPor: 'Carlos Gómez Rivera' })), url.searchParams));
    }
    if (p === '/api/registros-acceso' && m === 'POST') {
      if (!only('SEGURIDAD', 'ADMIN')) return;
      const { token, zonaId } = await body(req); const e = { token, status: 0, code: null }; S.log.push(e);
      const fail = (st, code, d) => { e.status = st; e.code = code; return problem(res, st, code, d); };
      const c = S.creds.find((x) => x.token === token);
      if (!c) return fail(400, 'TOKEN_INVALIDO', 'El token de la credencial QR no es válido.');
      const per = S.personas.find((x) => x.id === c.personaId);
      if (c.estado !== 'activa') { notif('token_revocado', per, `Intento de acceso con una credencial ${c.estado} (token revocado o vencido).`); return fail(400, 'CREDENCIAL_REVOCADA', 'La credencial está revocada o vencida.'); }
      if (per.estado !== 'activo') return fail(400, 'PERSONA_INACTIVA', 'La persona titular de la credencial está inactiva.');
      const z = S.zonas.find((x) => x.id === String(zonaId));
      if (!z) return fail(400, 'ZONA_NO_AUTORIZADA', 'La zona de acceso no existe.');
      if (z.estado !== 'activo') return fail(400, 'ZONA_NO_AUTORIZADA', 'La zona de acceso está inactiva.');
      const hoy = fechaGT(); const ps = S.perfiles.filter((x) => x.personaId === per.id && x.zonaId === z.id);
      const vig = ps.find((x) => x.vigenciaInicio <= hoy && hoy <= x.vigenciaFin);
      if (!vig) {
        if (ps.length) { notif('fuera_horario', per, `Intento de acceso fuera del horario/vigencia del perfil en la zona '${z.nombre}'.`); return fail(400, 'FUERA_VIGENCIA', 'La persona tiene un perfil en esta zona, pero su vigencia no cubre la fecha de hoy (fuera de horario).'); }
        return fail(400, 'ZONA_NO_AUTORIZADA', 'La persona no tiene autorización (perfil) para esta zona.');
      }
      const ing = S.movs.filter((x) => x.personaId === per.id && x.zonaId === z.id && x.fecha === hoy && x.tipo === 'ingreso').length;
      const egr = S.movs.filter((x) => x.personaId === per.id && x.zonaId === z.id && x.fecha === hoy && x.tipo === 'egreso').length;
      const tipo = ing > egr ? 'egreso' : 'ingreso';
      if (tipo === 'ingreso' && S.movs.some((x) => x.personaId === per.id && x.fecha === hoy && x.tipo === 'ingreso')) return fail(409, 'CONFLICT', 'Ya existe un ingreso registrado para esta persona en esta zona hoy (doble ingreso).');
      const now = new Date(); const g = gt();
      const mov = { id: id(), personaId: per.id, zonaId: z.id, tipo, fecha: g.toISOString().slice(0, 10), hora: g.toISOString().slice(11, 19) };
      S.movs.push(mov); e.status = 200; e.tipo = tipo;
      return json(res, { id: mov.id, personaId: +per.id, personaNombre: per.nombre, zonaId: +z.id, zonaNombre: z.nombre, tipo, fecha: mov.fecha, hora: mov.hora, estado: 'autorizado', timestamp: now.toISOString() });
    }
    return problem(res, 404, 'NOT_FOUND', 'No encontrado');
  });
  return { server, S };
}
