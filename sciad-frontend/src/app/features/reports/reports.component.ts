// Reportes (CU-07): Fase 3 lo reconcilia al backend real — GET /reportes (metadatos paginados) y
// POST /reportes/generar (CSV en memoria con encabezados Fecha,Hora,Persona,Zona,Tipo,RegistradoPor).
// El backend NO guarda el archivo: solo el periodo, total y quién. La lista mostrada es esa metadata.
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ReportsService, PersonasService, ZonasService } from '../../core/services/crud.service';
import { AuthService } from '../../core/services/auth.service';
import { Reporte } from '../../core/models/reporte.model';
import { Persona } from '../../core/models/persona.model';
import { Zona } from '../../core/models/access.model';
import { KpiCard } from '../../shared/ui/kpi-card.component';
import { Card } from '../../shared/ui/card.component';
import { Button } from '../../shared/ui/button.component';
import { EmptyState } from '../../shared/ui/empty-state.component';
import { Modal } from '../../shared/ui/modal.component';
import { SciInput, SciSelect } from '../../shared/ui/field.component';
import { ToastService } from '../../shared/ui/toast.service';
import { LoadError } from '../../shared/ui/load-error.component';
import { recurso } from '../../core/util/recurso';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [LoadError, KpiCard, Card, Button, EmptyState, Modal, SciInput, SciSelect, ReactiveFormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div class="page-heading">
          <h1>Reportes</h1>
          <p class="page-sub">Generación y consulta del reporte consolidado de accesos (CU-07).</p>
        </div>
        <div class="page-actions">
          <button sci-btn variant="ghost" size="md" iconName="refresh" (click)="load()">Refrescar</button>
          <button sci-btn variant="primary" size="md" iconName="download" [disabled]="generating()" (click)="open()">Generar reporte</button>
        </div>
      </div>

      <section class="grid grid-cols-3">
        <sci-kpi-card title="Reportes generados" [value]="stats().totalReportes" icon="file" tone="brand" [loading]="loading()" />
        <sci-kpi-card title="Registros incluidos" [value]="stats().totalRegistros" icon="activity" tone="info" [loading]="loading()" />
        <sci-kpi-card title="Último periodo" [value]="stats().ultimoPeriodo" icon="calendar" tone="success" [loading]="loading()" />
      </section>

      <sci-card>
        <div class="section-head">
          <span class="section-title">Reportes generados</span>
        </div>
        <div class="flush">
          @if (loading()) {
            <table class="sci-table"><tbody>
              @for (i of [1,2,3,4]; track i) {
                <tr class="sci-skel-row">@for (c of [1,2,3,4]; track c) {<td><div class="skel"></div></td>}</tr>
              }
            </tbody></table>
          } @else if (carga.error(); as e) {
            <sci-load-error [message]="e" (retry)="carga.cargar()" />
          } @else if (reportes().length === 0) {
            <sci-empty-state icon="file" title="Sin reportes" message="Aún no se ha generado ningún reporte.">
              <button sci-btn variant="primary" size="sm" iconName="download" (click)="open()">Generar el primero</button>
            </sci-empty-state>
          } @else {
            <table class="sci-table">
              <thead><tr><th>Periodo</th><th>Registros</th><th class="hide-sm">Generado</th><th class="hide-md">Generado por</th></tr></thead>
              <tbody>
                @for (r of reportes(); track r.id) {
                  <tr>
                    <td class="cell-strong">{{ r.periodo }}</td>
                    <td class="cell-mono">{{ r.totalRegistros }}</td>
                    <td class="cell-muted hide-sm">{{ r.generado }}</td>
                    <td class="cell-muted hide-md">{{ r.generadoPor }}</td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </div>
      </sci-card>
    </div>

    <sci-modal [open]="modalOpen()" title="Generar reporte CSV" (closed)="modalOpen.set(false)">
      <form [formGroup]="form" (ngSubmit)="generate()" class="modal-form">
        <div class="row2">
          <sci-input formControlName="desde" label="Desde" type="date" [error]="f('desde')" />
          <sci-input formControlName="hasta" label="Hasta" type="date" [error]="f('hasta')" />
        </div>
        <sci-select formControlName="personaId" label="Persona (opcional)" [options]="personaOptions()" />
        <sci-select formControlName="zonaId" label="Zona (opcional)" [options]="zonaOptions()" />
        <sci-select formControlName="tipoEvento" label="Tipo de evento (opcional)" [options]="tipoOptions" />
        @if (generating()) {
          <p class="modal-note">Generando CSV…</p>
        }
        <div sci-modal-actions>
          <button sci-btn variant="ghost" size="md" (click)="modalOpen.set(false)">Cancelar</button>
          <button sci-btn variant="primary" size="md" type="submit" [loading]="generating()">Generar y descargar</button>
        </div>
      </form>
    </sci-modal>
  `,
  styles: [
    `
      .section-head { padding: 16px 20px; border-bottom: 1px solid var(--border); }
      .section-title { font-size: 16px; font-weight: 600; }
      .flush { }
      .modal-form { display: flex; flex-direction: column; gap: 16px; }
      .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .modal-note { font-size: 13px; color: var(--text-muted); }
    `,
  ],
})
export class ReportsComponent implements OnInit {
  private readonly service = inject(ReportsService);
  private readonly personasSvc = inject(PersonasService);
  private readonly auth = inject(AuthService);
  private readonly zonasSvc = inject(ZonasService);
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);

  protected readonly tipoOptions = [
    { value: '', label: 'Ingreso y egreso' },
    { value: 'ingreso', label: 'Solo ingresos' },
    { value: 'egreso', label: 'Solo egresos' },
  ];
  protected readonly generating = signal(false);
  protected readonly modalOpen = signal(false);
  /** Carga común (Fase 8.2): estado cargando / listo / error + reintentar. */
  protected readonly carga = recurso(() => this.service.list(), [] as Reporte[], 'No se pudieron cargar los reportes.');
  protected readonly reportes = this.carga.datos;
  protected readonly loading = this.carga.cargando;
  protected readonly personas = signal<Persona[]>([]);
  protected readonly zonas = signal<Zona[]>([]);

  // Primera opción con valor vacío = sin filtro (es también el valor por defecto del formulario).
  protected readonly personaOptions = computed(() => [
    { value: '', label: 'Todas las personas' },
    ...this.personas().map((p) => ({ value: String(p.id), label: p.nombre })),
  ]);
  protected readonly zonaOptions = computed(() => [
    { value: '', label: 'Todas las zonas' },
    ...this.zonas().map((z) => ({ value: String(z.id), label: z.nombre })),
  ]);

  protected readonly form = this.fb.group({
    id: [''],
    desde: ['', Validators.required],
    hasta: ['', Validators.required],
    personaId: [''],
    zonaId: [''],
    tipoEvento: [''],
  });

  protected readonly stats = computed(() => {
    const rs = this.reportes();
    return {
      totalReportes: rs.length,
      totalRegistros: rs.reduce((acc, r) => acc + r.totalRegistros, 0),
      ultimoPeriodo: rs[0]?.periodo ?? '—',
    };
  });

  ngOnInit(): void {
    this.load();
    // Solo el Administrador tiene permiso sobre /api/personas (PG2 §4.3.2); para Gerencia el filtro de persona queda en "Todas".
    if (this.auth.role() === 'ADMIN') {
      this.personasSvc.list('todos').subscribe({ next: (ps) => this.personas.set(ps), error: () => undefined });
    }
    this.zonasSvc.list('todos').subscribe((zs) => this.zonas.set(zs));
  }

  protected f(name: string): string | null {
    const c = this.form.get(name);
    if (c?.touched && c.errors?.['required']) return 'Campo requerido.';
    return null;
  }

  protected open(): void {
    this.form.reset();
    this.modalOpen.set(true);
  }

  protected load(): void {
    this.carga.cargar();
  }

  protected generate(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.value;
    if (v.desde! > v.hasta!) {
      this.toast.error('Rango inválido', 'La fecha inicial no puede ser posterior a la final.');
      return;
    }
    this.generating.set(true);
    this.service
      .generar({
        desde: v.desde!,
        hasta: v.hasta!,
        personaId: v.personaId ? +v.personaId : undefined,
        zonaId: v.zonaId ? +v.zonaId : undefined,
        tipoEvento: v.tipoEvento || undefined,
      })
      .subscribe({
        next: (blob) => {
          this.generating.set(false);
          this.modalOpen.set(false);
          this.download(blob, `sciad-reporte-${v.desde}_a_${v.hasta}.csv`);
          this.toast.success('Reporte generado', 'Descarga CSV en curso.');
          this.load();
        },
        error: (e) => {
          this.generating.set(false);
          const detail = (e as { error?: { detail?: string } })?.error?.detail;
          this.toast.error('Error', detail ?? 'No se pudo generar el reporte.');
        },
      });
  }

  private download(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

