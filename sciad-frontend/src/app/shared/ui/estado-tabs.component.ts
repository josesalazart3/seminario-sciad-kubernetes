// Pestañas Activos / Deshabilitados / Todos con conteo (Fase 8.4). Accesibles: role="tablist"/"tab", aria-selected,
// foco itinerante (solo la pestaña elegida es tabulable) y teclado ← → Inicio Fin.
import { Component, ElementRef, input, output, viewChildren } from '@angular/core';
import { ConteosEstado, PestanaEstado } from '../../core/util/gestor-estado';

const PESTANAS: { valor: PestanaEstado; etiqueta: string }[] = [
  { valor: 'activos', etiqueta: 'Activos' },
  { valor: 'deshabilitados', etiqueta: 'Deshabilitados' },
  { valor: 'todos', etiqueta: 'Todos' },
];

@Component({
  selector: 'sci-estado-tabs',
  standalone: true,
  template: `
    <div class="tabs" role="tablist" [attr.aria-label]="etiqueta()" (keydown)="teclado($event)">
      @for (p of pestanas; track p.valor; let i = $index) {
        <button
          #tab
          type="button"
          role="tab"
          class="tab"
          [id]="'tab-' + p.valor"
          [class.on]="valor() === p.valor"
          [attr.aria-selected]="valor() === p.valor"
          [attr.aria-controls]="controla()"
          [attr.tabindex]="valor() === p.valor ? 0 : -1"
          [attr.data-estado]="p.valor"
          (click)="cambio.emit(p.valor)"
        >
          {{ p.etiqueta }}
          <span class="count" [attr.aria-label]="conteos()[p.valor] + ' registros'">{{ conteos()[p.valor] }}</span>
        </button>
      }
    </div>
  `,
  styles: [
    `
      :host { display: block; }
      .tabs {
        display: inline-flex; gap: 4px; padding: 4px;
        background: var(--surface-sunken); border-radius: var(--radius-sm);
        max-width: 100%; overflow-x: auto;
      }
      .tab {
        display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 12px;
        border: 0; border-radius: 6px; background: transparent; color: var(--text-muted);
        font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap;
        transition: background var(--dur, 200ms) var(--ease-out, ease), color var(--dur, 200ms) var(--ease-out, ease);
      }
      .tab:hover { color: var(--text); }
      .tab.on { background: var(--surface); color: var(--text); box-shadow: var(--shadow-sm); }
      .tab:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--sciad-brand-soft); }
      .count {
        min-width: 22px; height: 20px; padding: 0 6px; border-radius: 999px;
        display: inline-grid; place-items: center; font-size: 12px; font-variant-numeric: tabular-nums;
        background: var(--surface-muted); color: var(--text-muted);
      }
      .tab.on .count { background: var(--sciad-brand-soft); color: var(--sciad-brand-strong); }
      @media (prefers-reduced-motion: reduce) { .tab { transition: none; } }
    `,
  ],
})
export class EstadoTabs {
  readonly valor = input.required<PestanaEstado>();
  readonly conteos = input.required<ConteosEstado>();
  readonly etiqueta = input('Filtrar por estado');
  /** id del panel (tabla) que controlan las pestañas. */
  readonly controla = input<string | null>(null);
  readonly cambio = output<PestanaEstado>();

  protected readonly pestanas = PESTANAS;
  private readonly botones = viewChildren<ElementRef<HTMLButtonElement>>('tab');

  protected teclado(ev: KeyboardEvent): void {
    const i = PESTANAS.findIndex((p) => p.valor === this.valor());
    const n = PESTANAS.length;
    const destino =
      ev.key === 'ArrowRight' ? (i + 1) % n
      : ev.key === 'ArrowLeft' ? (i - 1 + n) % n
      : ev.key === 'Home' ? 0
      : ev.key === 'End' ? n - 1
      : -1;
    if (destino < 0) return;
    ev.preventDefault();
    this.cambio.emit(PESTANAS[destino].valor);
    this.botones()[destino]?.nativeElement.focus();
  }
}
