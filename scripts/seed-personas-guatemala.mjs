// ============================================================================
// SCIAD — 50 personas guatemaltecas de EJEMPLO para la demo (Fase 8.2).
//
// HERRAMIENTA MANUAL Y OPCIONAL: NO se ejecuta al arrancar el backend ni con docker compose; solo si alguien la corre:
//
//   node scripts/seed-personas-guatemala.mjs
//   SCIAD_BASE=http://localhost:8080 SCIAD_ADMIN=admin@sciad.gt SCIAD_PASSWORD=... node scripts/seed-personas-guatemala.mjs
//
// Todo pasa por la API REAL con UN SOLO login de administrador, así que se aplican las mismas validaciones que en la
// interfaz (DPI de 13 dígitos, nombre, vigencias…).
//
// DATOS FICTICIOS:
//   - Los nombres son combinaciones inventadas de nombres y apellidos comunes en Guatemala; no corresponden a personajes
//     públicos ni a personas reales conocidas.
//   - Los DPI son FICTICIOS: 13 dígitos generados por fórmula, únicos entre sí, con departamento (dígitos 10–11) entre
//     01 y 22. No son DPI emitidos por RENAP.
//
// Zonas (Fase 8.3): usa EXACTAMENTE las 3 zonas oficiales — Puerta principal, Puerta secundaria y Bodega (restringida),
// las que deja scripts/reset-datos. Ignora cualquier otra zona y nunca crea zonas distintas de esas 3 (si falta alguna
// de las 3, la crea con los mismos valores que reset-zonas.sql).
//   - Colaboradores: las dos puertas; solo algunos colaboradores además Bodega (cada 3.º y los 3 "normales" de la demo).
//   - Visitantes: solo Puerta principal (nunca Bodega).
// Qué crea: 50 personas (40 colaboradores y 10 visitantes), sus perfiles de acceso (vigencia vigente) y una credencial
// QR activa por persona. NO crea registros de acceso (los escaneos se hacen en vivo).
// Casos para la demo: 1 credencial revocada, 1 persona inactiva, 1 vigencia vencida y 1 colaborador sin acceso a Bodega.
//
// Idempotente: si el DPI ya existe, esa persona se omite (no se toca) y se sigue con la siguiente.
// ============================================================================

const BASE = (process.env.SCIAD_BASE ?? 'http://localhost:3000').replace(/\/$/, '');
const ADMIN = { email: process.env.SCIAD_ADMIN ?? 'admin@sciad.gt', password: process.env.SCIAD_PASSWORD ?? 'sciad123' };

// [nombre, tipo (1 colaborador, 2 visitante)]
const PERSONAS = [
  ['Ana Lucía Xicará Pérez', 1], ['José Manuel Ajú Tzul', 1], ['María Fernanda Cifuentes Orellana', 1],
  ['Carlos Enrique Monterroso Batz', 1], ['Glenda Maribel Coyoy Sic', 1], ['Luis Fernando Barrios Caal', 1],
  ['Heidy Johana Recinos Choc', 1], ['Byron Estuardo Velásquez Pop', 1], ['Claudia Patricia Ixcot Juárez', 1],
  ['Edgar Rolando Figueroa Tun', 1], ['Ingrid Paola Cabrera Chávez', 1], ['Marvin Alexander Estrada Coc', 1],
  ['Karla Rocío Méndez Sontay', 1], ['Selvin Omar García Quiej', 1], ['Lesbia Carolina Morales Ixchop', 1],
  ['Walter Iván Hernández Saquic', 1], ['Mirna Elizabeth Castillo Tepaz', 1], ['Henry Josué Ramírez Yax', 1],
  ['Rosa Amalia López Cotí', 1], ['Elmer Geovany Juárez Xiloj', 1], ['Sonia Beatriz Orellana Toj', 1],
  ['Wilson René Pérez Cumes', 1], ['Wendy Marisol Barrios Chumil', 1], ['Kevin Alexis Monzón Tuy', 1],
  ['Yesenia Abigail Cifuentes Mux', 1], ['Erick Daniel Solares Ajcac', 1], ['Brenda Lisseth Gálvez Raxón', 1],
  ['Rony Estuardo Aguilar Chiyal', 1], ['Evelyn Johanna Samayoa Puac', 1], ['Jorge Mario Lemus Tzoc', 1],
  ['Mayra Alejandra Villatoro Cux', 1], ['Juan Carlos Bámaca Ordóñez', 1], ['Lilian Rocío Escobar Tax', 1],
  ['Mario Roberto Cojulún Boj', 1], ['Dulce María Paredes Sinay', 1], ['Anderson Josué Mazariegos Chen', 1],
  ['Floridalma Ixcoy Rosales', 1], ['Fredy Armando Coroy Lux', 1], ['Gabriela Sofía Roquel Ical', 1],
  ['Hugo Leonel Sipac Morán', 1],
  ['Andrea Celeste Ochoa Cumatz', 2], ['Pablo Andrés Chacón Sub', 2], ['Mónica Isabel Arriaza Tuyuc', 2],
  ['Óscar Danilo Pineda Calel', 2], ['Silvia Noemí Reyes Xoy', 2], ['Diego Alejandro Mejía Ixquiac', 2],
  ['Paola Andrea Guzmán Ajanel', 2], ['Sergio Iván Lima Patzán', 2], ['Nancy Marleny Ordóñez Chávez', 2],
  ['Christian Josué Arana Socop', 2],
];

