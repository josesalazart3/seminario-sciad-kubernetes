// Portal de trazabilidad (CU-07): Fase 3 lo reconcilia al backend real — GET /registros-acceso
// con filtros de servidor (personaId, zonaId, desde, hasta, tipo). Tipo real: ingreso/egreso.
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { AccessLogService, PersonasService, ZonasService } from '../../core/services/crud.service';
import { AuthService } from '../../core/services/auth.service';
import { RegistroHistorial } from '../../core/models/access-log.model';
import { Zona } from '../../core/models/access.model';
import { Card } from '../../shared/ui/card.component';
import { Button } from '../../shared/ui/button.component';
import { Badge, StatusKey } from '../../shared/ui/badge.component';
import { EmptyState } from '../../shared/ui/empty-state.component';
import { fechaLocal, horaLocal } from '../../core/util/time';
import { LoadError } from '../../shared/ui/load-error.component';
import { recurso } from '../../core/util/recurso';
import { tap } from 'rxjs';

function badgeTipo(tipo: string): StatusKey {
  return tipo === 'ingreso' ? 'activo' : 'inactivo';
}

@Component({
  selector: 'app-traceability',
  standalone: true,
  imports: [LoadError, Card, Button, Badge, EmptyState],
  template: `
    <div class="page">
      <div class="page-header">
        <div class="page-heading">
          <h1>Portal de trazabilidad</h1>
          <p class="page-sub">Historial de accesos filtrable por persona, zona y fecha (CU-07).</p>
        </div>
      </div>

      <div class="filters">
        <select class="fselect" [value]="personaId()" (change)="onPersona($event)">
          <option value="">Todas las personas</option>
          @for (p of personas(); track p.id) {
            <option [value]="p.id">{{ p.nombre }}</option>
          }
        </select>
        <select class="fselect" [value]="zonaId()" (change)="onZona($event)">
          <option value="">Todas las zonas</option>
          @for (z of zonas(); track z.id) {
            <option [value]="z.id">{{ z.nombre }}</option>
          }
        </select>
        <input class="fselect" type="date" [value]="fecha()" (change)="onFecha($event)" />
        @if (hasFilters()) {
          <button sci-btn variant="ghost" size="sm" iconName="x" (click)="clear()">Limpiar</button>
        }
      </div>

      <sci-card>
        <div class="flush">
          @if (loading()) {
            <table class="sci-table"><tbody>
              @for (i of [1,2,3,4,5]; track i) {
                <tr class="sci-skel-row">@for (c of [1,2,3,4,5]; track c) {<td><div class="skel"></div></td>}</tr>
              }
            </tbody></table>
          } @else if (carga.error(); as e) {
            <sci-load-error [message]="e" (retry)="carga.cargar()" />
          } @else if (rows().length === 0) {
            <sci-empty-state icon="activity" title="Sin resultados" message="No hay accesos que coincidan con los filtros." />
          } @else {
            <table class="sci-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th class="hide-sm">Hora</th>
                  <th>Persona</th>
                  <th>Zona</th>
                  <th class="hide-sm">Tipo</th>
                  <th class="hide-md">Registrado por</th>
                </tr>
              </thead>
              <tbody>
                @for (r of rows(); track r.id) {
                  <tr>
                    <td class="cell-muted">{{ fechaDe(r) }}</td>
                    <td class="cell-muted hide-sm">{{ horaDe(r) }}</td>
                    <td class="cell-strong">{{ r.personaNombre }}</td>
                    <td>{{ r.zonaNombre }}</td>
                    <td class="hide-sm"><sci-badge [status]="badgeTipo(r.tipo)" [label]="r.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'" /></td>
                    <td class="cell-muted hide-md">{{ r.registradoPor }}</td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </div>
      </sci-card>
    </div>
  `,
  styles: [
    `
      .filters { display: flex; gap: 12px; flex-wrap: wrap; }
      .fselect {
        height: 40px; padding: 0 34px 0 12px; border-radius: var(--radius-sm);
        border: 1px solid var(--border-strong); background: var(--surface); color: var(--text); font-size: 14px;
      }
      .fselect:focus { outline: none; border-color: var(--sciad-brand); box-shadow: 0 0 0 3px var(--sciad-brand-soft); }
    `,
  ],
})
export class TraceabilityComponent implements OnInit {
  private readonly service = inject(AccessLogService);
  private readonly personasSvc = inject(PersonasService);
  private readonly auth = inject(AuthService);
  private readonly zonasSvc = inject(ZonasService);

