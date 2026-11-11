// Datos de demostración de SCIAD (Fase 3) — crea, POR LA API REAL, zonas, personas, perfiles y credenciales
// para poder probar el escaneo de inmediato, y genera una hoja con los QR (demo-gafetes.html).
//
// HERRAMIENTA MANUAL Y OPCIONAL (Fase 8): NO se ejecuta sola — ni al arrancar el backend ni con docker compose.
// Solo crea datos si alguien la corre a mano. Para empezar limpio con datos reales: scripts/reset-datos.(ps1|sh).
// Sus DPI son de 13 dígitos válidos (departamento 01–22), como exige la validación de personas.
//
// Uso:   node seed-demo.mjs                       (API en http://localhost:3000, la del docker-compose de desarrollo)
//        SCIAD_BASE=http://localhost:8080 node seed-demo.mjs     (a través de nginx/frontend)
//
// Es IDEMPOTENTE: puede ejecutarse varias veces; reutiliza lo que ya existe (zonas por nombre, personas por DPI,
// perfiles por persona+zona, credenciales por persona). No borra nada. Requiere la cuenta admin@sciad.gt del seeder.
import { writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');                         // carpeta SCIAD/
const BASE = (process.env.SCIAD_BASE ?? 'http://localhost:3000').replace(/\/$/, '');
const ADMIN = { email: process.env.SCIAD_ADMIN ?? 'admin@sciad.gt', password: process.env.SCIAD_PASSWORD ?? 'sciad123' };

// "hoy" según el servidor = día de Guatemala (UTC-6)
const fechaGT = (offsetDias = 0) => new Date(Date.now() - 6 * 3600e3 + offsetDias * 86400e3).toISOString().slice(0, 10);

async function call(method, path, { token, body } = {}) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await r.json(); } catch { /* sin cuerpo */ }
  return { status: r.status, body: json };
}
const must = (r, ok, what) => {
  if (!ok.includes(r.status)) throw new Error(`${what}: HTTP ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
const items = (b) => (Array.isArray(b) ? b : b?.items ?? []);

// ── Definición de la demostración ───────────────────────────────────────────────────────────
const ZONAS = [
  { nombre: 'Entrada Principal', nivelSeguridad: 'BAJO', nivelRiesgo: 'BAJO', capacidad: 200 },
  { nombre: 'Oficinas', nivelSeguridad: 'MEDIO', nivelRiesgo: 'MEDIO', capacidad: 80 },
  { nombre: 'Sala de Servidores', nivelSeguridad: 'ALTO', nivelRiesgo: 'CRITICO', capacidad: 5 },
];
// perfiles: { zona, ini, fin } con offsets en días respecto a hoy
const VIGENTE = { ini: -30, fin: 365 };
const VENCIDO = { ini: -400, fin: -35 };
const PERSONAS = [
  { dpi: '1234567890101', nombre: 'Juan Pérez López', tipo: 1, escenario: 'Acceso normal en Entrada Principal y Oficinas',
    esperado: '✅ Autorizado (ingreso; al volver a escanear: egreso)', perfiles: [['Entrada Principal', VIGENTE], ['Oficinas', VIGENTE]] },
  { dpi: '2345678910108', nombre: 'María Fernanda Ruiz', tipo: 1, escenario: 'Acceso total, incluida la Sala de Servidores',
    esperado: '✅ Autorizado en las 3 zonas', perfiles: [['Entrada Principal', VIGENTE], ['Oficinas', VIGENTE], ['Sala de Servidores', VIGENTE]] },
  { dpi: '3456789120116', nombre: 'Carlos Méndez Soto', tipo: 1, escenario: 'Perfil de acceso VENCIDO',
    esperado: '❌ Fuera de vigencia (y genera notificación a Gerencia)', perfiles: [['Entrada Principal', VENCIDO]] },
  { dpi: '4567891230122', nombre: 'Ana Lucía Castillo', tipo: 1, escenario: 'Credencial REVOCADA (extraviada)',
    esperado: '❌ Credencial revocada (y genera notificación a Gerencia)', perfiles: [['Entrada Principal', VIGENTE]], revocar: 'Demo: credencial extraviada' },
  { dpi: '5678912340301', nombre: 'Roberto Aguilar', tipo: 2, escenario: 'Visitante solo con acceso a Entrada Principal',
    esperado: '✅ En Entrada Principal · ❌ Zona no autorizada en Oficinas', perfiles: [['Entrada Principal', VIGENTE]] },
  { dpi: '6789123450901', nombre: 'Sofía Morales', tipo: 2, escenario: 'Visitante SIN perfil de acceso',
    esperado: '❌ Zona no autorizada', perfiles: [] },
];

console.log(`SCIAD · datos demo → ${BASE}\n`);
const login = await call('POST', '/api/auth/login', { body: ADMIN });
if (!login.body?.token) {
  console.error(`✗ No se pudo iniciar sesión como ${ADMIN.email} (HTTP ${login.status}). ¿Está la API arriba? ¿Cambió la contraseña?`);
  process.exit(1);
}
const T = login.body.token;

// 1) Zonas
const zonasExistentes = items(must(await call('GET', '/api/zonas-acceso?estado=todos', { token: T }), [200], 'listar zonas'));
const zonaId = {};
for (const z of ZONAS) {
  let ex = zonasExistentes.find((x) => x.nombre === z.nombre);
  if (!ex) { ex = must(await call('POST', '/api/zonas-acceso', { token: T, body: z }), [200, 201], `crear zona ${z.nombre}`); console.log(`  + zona   ${z.nombre}`); }
  else console.log(`  = zona   ${z.nombre} (ya existía)`);
  zonaId[z.nombre] = Number(ex.id);
}

// 2) Personas, perfiles y credenciales
const personasExistentes = items(must(await call('GET', '/api/personas?tamanoPagina=500&estado=todos', { token: T }), [200], 'listar personas'));
const salida = [];
for (const p of PERSONAS) {
  let per = personasExistentes.find((x) => x.dpiCodigo === p.dpi);
  if (!per) { per = must(await call('POST', '/api/personas', { token: T, body: { nombre: p.nombre, dpiCodigo: p.dpi, tipo: p.tipo } }), [200, 201], `crear persona ${p.nombre}`); console.log(`  + persona ${p.nombre}`); }
  else console.log(`  = persona ${p.nombre} (ya existía)`);
  const personaId = Number(per.id);

  const perfilesExistentes = items(must(await call('GET', `/api/perfiles-acceso?personaId=${personaId}`, { token: T }), [200], 'listar perfiles'));
  for (const [zonaNombre, v] of p.perfiles) {
    if (perfilesExistentes.some((x) => Number(x.zonaId) === zonaId[zonaNombre])) continue;
    must(await call('POST', '/api/perfiles-acceso', { token: T, body: { personaId, zonaId: zonaId[zonaNombre], vigenciaInicio: fechaGT(v.ini), vigenciaFin: fechaGT(v.fin) } }), [200, 201], `perfil ${p.nombre}/${zonaNombre}`);
    console.log(`      + perfil ${zonaNombre} (${v === VENCIDO ? 'VENCIDO' : 'vigente'})`);
  }

  let creds = items(must(await call('GET', `/api/credenciales?personaId=${personaId}`, { token: T }), [200], 'listar credenciales'));
  if (creds.length === 0) {
    const nueva = must(await call('POST', `/api/credenciales/${personaId}/generar`, { token: T }), [200, 201], `generar credencial ${p.nombre}`);
    console.log(`      + credencial generada`);
    if (p.revocar) {
      must(await call('POST', `/api/credenciales/${nueva.id}/revocar`, { token: T, body: { motivo: p.revocar } }), [200], `revocar ${p.nombre}`);
      console.log(`      + credencial revocada (escenario de prueba)`);
    }
    creds = items(must(await call('GET', `/api/credenciales?personaId=${personaId}`, { token: T }), [200], 'relistar credenciales'));
  }
  const cred = creds.find((c) => c.estado === 'activa') ?? creds[0];
  salida.push({ nombre: p.nombre, dpi: p.dpi, tipo: p.tipo === 1 ? 'Colaborador' : 'Visitante', escenario: p.escenario, esperado: p.esperado, estado: cred.estado, qr: cred.qr });
}

// 3) Archivos de salida (ignorados por git)
writeFileSync(join(ROOT, 'demo-credenciales.json'), JSON.stringify(salida, null, 2));

let html = '';
const qrLib = join(ROOT, 'sciad-frontend', 'node_modules', 'qrcode');
if (existsSync(qrLib)) {
  const QRCode = createRequire(join(ROOT, 'sciad-frontend', 'package.json'))('qrcode');
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const cards = [];
  for (const s of salida) {
    const img = await QRCode.toDataURL(s.qr, { errorCorrectionLevel: 'M', margin: 3, width: 360 });
    cards.push(`<div class="c"><img src="${img}" alt="QR"><div class="n">${esc(s.nombre)}</div><div class="t">${esc(s.tipo)} · ${esc(s.estado)}</div><div class="e">${esc(s.escenario)}</div><div class="x">${esc(s.esperado)}</div></div>`);
  }
  html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>SCIAD — QR de demostración</title><style>
body{font-family:system-ui,Segoe UI,Roboto,sans-serif;margin:24px;color:#0f172a}h1{margin:0 0 4px}p{color:#475569;margin:0 0 18px}
.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}.c{border:1px solid #cbd5e1;border-radius:12px;padding:14px;text-align:center;break-inside:avoid}
.c img{width:220px;height:220px}.n{font-weight:700;margin-top:6px}.t{font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.06em}
.e{font-size:13px;margin-top:6px}.x{font-size:12px;color:#334155;margin-top:4px;background:#f1f5f9;border-radius:8px;padding:6px}
</style></head><body><h1>SCIAD — QR de demostración</h1><p>Abre esta hoja en una pantalla y escanéala con la app en el celular. Generada ${new Date().toLocaleString('es-GT')}.</p>
<div class="g">${cards.join('')}</div></body></html>`;
  writeFileSync(join(ROOT, 'demo-gafetes.html'), html);
}

console.log('\n┌──────────────────────┬─────────────┬──────────┬────────────────────────────────────────────────────┐');
for (const s of salida) console.log(`│ ${s.nombre.padEnd(20)} │ ${s.tipo.padEnd(11)} │ ${s.estado.padEnd(8)} │ ${s.esperado.slice(0, 50).padEnd(50)} │`);
console.log('└──────────────────────┴─────────────┴──────────┴────────────────────────────────────────────────────┘');
console.log(`\nListo. Archivos en ${ROOT}:`);
console.log('  • demo-credenciales.json  (tokens y resultado esperado de cada escenario)');
console.log(html ? '  • demo-gafetes.html       (ábrelo y escanea los QR con el celular)' : '  • (sin demo-gafetes.html: instala el frontend con `npm ci` en sciad-frontend/ y repite)');
console.log('\nPrueba: entra como seguridad@sciad.gt / sciad123 → Punto de acceso → elige la zona → escanea un QR.');
console.log('Nota: el sistema permite UN ingreso por persona y día; el 2.º escaneo es egreso y el 3.º devuelve 409 hasta mañana.');
