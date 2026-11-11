// Verificación puntual del endpoint POST /api/credenciales/{id}/revocar (Fase 3, Task #24).
// Cada corrida usa sufijos únicos para poder repetirse. Uso: node verify-revocar.mjs
import { strict as assert } from 'node:assert';
import { dpiPrueba, nombrePrueba } from './datos-prueba.mjs';

const BASE = process.env.SCIAD_BASE ?? 'http://localhost:3000';
const H = { 'Content-Type': 'application/json' };
const R = Date.now().toString().slice(-8);

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name} ${extra}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}
async function call(method, path, opts = {}) {
  const headers = { ...H, ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) };
  const r = await fetch(`${BASE}${path}`, {
    method, headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const ct = r.headers.get('content-type') ?? '';
  let json = null;
  if (ct.includes('application/json')) { try { json = await r.json(); } catch {} }
  return { status: r.status, body: json, ct };
}
async function login(email, pass) {
  const { status, body } = await call('POST', '/api/auth/login', { body: { email, password: pass } });
  assert.ok(body?.token, `No token para ${email} (status ${status})`);
  return body.token;
}
const A = await login('admin@sciad.gt', 'sciad123');
const S = await login('seguridad@sciad.gt', 'sciad123');
const G = await login('gerencia@sciad.gt', 'sciad123');

console.log(`Sufijo=${R}\n`);

// Setup: persona activa + credencial activa.
const p = await call('POST', '/api/personas', { token: A, body: { nombre: nombrePrueba(`PRV-${R}`), dpiCodigo: dpiPrueba(), tipo: 1 } });
assert.equal(p.status, 201, `persona no creada ${p.status}`);
const gen = await call('POST', `/api/credenciales/${p.body.id}/generar`, { token: A });
assert.equal(gen.status, 201, `credencial no generada ${gen.status}`);
const cred = gen.body;
console.log(`Persona id=${p.body.id}, credencial activa id=${cred.id}, estado=${cred.estado}\n`);

console.log('== RBAC ==');
check('revocar con Seguridad -> 403', (await call('POST', `/api/credenciales/${cred.id}/revocar`, { token: S, body: { motivo: 'x' } })).status === 403);
check('revocar con Gerencia -> 403', (await call('POST', `/api/credenciales/${cred.id}/revocar`, { token: G, body: { motivo: 'x' } })).status === 403);

console.log('\n== CU-03 revocación ==');
{
  const sinMotivo = await call('POST', `/api/credenciales/${cred.id}/revocar`, { token: A });
  check('revocar sin motivo -> 200, estado=revocada, motivo=null',
    sinMotivo.status === 200 && sinMotivo.body?.id === cred.id && sinMotivo.body?.estado === 'revocada' && sinMotivo.body?.motivo === null,
    `estado=${sinMotivo.body?.estado}, motivo=${JSON.stringify(sinMotivo.body?.motivo)}`);
  const otraVez = await call('POST', `/api/credenciales/${cred.id}/revocar`, { token: A, body: { motivo: 'ya revocada' } });
  check('revocar ya revocada -> 400', otraVez.status === 400, `code=${otraVez.body?.code}`);

  const gen2 = await call('POST', `/api/credenciales/${p.body.id}/generar`, { token: A });
  assert.equal(gen2.status, 201, `regenerar tras revocar debería ser 201, obtuve ${gen2.status}`);
  const cred2 = gen2.body;
  const conMotivo = await call('POST', `/api/credenciales/${cred2.id}/revocar`, { token: A, body: { motivo: 'Credencial extraviada' } });
  check('revocar con motivo -> 200, motivo persistido',
    conMotivo.status === 200 && conMotivo.body?.motivo === 'Credencial extraviada', `motivo=${JSON.stringify(conMotivo.body?.motivo)}`);

  const hist = await call('GET', `/api/credenciales?personaId=${p.body.id}`, { token: A });
  check('historial de la persona trae ambas credenciales revocadas con trazabilidad',
    hist.status === 200 && hist.body?.length === 2 && hist.body.every(x => x.estado === 'revocada'),
    `n=${hist.body?.length}, estados=${hist.body?.map(x => x.estado).join(',')}`);
}

console.log(`\n===== RESULTADO: ${pass} ✓  /  ${fail} ✗ =====`);
process.exit(fail === 0 ? 0 : 1);
