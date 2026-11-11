import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
const require = createRequire(new URL('../package.json', import.meta.url));
const QRCode = require('qrcode');
const jsQR = require('jsqr');
const { PNG } = require('pngjs');

const rgba = async (text, width) => {
  const buf = await QRCode.toBuffer(text, { errorCorrectionLevel: 'M', margin: 3, width, color: { dark: '#000000', light: '#ffffff' } });
  const png = PNG.sync.read(buf);
  return { data: new Uint8ClampedArray(png.data), w: png.width, h: png.height };
};
// Reducción por promedio de cajas (como el escalado de una cámara) + desenfoque + ruido gaussiano
const degradar = ({ data, w, h }, factor, blur, sigma) => {
  const nw = Math.max(1, Math.round(w / factor)), nh = Math.max(1, Math.round(h / factor));
  const out = new Uint8ClampedArray(nw * nh * 4);
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    const x0 = Math.floor(x * w / nw), x1 = Math.max(x0 + 1, Math.floor((x + 1) * w / nw));
    const y0 = Math.floor(y * h / nh), y1 = Math.max(y0 + 1, Math.floor((y + 1) * h / nh));
    let s = 0, c = 0; for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { s += data[(yy * w + xx) * 4]; c++; }
    const v = s / c; for (let k = 0; k < 3; k++) out[(y * nw + x) * 4 + k] = v; out[(y * nw + x) * 4 + 3] = 255;
  }
  let cur = out;
  for (let p = 0; p < blur; p++) { // box blur 3x3
    const nx = new Uint8ClampedArray(cur);
    for (let y = 1; y < nh - 1; y++) for (let x = 1; x < nw - 1; x++) {
      let s = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += cur[((y + dy) * nw + x + dx) * 4];
      const v = s / 9; for (let k = 0; k < 3; k++) nx[(y * nw + x) * 4 + k] = v;
    }
    cur = nx;
  }
  const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  if (sigma) for (let i = 0; i < nw * nh; i++) { const n = gauss() * sigma; for (let k = 0; k < 3; k++) cur[i * 4 + k] = Math.min(255, Math.max(0, cur[i * 4 + k] + n)); }
  return { data: cur, w: nw, h: nh };
};
const dec = (img, inv = 'dontInvert') => jsQR(img.data, img.w, img.h, { inversionAttempts: inv })?.data ?? null;

const N = 300, tokens = [];
// Contenido real del QR: sobre cifrado «SCIAD1.» + 87 base64url (65 bytes aleatorios).
for (let i = 0; i < N; i++) tokens.push('SCIAD1.' + randomBytes(65).toString('base64url'));

// 1) Ida y vuelta exacta (sin degradar), distintos tamaños de render
for (const width of [240, 360, 480, 720]) {
  let okc = 0; for (const t of tokens.slice(0, 100)) if (dec(await rgba(t, width)) === t) okc++;
  console.log(`exacto ${width}px: ${okc}/100`);
  if (okc !== 100) { console.log('FALLO'); process.exitCode = 1; }
}
// 2) Misma matriz de QR → 300 tokens a 480px sin degradar
{ let okc = 0; for (const t of tokens) if (dec(await rgba(t, 480)) === t) okc++; console.log(`300 tokens @480px: ${okc}/300`); if (okc !== 300) process.exitCode = 1; }

// 3) Degradación tipo cámara (solo informativo: tasa de éxito)
const casos = [
  ['reducido ÷2 (240px)', 2, 0, 0], ['reducido ÷3 (160px)', 3, 0, 0], ['÷3 + desenfoque 1', 3, 1, 0],
  ['÷3 + ruido σ=15', 3, 0, 15], ['÷2 + desenfoque 1 + ruido σ=20', 2, 1, 20], ['÷4 (120px)', 4, 0, 0],
];
for (const [nombre, f, b, s] of casos) {
  let okc = 0; const M = 60;
  for (const t of tokens.slice(0, M)) { const base = await rgba(t, 480); if (dec(degradar(base, f, b, s)) === t) okc++; }
  console.log(`${nombre}: ${okc}/${M} (${Math.round(okc / M * 100)}%)`);
}
// 4) Un QR de otro contenido NO debe confundirse con un token
const otro = await rgba('https://example.com/hola', 480);
console.log('QR ajeno decodifica a:', dec(otro));
