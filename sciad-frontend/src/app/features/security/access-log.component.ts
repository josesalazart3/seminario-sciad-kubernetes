// Accesos del turno (CU-05): Fase 3 lo reconcilia al backend real — GET /registros-acceso/hoy
// (AccesoDelDiaDto), que es el endpoint que el rol Personal de Seguridad SÍ puede leer
// ([RequireSeguridadOAdmin]). El historial completo (GET /registros-acceso, RegistroHistorialDto)
// es de Admin/Gerencia, así que esta pantalla de Seguridad muestra la presencia de hoy por zona
// (persona, zona, último movimiento y si está dentro) en lugar de la bitácora de movimientos.
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { AccessLogService } from '../../core/services/crud.service';
import { AccesoDelDia } from '../../core/models/access-log.model';
import { Button } from '../../shared/ui/button.component';
import { Card } from '../../shared/ui/card.component';
import { EmptyState } from '../../shared/ui/empty-state.component';
import { ToastService } from '../../shared/ui/toast.service';
import { horaLocal, hoyServidor } from '../../core/util/time';
import { LoadError } from '../../shared/ui/load-error.component';
import { recurso } from '../../core/util/recurso';

@Component({
  selector: 'app-access-log',
  standalone: true,
  imports: [LoadError, Button, Card, EmptyState],
  template: `
    <div class="log">
      <div class="log-head">
        <div class="page-heading">
          <h1>Accesos del turno</h1>
          <p class="page-sub">Personas presentes en las zonas hoy (CU-05).</p>
        </div>
        <button sci-btn variant="ghost" size="sm" iconName="refresh" (click)="load()">Actualizar</button>
      </div>

      <div class="stats">
        <div class="stat">
          <div class="stat-val ok mono">{{ counts().dentro }}</div>
          <div class="stat-lab">Dentro</div>
        </div>
        <div class="stat">
          <div class="stat-val bad mono">{{ counts().fuera }}</div>
          <div class="stat-lab">Fuera</div>
        </div>
        <div class="stat">
          <div class="stat-val mono">{{ counts().total }}</div>
          <div class="stat-lab">Total</div>
        </div>
      </div>

      @if (loading()) {
        <div class="skels">@for (i of [1,2,3,4,5]; track i) { <div class="skel"></div> }</div>
      } @else if (carga.error(); as e) {
        <sci-load-error [message]="e" (retry)="carga.cargar()" />
      } @else if (rows().length === 0) {
        <sci-card><sci-empty-state icon="clock" title="Sin movimientos hoy" message="Aún no hay registros de acceso hoy." /></sci-card>
      } @else {
        <div class="list">
          @for (r of rows(); track r.personaId + '-' + r.zonaId) {
            <div class="row" [class]="r.dentro ? 'r-ingreso' : 'r-egreso'">
              <span class="row-dot"></span>
              <div class="row-main">
                <div class="row-title">{{ r.personaNombre }}</div>
                <div class="row-sub">{{ r.zonaNombre }} · {{ r.dentro ? 'dentro' : 'fuera' }}</div>
              </div>
              <div class="row-right">
                <span class="row-type mono">{{ r.ultimoTipo === 'ingreso' ? 'IN' : 'OUT' }}</span>
                <span class="mono">{{ hora(r.ultimaHora) }}</span>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host { display: block; }
      .log { max-width: 680px; margin: 0 auto; padding: 20px 16px 40px; display: flex; flex-direction: column; gap: 18px; }
      .log-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
      .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
      .stat { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: var(--shadow-sm); padding: 14px; display: flex; flex-direction: column; gap: 4px; }
      .stat-val { font-size: 26px; font-weight: 700; line-height: 1; }
      .stat-val.ok { color: var(--sciad-success); }
      .stat-val.bad { color: var(--sciad-warning); }
      .stat-lab { font-size: 12px; color: var(--text-muted); }

      .skels { display: flex; flex-direction: column; gap: 10px; }
      .skel { height: 72px; border-radius: var(--radius-md); background: linear-gradient(90deg, var(--surface-sunken) 25%, var(--surface-muted) 50%, var(--surface-sunken) 75%); background-size: 200% 100%; animation: al-shimmer 1.2s infinite; }
      @keyframes al-shimmer { to { background-position: -200% 0; } }

      .list { display: flex; flex-direction: column; gap: 10px; }
      .row {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        background: var(--surface);
        border: 1px solid var(--border);
        border-left-width: 3px;
        border-radius: var(--radius-md);
        padding: 14px;
      }
      .r-ingreso { border-left-color: var(--sciad-success); }
      .r-egreso { border-left-color: var(--sciad-info); }
      .row-dot { width: 9px; height: 9px; border-radius: 50%; margin-top: 6px; flex: none; }
      .r-ingreso .row-dot { background: var(--sciad-success); }
      .r-egreso .row-dot { background: var(--sciad-info); }
      .row-main { flex: 1; min-width: 0; }
      .row-title { font-weight: 600; font-size: 14px; color: var(--text); }
      .row-sub { font-size: 12px; color: var(--text-muted); }
      .row-right { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; font-size: 12px; color: var(--text-muted); }
    `,
  ],
})
export class AccessLogComponent implements OnInit {
  private readonly service = inject(AccessLogService);
  private readonly toast = inject(ToastService);

  /** Carga común (Fase 8.2): estado cargando / listo / error + reintentar. */
  protected readonly carga = recurso(() => this.service.hoy(), [] as AccesoDelDia[], 'No se pudieron cargar los accesos de hoy.');
  protected readonly records = this.carga.datos;
  protected readonly loading = this.carga.cargando;

  /** La hora llega en hora de Guatemala ("hoy" = día de Guatemala): se muestra en la hora del dispositivo. */
  protected hora(h: string | null | undefined): string {
    return horaLocal(hoyServidor(), h);
  }

  protected readonly counts = computed(() => {
    const rows = this.records();
    return {
      total: rows.length,
      dentro: rows.filter((r) => r.dentro).length,
      fuera: rows.filter((r) => !r.dentro).length,
    };
  });
  protected readonly rows = computed(() =>
    [...this.records()].sort((a, b) => ((a.ultimaHora || '') < (b.ultimaHora || '') ? 1 : -1)),
  );

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.carga.cargar();
  }
}
