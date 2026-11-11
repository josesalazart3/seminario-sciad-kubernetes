// Notificaciones (CU-09): Fase 3 lo reconcilia al backend real — NotificacionDto {tipo, mensaje,
// fecha, leida, personaNombre}. El backend no expone severidad: el tipo diferencia el evento y el
// ícono se deriva de él. "Marcar todas" se implementa en el cliente (un PATCH por no leída).
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { NotificationsService } from '../../core/services/crud.service';
import { Notificacion } from '../../core/models/access-log.model';
import { Card } from '../../shared/ui/card.component';
import { Button } from '../../shared/ui/button.component';
import { Icon, IconName } from '../../shared/ui/icon.component';
import { EmptyState } from '../../shared/ui/empty-state.component';
import { ToastService } from '../../shared/ui/toast.service';
import { LoadError } from '../../shared/ui/load-error.component';
import { recurso } from '../../core/util/recurso';
import { map } from 'rxjs';

const TIPO_LABELS: Record<string, string> = {
  concentracion: 'Concentración inusual',
  token_revocado: 'Credencial revocada en uso',
  fuera_horario: 'Acceso fuera de vigencia',
};
const TIPO_ICON: Record<string, IconName> = {
  concentracion: 'alertTriangle',
  token_revocado: 'alertTriangle',
  fuera_horario: 'clock',
};

function tipoLabel(tipo: string): string {
  return TIPO_LABELS[tipo] ?? tipo;
}
function tipoIcon(tipo: string): IconName {
  return TIPO_ICON[tipo] ?? 'info';
}
function tipoTone(tipo: string): 'danger' | 'warning' | 'info' {
  return tipo === 'token_revocado' ? 'danger' : tipo === 'fuera_horario' ? 'info' : 'warning';
}

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [LoadError, Card, Button, Icon, EmptyState],
  template: `
    <div class="page">
      <div class="page-header">
        <div class="page-heading">
          <h1>Notificaciones</h1>
          <p class="page-sub">Eventos anómalos detectados automáticamente (CU-09).</p>
        </div>
        <button sci-btn variant="secondary" size="md" iconName="check" [disabled]="unread() === 0" (click)="markAll()">
          Marcar todas leídas
        </button>
      </div>

      @if (loading()) {
        <div class="skels">@for (i of [1,2,3,4]; track i) { <div class="skel"></div> }</div>
      } @else if (carga.error(); as e) {
        <sci-load-error [message]="e" (retry)="carga.cargar()" />
      } @else if (notifs().length === 0) {
        <sci-card><sci-empty-state icon="bell" title="Sin notificaciones" message="No hay eventos anómalos pendientes." /></sci-card>
      } @else {
        <div class="list">
          @for (n of notifs(); track n.id) {
            <div class="note" [class.unread]="!n.leida">
              <span class="note-icon" [class]="'ic-' + tipoTone(n.tipo)"><sci-icon [name]="tipoIcon(n.tipo)" [size]="20" /></span>
              <div class="note-main">
                <div class="note-head">
                  <span class="note-type">{{ tipoLabel(n.tipo) }}</span>
                  @if (!n.leida) {
                    <span class="unread-dot" aria-label="No leída"></span>
                  }
                </div>
                <div class="note-msg">{{ n.mensaje }}</div>
                <div class="note-meta">
                  @if (n.personaNombre) {
                    <span class="chip">{{ n.personaNombre }}</span>
                  }
                  <span class="muted subtle">{{ date(n.fecha) }}</span>
                </div>
              </div>
              @if (!n.leida) {
                <button class="sci-btn-ghost" aria-label="Marcar leída" (click)="mark(n)"><sci-icon name="check" [size]="17" /></button>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      .skels { display: flex; flex-direction: column; gap: 10px; }
      .skel { height: 84px; border-radius: var(--radius-md); background: linear-gradient(90deg, var(--surface-sunken) 25%, var(--surface-muted) 50%, var(--surface-sunken) 75%); background-size: 200% 100%; animation: nt-shimmer 1.2s infinite; }
      @keyframes nt-shimmer { to { background-position: -200% 0; } }
      .list { display: flex; flex-direction: column; gap: 10px; }
      .note {
        display: flex; align-items: flex-start; gap: 14px;
        background: var(--surface); border: 1px solid var(--border);
        border-left-width: 3px; border-left-color: var(--sciad-warning);
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-sm); padding: 16px;
        transition: opacity var(--dur);
      }
      .note.unread { background: color-mix(in srgb, var(--surface) 96%, var(--sciad-warning) 4%); border-left-color: var(--sciad-danger); }
      .note-icon { margin-top: 2px; color: var(--sciad-warning); }
      .note-icon.ic-danger { color: var(--sciad-danger); }
      .note-icon.ic-info { color: var(--sciad-info); }
      .note-main { flex: 1; min-width: 0; }
      .note-head { display: flex; align-items: center; gap: 8px; }
      .note-type { font-weight: 700; font-size: 15px; color: var(--text); }
      .unread-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--sciad-warning); }
      .note-msg { font-size: 14px; color: var(--text-muted); margin-top: 4px; }
      .note-meta { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
    `,
  ],
})
export class NotificationsComponent implements OnInit {
  private readonly service = inject(NotificationsService);
  private readonly toast = inject(ToastService);

  protected readonly tipoLabel = tipoLabel;
  protected readonly tipoIcon = tipoIcon;
  protected readonly tipoTone = tipoTone;
  /** Carga común (Fase 8.2): estado cargando / listo / error + reintentar. */
  protected readonly carga = recurso(() => this.service.list().pipe(map((list) => [...list].sort((a, b) => (a.fecha < b.fecha ? 1 : -1)))), [] as Notificacion[], 'No se pudieron cargar las notificaciones.');
  protected readonly notifs = this.carga.datos;
  protected readonly loading = this.carga.cargando;
  protected readonly unread = computed(() => this.notifs().filter((n) => !n.leida).length);

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.carga.cargar(); // más recientes primero
  }

  protected mark(n: Notificacion): void {
    this.service.setLeida(n.id, true).subscribe({
      next: () => {
        this.notifs.update((list) => list.map((x) => (x.id === n.id ? { ...x, leida: true } : x)));
      },
      error: () => this.toast.error('Error', 'No se pudo marcar como leída.'),
    });
  }

  protected markAll(): void {
    const pendientes = this.notifs().filter((n) => !n.leida);
    let done = 0;
    for (const n of pendientes) {
      this.service.setLeida(n.id, true).subscribe({
        next: () => {
          done++;
          if (done === pendientes.length) {
            this.notifs.update((list) => list.map((x) => ({ ...x, leida: true })));
            this.toast.success('Todas leídas', 'Centro de notificaciones al día.');
          }
        },
      });
    }
  }

  protected date(iso: string): string {
    return new Date(iso).toLocaleString('es-GT', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}