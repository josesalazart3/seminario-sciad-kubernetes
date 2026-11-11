// <sci-qr [value]="token" [size]="220" /> — dibuja el QR real de un valor (carga diferida de la librería).
import { Component, effect, input, signal } from '@angular/core';
import { qrDataUrl } from '../../core/util/qr';

@Component({
  selector: 'sci-qr',
  standalone: true,
  template: `
    @if (src(); as s) {
      <img [src]="s" [width]="size()" [height]="size()" [alt]="alt()" class="qr-img" />
    } @else {
      <div class="qr-ph" [style.width.px]="size()" [style.height.px]="size()" aria-hidden="true"></div>
    }
  `,
  styles: [
    `
      :host { display: inline-block; line-height: 0; }
      .qr-img { display: block; background: #fff; border-radius: 6px; image-rendering: pixelated; }
      .qr-ph { border-radius: 6px; background: var(--surface-sunken); }
    `,
  ],
})
export class QrImage {
  readonly value = input.required<string>();
  readonly size = input(220);
  readonly alt = input('Código QR de la credencial');

  protected readonly src = signal('');

  constructor() {
    effect((onCleanup) => {
      const v = this.value();
      const s = this.size();
      let cancelled = false;
      onCleanup(() => (cancelled = true));
      // Se genera al doble de resolución para que se vea nítido en pantallas de alta densidad.
      qrDataUrl(v, s * 2)
        .then((u) => !cancelled && this.src.set(u))
        .catch(() => !cancelled && this.src.set(''));
    });
  }
}
