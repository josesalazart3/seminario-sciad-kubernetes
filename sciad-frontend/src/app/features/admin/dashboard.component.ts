// Panel de control: Fase 3 lo reconcilia al backend real. Los KPI se componen en el cliente
// (decisión aprobada en su momento): históricos de hoy, personas activas,
// notificaciones no leídas y credenciales emitidas. No existe endpoint "dashboard" en el backend.
import { Component, computed, inject, OnInit } from '@angular/core';
import { forkJoin, map } from 'rxjs';
import { RouterLink } from '@angular/router';
import {
  AccessLogService,
  CredentialsService,
  NotificationsService,
  PersonasService,
} from '../../core/services/crud.service';
import { RegistroHistorial } from '../../core/models/access-log.model';
import { KpiCard } from '../../shared/ui/kpi-card.component';
import { horaLocal, hoyServidor } from '../../core/util/time';
import { Card } from '../../shared/ui/card.component';
import { LoadError } from '../../shared/ui/load-error.component';
import { recurso } from '../../core/util/recurso';

const VACIO = {
  accesosHoy: '—',
  personasActivas: '—',
  credencialesEmitidas: '—',
  alertasPendientes: '—',
  events: [] as RegistroHistorial[],
  alerts: [] as { id: string; personaNombre?: string; mensaje: string; fecha: string }[],
};

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [KpiCard, Card, RouterLink, LoadError],
  template: `
    <div class="page">
      <div class="page-header">
        <div class="page-heading">
          <h1>Panel de control</h1>
          <p class="page-sub">Resumen de la operación de accesos de hoy.</p>
        </div>
      </div>

      @if (carga.error(); as e) {
        <sci-card><sci-load-error [message]="e" (retry)="carga.cargar()" /></sci-card>
      }

      <section class="grid grid-cols-4">
        <sci-kpi-card title="Accesos hoy" [value]="accesosHoy()" icon="activity" tone="brand" [loading]="loading()" />
        <sci-kpi-card title="Personas activas" [value]="personasActivas()" icon="users" tone="info" [loading]="loading()" />
        <sci-kpi-card title="Alertas pendientes" [value]="alertasPendientes()" icon="bell" tone="danger" [loading]="loading()" />
        <sci-kpi-card title="Credenciales activas" [value]="credencialesEmitidas()" icon="qr" tone="success" [loading]="loading()" />
      </section>

      <section class="grid grid-cols-3">
        <sci-card class="col-span-2">
          <div class="section-head">
            <span class="section-title">Actividad reciente</span>
            <a routerLink="/admin/accesos" class="ghost-link">Ver accesos de hoy</a>
          </div>
          <div class="section-body--flush">
            @if (loading()) {
              @for (i of [1,2,3,4]; track i) {
                <div class="skel-row"><div class="skel"></div></div>
              }
            } @else {
              <div class="event-list">
                @for (ev of events(); track ev.id) {
                  <div class="event">
                    <span class="event-dot" [class]="'t-' + ev.tipo"></span>
                    <div class="event-main">
                      <div class="event-title">
                        {{ ev.personaNombre }}
                        <span class="event-tag" [class]="'t-' + ev.tipo">
                          {{ ev.tipo === 'ingreso' ? 'Ingreso' : 'Egreso' }}
                        </span>
                      </div>
                      <div class="event-sub">{{ ev.zonaNombre }} · {{ horaDe(ev) }}</div>
                    </div>
                  </div>
                } @empty {
                  <div class="event-empty">Sin actividad registrada hoy.</div>
                }
              </div>
            }
          </div>
        </sci-card>

        <sci-card>
          <div class="section-head">
            <span class="section-title">Alertas recientes</span>
          </div>
          <div class="section-body">
            @for (n of alerts(); track n.id) {
              <div class="alert">
                <span class="alert-dot"></span>
                <div>
                  <div class="alert-title">{{ n.personaNombre ?? 'Sistema' }}</div>
                  <div class="alert-sub">{{ n.mensaje }}</div>
                  <div class="alert-when">{{ time(n.fecha) }}</div>
                </div>
              </div>
            } @empty {
              <p class="muted">No hay alertas pendientes.</p>
            }
            <a routerLink="/admin/auditoria" class="ghost-link">Ir a auditoría</a>
          </div>
        </sci-card>
      </section>
    </div>
  `,
  styles: [
    `
      .col-span-2 { grid-column: span 2; }
      @media (max-width: 1023px) { .col-span-2 { grid-column: span 2; } }
      @media (max-width: 639px) { .col-span-2 { grid-column: span 1; } }
      .section-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid var(--border);
      }
      .section-title { font-size: 16px; font-weight: 600; }
      .ghost-link { font-size: 13px; color: var(--sciad-brand); text-decoration: none; font-weight: 600; }
      .section-body--flush { padding: 4px 0; }
      .section-body {
        padding: 16px 20px;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .event-list { display: flex; flex-direction: column; }
      .event {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 20px;
        border-bottom: 1px solid var(--border);
      }
      .event:last-child { border-bottom: none; }
      .event-dot { width: 9px; height: 9px; border-radius: 50%; flex: none; background: var(--text-subtle); }
      .t-ingreso { background: var(--sciad-success); }
      .t-egreso { background: var(--sciad-info); }
      .event-tag {
        display: inline-block;
        font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em;
        margin-left: 8px;
      }
      .event-main { min-width: 0; }
      .event-title { font-weight: 600; font-size: 14px; color: var(--text); }
      .event-sub { font-size: 12px; color: var(--text-subtle); }
      .event-empty { padding: 24px; color: var(--text-muted); text-align: center; font-size: 14px; }
      .skel-row { padding: 16px 20px; border-bottom: 1px solid var(--border); }
      .skel {
        height: 34px; border-radius: 6px;
        background: linear-gradient(90deg, var(--surface-sunken) 25%, var(--surface-muted) 50%, var(--surface-sunken) 75%);
        background-size: 200% 100%; animation: dash-shimmer 1.2s infinite;
      }
      @keyframes dash-shimmer { to { background-position: -200% 0; } }
      .alert { display: flex; gap: 10px; align-items: flex-start; }
      .alert-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 6px; flex: none; background: var(--sciad-danger); }
      .alert-title { font-weight: 600; font-size: 13px; color: var(--text); }
      .alert-sub { font-size: 12px; color: var(--text-muted); }
      .alert-when { font-size: 11px; color: var(--text-subtle); margin-top: 2px; }
      .section-body a.ghost-link { align-self: flex-start; }
    `,
  ],
})
export class AdminDashboardComponent implements OnInit {
  private readonly logs = inject(AccessLogService);
  private readonly personasSvc = inject(PersonasService);
  private readonly cred = inject(CredentialsService);
  private readonly notif = inject(NotificationsService);