// Casos de demo (índices en PERSONAS) y tres personas "normales" listas para escanear.
const CASO = { revocada: 3, inactiva: 6, vencida: 9, sinRestringida: 12 };
const NORMALES = [0, 1, 2];
/** Colaboradores con acceso a Bodega: los 3 normales y cada 3.º colaborador, nunca el caso "sin permiso". */
const conBodega = (i, tipo) => tipo === 1 && i !== CASO.sinRestringida && (NORMALES.includes(i) || i % 3 === 0);

// Las 3 zonas oficiales (mismos valores que scripts/reset-zonas.sql).
const ZONAS_OFICIALES = [
  { nombre: 'Puerta principal', nivelSeguridad: 'MEDIO', nivelRiesgo: 'MEDIO', capacidad: 200 },
  { nombre: 'Puerta secundaria', nivelSeguridad: 'MEDIO', nivelRiesgo: 'MEDIO', capacidad: 100 },
  { nombre: 'Bodega', nivelSeguridad: 'ALTO', nivelRiesgo: 'ALTO', capacidad: 10 },
];
const normal = (t) => String(t).trim().replace(/\s+/g, ' ').toLowerCase();

/** DPI ficticio y determinista: 9 dígitos por fórmula + departamento 01–22 + municipio 01–12 (13 dígitos). */
function dpiFicticio(i) {
  const base = String(281_604_000 + i * 7_919).padStart(9, '0');
  const depto = String((i % 22) + 1).padStart(2, '0');
  const muni = String((i % 12) + 1).padStart(2, '0');
  return `${base}${depto}${muni}`;
}

// "hoy" según el servidor = día de Guatemala (UTC-6)
const fechaGT = (dias = 0) => new Date(Date.now() - 6 * 3600e3 + dias * 86400e3).toISOString().slice(0, 10);

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

function must(res, ok, que) {
  if (!ok.includes(res.status)) {
    throw new Error(`${que}: HTTP ${res.status} ${res.body?.detail ?? JSON.stringify(res.body)}`);
  }
  return res.body;
}

// ---------- 1. Un solo login ----------
const login = await call('POST', '/api/auth/login', { body: { email: ADMIN.email, password: ADMIN.password } });
if (login.status === 429) throw new Error('Login bloqueado por el límite de intentos (429). Espere 5 minutos y repita.');
const T = must(login, [200], `login de ${ADMIN.email}`).token;
console.log(`Sesión de administrador OK (${ADMIN.email}) contra ${BASE}`);

// ---------- 2. Las 3 zonas oficiales (se ignora cualquier otra) ----------
const todas = must(await call('GET', '/api/zonas-acceso?estado=todos', { token: T }), [200], 'listar zonas');
const Z = {};
for (const o of ZONAS_OFICIALES) {
  let z = todas.find((x) => normal(x.nombre) === normal(o.nombre));
  if (!z) {
    z = must(await call('POST', '/api/zonas-acceso', { token: T, body: o }), [201], `crear zona ${o.nombre}`);
    console.log(`  + zona ${o.nombre} (no existía)`);
  } else if (z.estado !== 'activo') {
    must(await call('PATCH', `/api/zonas-acceso/${z.id}/estado`, { token: T, body: { estado: 'activo' } }), [200], `activar zona ${o.nombre}`);
  }
  Z[o.nombre] = z;
}
const principal = Z['Puerta principal'], secundaria = Z['Puerta secundaria'], bodega = Z['Bodega'];
const otras = todas.filter((x) => !Object.values(Z).some((z) => z.id === x.id));
console.log(`Zonas: Puerta principal, Puerta secundaria, Bodega${otras.length ? `  (se ignoran otras ${otras.length}: ejecute scripts/reset-datos para dejar solo estas 3)` : ''}`);

