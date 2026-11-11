process.env.TZ = 'America/Guatemala'; // portable (Windows/Linux/macOS); debe fijarse antes de usar Date
import assert from 'node:assert/strict';
import { extractToken, ScanGate, TOKEN_RE } from '../src/app/core/util/token.ts';
import { horaLocal, fechaLocal, hoyServidor } from '../src/app/core/util/time.ts';

let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };
const T = 'SCIAD1.' + Buffer.alloc(65, 7).toString('base64url');   // sobre cifrado: SCIAD1. + 87 base64url
assert.equal(T.length, 94);
const HEX64 = 'A'.repeat(32) + '0123456789abcdef'.repeat(2);    // formato antiguo

console.log('token.ts');
ok('acepta el sobre puro', () => assert.equal(extractToken(T), T));
ok('recorta espacios/saltos', () => assert.equal(extractToken('  ' + T + '\n'), T));
ok('extrae el sobre dentro de URL', () => assert.equal(extractToken('https://x.gt/c/' + T + '?a=1'), T));
ok('rechaza sobre truncado o con un carácter de más', () => { assert.equal(extractToken(T.slice(0, -1)), null); assert.equal(extractToken(T + 'a'), null); });
ok('rechaza texto ajeno / vacío / null', () => { assert.equal(extractToken('hola'), null); assert.equal(extractToken(''), null); assert.equal(extractToken(null), null); });
ok('rechaza un carácter fuera de base64url', () => assert.equal(extractToken(T.slice(0, -1) + '+'), null));
ok('rechaza otra versión (SCIAD2.)', () => assert.equal(extractToken(T.replace('SCIAD1.', 'SCIAD2.')), null));
ok('rechaza el formato antiguo de 64 hex', () => { assert.equal(extractToken(HEX64), null); assert.equal(TOKEN_RE.test(HEX64), false); });

console.log('ScanGate');
const g = new ScanGate({ holdMs: 2500, sameTokenMs: 15000 });
ok('primer token se procesa', () => assert.equal(g.canProcess(T, 0), true));
g.begin(T, 0);
ok('bloquea mientras hay petición en curso (otro token)', () => assert.equal(g.canProcess('B'.repeat(64), 100), false));
g.end(300);
ok('bloquea todo durante holdMs tras terminar', () => assert.equal(g.canProcess('B'.repeat(64), 1000), false));
ok('otro token pasa tras holdMs', () => assert.equal(g.canProcess('B'.repeat(64), 2900), true));
ok('mismo token bloqueado hasta sameTokenMs', () => { assert.equal(g.canProcess(T, 5000), false); assert.equal(g.canProcess(T, 14999), false); });
ok('mismo token permitido pasado sameTokenMs', () => assert.equal(g.canProcess(T, 15001), true));
ok('forget() permite reintento inmediato (fallo de red)', () => { g.forget(); assert.equal(g.canProcess(T, 3000), true); });

console.log('time.ts (el backend guarda hora de Guatemala = UTC-6; Fase 4)');
ok('TZ del proceso = America/Guatemala', () => assert.equal(Intl.DateTimeFormat().resolvedOptions().timeZone, 'America/Guatemala'));
ok('07:15:32 (GT) se muestra 07:15', () => assert.equal(horaLocal('2026-08-21', '07:15:32'), '07:15'));
ok('acepta fracciones de segundo del servidor', () => assert.equal(horaLocal('2026-08-21', '07:15:32.1234567'), '07:15'));
ok('18:30 (GT) sigue siendo el mismo día (el error de las 6 pm)', () => { assert.equal(horaLocal('2026-08-21', '18:30:00'), '18:30'); assert.equal(fechaLocal('2026-08-21', '18:30:00'), '2026-08-21'); });
ok('entradas inválidas no rompen (fallback)', () => { assert.equal(horaLocal(null, '13:15:32'), '13:15'); assert.equal(horaLocal('x', 'y'), 'y'.slice(0,5)); });
ok('hoyServidor: 05:59Z = día 21; 06:00Z = día 22 (medianoche de Guatemala)', () => { assert.equal(hoyServidor(new Date('2026-08-22T05:59:59Z')), '2026-08-21'); assert.equal(hoyServidor(new Date('2026-08-22T06:00:00Z')), '2026-08-22'); });
ok('hoyServidor: 00:30Z del 22 sigue siendo el día 21 (18:30 en Guatemala)', () => assert.equal(hoyServidor(new Date('2026-08-22T00:30:00Z')), '2026-08-21'));
console.log(`\n${n} pruebas OK`);