  /** Carga común (Fase 8.2): todos los KPI juntos; si algo falla se muestra el error con "Reintentar" (antes quedaban
   *  en "cargando" para siempre). "Personas activas" usa el total real del servidor (antes contaba una página de 500). */
  protected readonly carga = recurso(
    () => {
      const hoy = hoyServidor();
      return forkJoin({
        // Solo la página de "actividad reciente" (6 más nuevos) y el KPI con el `total` real del servidor.
        hist: this.logs.historialPagina({ desde: hoy, hasta: hoy, tamanoPagina: 6 }),
        activas: this.personasSvc.contar('activo'),
        creds: this.cred.list(),
        notifs: this.notif.list(),
      }).pipe(
        map(({ hist, activas, creds, notifs }) => {
          const noLeidas = notifs.filter((n) => !n.leida);
          return {
            accesosHoy: String(hist.total),
            personasActivas: String(activas),
            credencialesEmitidas: String(creds.filter((c) => c.estado === 'activa').length),
            alertasPendientes: String(noLeidas.length),
            events: [...hist.items].sort((a, b) => (a.fecha + a.hora < b.fecha + b.hora ? 1 : -1)).slice(0, 6),
            alerts: noLeidas.slice(0, 4).map((n) => ({
              id: n.id,
              personaNombre: n.personaNombre ?? undefined,
              mensaje: n.mensaje,
              fecha: n.fecha,
            })),
          };
        }),
      );
    },
    VACIO,
    'No se pudo cargar el panel de control.',
  );
  protected readonly loading = this.carga.cargando;
  protected readonly accesosHoy = computed(() => this.carga.datos().accesosHoy);
  protected readonly personasActivas = computed(() => this.carga.datos().personasActivas);
  protected readonly alertasPendientes = computed(() => this.carga.datos().alertasPendientes);
  protected readonly credencialesEmitidas = computed(() => this.carga.datos().credencialesEmitidas);
  protected readonly events = computed(() => this.carga.datos().events);
  protected readonly alerts = computed(() => this.carga.datos().alerts);

  ngOnInit(): void {
    this.carga.cargar();
  }

  /** La hora del registro viene en hora de Guatemala: se muestra en la hora del dispositivo. */
  protected horaDe(ev: RegistroHistorial): string {
    return horaLocal(ev.fecha, ev.hora);
  }

  protected time(iso: string): string {
    return new Date(iso).toLocaleString('es-GT', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}