// ---------- 3. Personas, perfiles y credenciales ----------
const existentes = new Map(
  (must(await call('GET', '/api/personas?tamanoPagina=500&estado=todos', { token: T }), [200], 'listar personas').items ?? [])
    .map((p) => [p.dpiCodigo, p]),
);
const creadas = [], omitidas = [];
const vigente = { vigenciaInicio: fechaGT(-30), vigenciaFin: fechaGT(365) };
const vencida = { vigenciaInicio: fechaGT(-90), vigenciaFin: fechaGT(-1) };

for (const [i, [nombre, tipo]] of PERSONAS.entries()) {
  const dpi = dpiFicticio(i);
  if (existentes.has(dpi)) { omitidas.push(nombre); continue; }
  const alta = await call('POST', '/api/personas', { token: T, body: { nombre, dpiCodigo: dpi, tipo } });
  if (alta.status === 409) { omitidas.push(nombre); continue; } // ya existía (fuera de la primera página)
  const p = must(alta, [201], `crear persona ${nombre}`);

  // Colaboradores: las dos puertas (+ Bodega solo algunos). Visitantes: solo Puerta principal.
  const suyas = tipo === 1 ? [principal, secundaria, ...(conBodega(i, tipo) ? [bodega] : [])] : [principal];
  for (const z of suyas) {
    must(await call('POST', '/api/perfiles-acceso', {
      token: T, body: { personaId: +p.id, zonaId: +z.id, ...(i === CASO.vencida ? vencida : vigente) },
    }), [201], `perfil ${nombre} → ${z.nombre}`);
  }

  const cred = must(await call('POST', `/api/credenciales/${p.id}/generar`, { token: T }), [200, 201], `credencial de ${nombre}`);
  if (i === CASO.revocada) {
    must(await call('POST', `/api/credenciales/${cred.id}/revocar`, { token: T, body: { motivo: 'Gafete extraviado (caso de demo)' } }), [200], `revocar ${nombre}`);
  }
  if (i === CASO.inactiva) {
    must(await call('PATCH', `/api/personas/${p.id}/estado`, { token: T, body: { estado: 'inactivo' } }), [200], `inactivar ${nombre}`);
  }
  creadas.push(nombre);
  process.stdout.write(`\r  personas creadas: ${creadas.length}`);
}
console.log(`\n\nCreadas: ${creadas.length}   Omitidas (DPI ya existente): ${omitidas.length}`);
console.log(`Colaboradores: ${PERSONAS.filter(([, t]) => t === 1).length}   Visitantes: ${PERSONAS.filter(([, t]) => t === 2).length}   Colaboradores con acceso a Bodega: ${PERSONAS.filter(([, t], i) => conBodega(i, t)).length}`);

// ---------- 4. Tabla de casos de demo ----------
const filas = [
  [CASO.revocada, 'Credencial REVOCADA → rojo (CREDENCIAL_REVOCADA)'],
  [CASO.inactiva, 'Persona INACTIVA → rojo (PERSONA_INACTIVA)'],
  [CASO.vencida, 'Vigencia VENCIDA → rojo (FUERA_VIGENCIA)'],
  [CASO.sinRestringida, 'Colaborador SIN acceso a Bodega → rojo en Bodega (ZONA_NO_AUTORIZADA); verde en las dos puertas'],
  ...NORMALES.map((i) => [i, 'Normal: verde (INGRESO, luego EGRESO) en las 3 zonas, incluida Bodega']),
].map(([i, caso]) => ({ Nombre: PERSONAS[i][0], DPI: dpiFicticio(i), Caso: caso }));
console.log('\nPersonas para la demo (sus QR están en Administración → Credenciales):');
console.table(filas);
