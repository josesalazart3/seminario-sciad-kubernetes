import { Component, computed, input } from '@angular/core';

export type StatusKey =
  | 'activo'
  | 'inactivo'
  | 'autorizado'
  | 'denegado'
  | 'pendiente'
  | 'revisando'
  | 'revocado'
  | 'vencido'
  | 'abierto'
  | 'resuelto'
  | 'baja'
  | 'media'
  | 'alta'
  | 'critica';

const STATUS_META: Record<
  StatusKey,
  { label: string; tone: 'success' | 'danger' | 'warning' | 'info' | 'neutral' }
> = {
  activo: { label: 'Activo', tone: 'success' },
  inactivo: { label: 'Inactivo', tone: 'neutral' },
  autorizado: { label: 'Autorizado', tone: 'success' },
  denegado: { label: 'Denegado', tone: 'danger' },
  pendiente: { label: 'Pendiente', tone: 'warning' },
  revisando: { label: 'En revisión', tone: 'warning' },
  revocado: { label: 'Revocado', tone: 'danger' },
  vencido: { label: 'Vencido', tone: 'neutral' },
  abierto: { label: 'Abierto', tone: 'warning' },
  resuelto: { label: 'Resuelto', tone: 'success' },
  baja: { label: 'Baja', tone: 'info' },
  media: { label: 'Media', tone: 'warning' },
  alta: { label: 'Alta', tone: 'danger' },
  critica: { label: 'Crítica', tone: 'danger' },
};

@Component({
  selector: 'sci-badge',
  standalone: true,
  template: `
    <span class="badge" [class]="'tone-' + tone()">
      <span class="dot" aria-hidden="true"></span>
      <span class="text">
        @if (label(); as l) {
          {{ l }}
        } @else {
          {{ meta().label }}
        }
      </span>
    </span>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 3px 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
        line-height: 1.4;
      }
      .dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: currentColor;
      }
      .tone-success {
        color: var(--sciad-success);
        background: var(--sciad-success-soft);
      }
      .tone-danger {
        color: var(--sciad-danger);
        background: var(--sciad-danger-soft);
      }
      .tone-warning {
        color: var(--sciad-warning);
        background: var(--sciad-warning-soft);
      }
      .tone-info {
        color: var(--sciad-info);
        background: var(--sciad-info-soft);
      }
      .tone-neutral {
        color: var(--text-muted);
        background: var(--surface-sunken);
      }
    `,
  ],
})
export class Badge {
  readonly status = input<StatusKey>('activo');
  readonly label = input<string | null>(null);
  protected readonly meta = computed(() => STATUS_META[this.status()] ?? STATUS_META.activo);
  protected readonly tone = computed(() => this.meta().tone);
}
