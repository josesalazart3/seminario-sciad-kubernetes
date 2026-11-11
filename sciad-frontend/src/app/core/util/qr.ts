// Generación de la imagen QR de una credencial (descarga PNG e impresión de gafete).
// El QR codifica únicamente el sobre cifrado «SCIAD1.…» que entrega el servidor; el nombre del titular solo aparece en el gafete
// impreso, nunca dentro del código (RNF-01 / RNF-10).

/** Escapa texto para insertarlo en HTML (el gafete se arma como HTML en un iframe). */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Nonce de la CSP (lo inyecta nginx en <app-root ngCspNonce>); el gafete impreso lo necesita para su <style>. */
function cspNonce(): string {
  const el = document.querySelector('[ngcspnonce]');
  const n = el?.getAttribute('ngcspnonce') ?? '';
  return /^[A-Za-z0-9+/=_-]{8,}$/.test(n) ? n : '';
}

/** PNG (data URL) del QR. `size` es el ancho en píxeles; incluye zona de silencio blanca. */
export async function qrDataUrl(value: string, size = 480): Promise<string> {
  const QRCode = (await import('qrcode')).default;
  return QRCode.toDataURL(value, {
    errorCorrectionLevel: 'M',
    margin: 3,
    width: size,
    color: { dark: '#000000', light: '#ffffff' },
  });
}

/** Nombre de archivo seguro a partir de un texto libre. */
export function safeFileName(s: string): string {
  const base = s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return base || 'credencial';
}

/** Descarga el QR (sobre cifrado) como PNG. */
export async function descargarQrPng(qr: string, titular: string): Promise<void> {
  const url = await qrDataUrl(qr, 720);
  const a = document.createElement('a');
  a.href = url;
  a.download = `QR_${safeFileName(titular)}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export interface DatosGafete {
  qr: string; // sobre cifrado que va en el código
  codigo: string; // código corto de la credencial (se imprime abreviado)
  titular: string;
  tipo: string; // Colaborador / Visitante
}

/** Abre el diálogo de impresión con el gafete (tarjeta de 86×54 mm aprox.). */
export async function imprimirGafete(d: DatosGafete): Promise<void> {
  const img = await qrDataUrl(d.qr, 600);
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Gafete</title>
<style${cspNonce() ? ` nonce="${cspNonce()}"` : ''}>
  @page { size: auto; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: #0f172a; }
  .badge { width: 86mm; height: 120mm; border: 0.4mm solid #0f172a; border-radius: 4mm; padding: 6mm;
           display: flex; flex-direction: column; align-items: center; justify-content: space-between; }
  .brand { font-weight: 800; letter-spacing: .12em; font-size: 5mm; color: #3b5bdb; }
  .qr { width: 62mm; height: 62mm; }
  .name { font-size: 6mm; font-weight: 700; text-align: center; line-height: 1.15; }
  .tipo { font-size: 3.6mm; text-transform: uppercase; letter-spacing: .1em; color: #475569; }
  .tok { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 2.2mm; color: #64748b; }
</style></head><body>
<div class="badge">
  <div class="brand">SCIAD</div>
  <img class="qr" src="${img}" alt="Código QR">
  <div><div class="name">${escapeHtml(d.titular)}</div><div class="tipo" style="text-align:center;margin-top:2mm">${escapeHtml(d.tipo)}</div></div>
  <div class="tok">${escapeHtml(d.codigo)}…</div>
</div></body></html>`;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc || !iframe.contentWindow) {
    iframe.remove();
    throw new Error('No se pudo preparar la impresión.');
  }
  doc.open();
  doc.write(html);
  doc.close();

  const imgEl = doc.querySelector('img');
  const imprimir = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    // Se retira el iframe un poco después para no cortar el diálogo de impresión.
    setTimeout(() => iframe.remove(), 60_000);
  };
  if (imgEl && !imgEl.complete) {
    imgEl.addEventListener('load', imprimir, { once: true });
  } else {
    imprimir();
  }
}