  protected readonly badgeTipo = badgeTipo;

  // fecha/hora vienen en hora de Guatemala (Fase 4): se muestran en la hora del dispositivo.
  protected fechaDe(r: RegistroHistorial): string { return fechaLocal(r.fecha, r.hora); }
  protected horaDe(r: RegistroHistorial): string { return horaLocal(r.fecha, r.hora); }
  /** Carga común (Fase 8.2): estado cargando / listo / error + reintentar. */
  protected readonly carga = recurso(() => this.service
      .historial({
        personaId: this.personaId() ? +this.personaId() : undefined,
        zonaId: this.zonaId() ? +this.zonaId() : undefined,
        desde: this.fecha() ? this.fecha() : undefined,
        hasta: this.fecha() ? this.fecha() : undefined,
      })
      .pipe(tap((list) => this.recordarPersonas(list))), [] as RegistroHistorial[], 'No se pudo cargar el historial de accesos.');
  protected readonly rows = this.carga.datos;
  protected readonly loading = this.carga.cargando;
  // Opciones del filtro "persona": el Administrador usa el listado completo del backend; Gerencia/Auditoría (que no tiene
  // permiso sobre /api/personas) usa las personas que aparecen en los registros ya cargados.
  private readonly personasApi = signal<{ id: string; nombre: string }[]>([]);
  private readonly personasVistas = signal<{ id: string; nombre: string }[]>([]);
  protected readonly personas = computed(() => (this.personasApi().length ? this.personasApi() : this.personasVistas()));
  protected readonly zonas = signal<Zona[]>([]);
  protected readonly personaId = signal('');
  protected readonly zonaId = signal('');
  protected readonly fecha = signal('');

  protected readonly hasFilters = computed(
    () => !!this.personaId() || !!this.zonaId() || !!this.fecha(),
  );

  ngOnInit(): void {
    this.load();
    // GET /api/personas es solo del Administrador (RequireAdmin, PG2 §4.3.2). Gerencia/Auditoría no lo pide: su filtro
    // de personas se arma con los registros que ya consulta (historial).
    if (this.auth.role() === 'ADMIN') {
      this.personasSvc.list('todos').subscribe({
        next: (ps) => this.personasApi.set(ps.map((p) => ({ id: String(p.id), nombre: p.nombre }))),
        error: () => undefined,
      });
    }
    this.zonasSvc.list('todos').subscribe((zs) => this.zonas.set(zs));
  }

  protected load(): void {
    this.carga.cargar(); // usa los filtros vigentes
  }

  /** Acumula (sin repetir) las personas vistas en los registros para poblar el filtro. */
  private recordarPersonas(list: RegistroHistorial[]): void {
    const actuales = new Map(this.personasVistas().map((p) => [p.id, p.nombre]));
    for (const r of list) actuales.set(String(r.personaId), r.personaNombre);
    if (actuales.size !== this.personasVistas().length) {
      this.personasVistas.set([...actuales].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')));
    }
  }

  protected onPersona(e: Event): void {
    this.personaId.set((e.target as HTMLSelectElement).value);
    this.load();
  }
  protected onZona(e: Event): void {
    this.zonaId.set((e.target as HTMLSelectElement).value);
    this.load();
  }
  protected onFecha(e: Event): void {
    this.fecha.set((e.target as HTMLInputElement).value);
    this.load();
  }

  protected clear(): void {
    this.personaId.set('');
    this.zonaId.set('');
    this.fecha.set('');
    this.load();
  }
}