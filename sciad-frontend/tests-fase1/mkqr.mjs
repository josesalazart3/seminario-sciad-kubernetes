import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(new URL('../package.json', import.meta.url));
const QRCode = require('qrcode');
// Sobres de prueba con el formato del QR real: «SCIAD1.» + 87 base64url (el mock no los descifra, solo los compara).
const sobre = (byte) => 'SCIAD1.' + Buffer.alloc(65, byte).toString('base64url');
const TOK = { A: sobre(0xc0), REV: sobre(0xde) };
for (const [k, v] of Object.entries(TOK)) if (!/^SCIAD1\.[A-Za-z0-9_-]{87}$/.test(v)) throw new Error(k);
writeFileSync('tokens.json', JSON.stringify(TOK));
for (const [name, text] of [['A', TOK.A], ['REV', TOK.REV], ['ALIEN', 'https://example.com/promo?x=1']]) {
  writeFileSync(`qr_${name}.png`, await QRCode.toBuffer(text, { errorCorrectionLevel: 'M', margin: 3, width: 220 }));
}
console.log('qr listos', TOK);
