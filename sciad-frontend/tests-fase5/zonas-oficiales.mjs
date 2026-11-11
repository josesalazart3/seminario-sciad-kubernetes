// ============================================================================
// SCIAD — Fase 8.3: después de scripts/reset-datos deben existir SOLO 3 zonas de acceso.
//   1. GET /api/zonas-acceso devuelve exactamente Puerta principal, Puerta secundaria y Bodega (Bodega = la más alta).
//   2. La pantalla "Zonas de acceso" las muestra al entrar, sin tocar nada.
//   3. El selector de zona del escáner ofrece solo esas 3.
//   4. Con --reiniciar: reinicia el backend y comprueba que NO aparecen zonas nuevas (DbSeeder no siembra zonas).
//
//   CHROME_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe" node zonas-oficiales.mjs --reiniciar
// ============================================================================
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { getToken } from '../../sciad-backend/token-store.mjs';

const BASE = (process.env.SCIAD_FRONT ?? 'http://localhost:8080').replace(/\/$/, '');
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OFICIALES = ['Bodega', 'Puerta principal', 'Puerta secundaria'];
let fallos = 0;
const check = (n, ok, d = '') => { if (!ok) fallos++; console.log(`  ${ok ? '✓' : '✗'} ${n}${d !== '' ? `  → ${d}` : ''}`); };

const token = await getToken('admin@sciad.gt');
const zonasApi = async () => (await fetch(`${BASE}/api/zonas-acceso?estado=todos`, { headers: { Authorization: `Bearer ${token}` } })).json();

console.log('\n[1] API');
const zonas = await zonasApi();
const nombres = zonas.map((z) => z.nombre).sort();
check('GET /api/zonas-acceso devuelve exactamente 3 zonas', zonas.length === 3, `${zonas.length}: ${nombres.join(', ')}`);
check('son Puerta principal, Puerta secundaria y Bodega', JSON.stringify(nombres) === JSON.stringify(OFICIALES));
check('las 3 están activas', zonas.every((z) => z.estado === 'activo'));
const bodega = zonas.find((z) => z.nombre === 'Bodega');
check('Bodega es la de nivel de seguridad más alto (ALTO); las puertas, MEDIO', bodega?.nivelSeguridad === 'ALTO'
  && zonas.filter((z) => z.nombre !== 'Bodega').every((z) => z.nivelSeguridad === 'MEDIO'),
zonas.map((z) => `${z.nombre}=${z.nivelSeguridad}/${z.nivelRiesgo}`).join(', '));

console.log('\n[2] Pantallas');
const user = await (await fetch(`${BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })).json();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
await page.evaluateOnNewDocument((s) => sessionStorage.setItem('sciad.session', JSON.stringify(s)), { user, token });
await page.goto(`${BASE}/admin/zonas`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelectorAll('main table tbody tr:not(.sci-skel-row)').length > 0, { timeout: 5000 }).catch(() => undefined);
const filas = await page.$$eval('main table tbody tr td.cell-strong', (tds) => tds.map((t) => t.textContent.trim()).sort());
check('"Zonas de acceso" muestra las 3 al entrar (sin tocar nada)', JSON.stringify(filas) === JSON.stringify(OFICIALES), filas.join(', '));
await page.goto(`${BASE}/admin/escaneo`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => (document.querySelector('#zona-sel')?.options.length ?? 0) > 1, { timeout: 5000 }).catch(() => undefined);
const opciones = await page.$$eval('#zona-sel option:not([disabled])', (os) => os.map((o) => o.textContent.trim()).sort());
check('el selector del escáner ofrece solo esas 3', JSON.stringify(opciones) === JSON.stringify(OFICIALES), opciones.join(', '));
await browser.close();

if (process.argv.includes('--reiniciar')) {
  console.log('\n[3] Reiniciar el backend no recrea zonas');
  execSync('docker compose restart backend', { cwd: RAIZ, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    const s = execSync('docker inspect -f "{{.State.Health.Status}}" sciad-backend').toString().trim();
    if (s === 'healthy') break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  const despues = await zonasApi();
  check('tras reiniciar el backend siguen exactamente 3 zonas', despues.length === 3, despues.map((z) => z.nombre).join(', '));
}

console.log(fallos === 0 ? '\n✓ Solo existen las 3 zonas oficiales.' : `\n✗ ${fallos} comprobación(es) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
