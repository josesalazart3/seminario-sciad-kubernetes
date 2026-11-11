// Perfiles de acceso (CU-03): Fase 3 los reconcilia a la semántica del backend =
// ASIGNACIÓN persona + zona + vigencia (decisión de usuario).
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ProfilesService, ZonasService, PersonasService } from '../../core/services/crud.service';
import { PerfilAcceso, Zona } from '../../core/models/access.model';
import { Persona, TIPO_PERSONA_LABELS } from '../../core/models/persona.model';
import { Button } from '../../shared/ui/button.component';
import { Icon } from '../../shared/ui/icon.component';
import { Card } from '../../shared/ui/card.component';
import { Modal } from '../../shared/ui/modal.component';
import { SciInput, SciSelect } from '../../shared/ui/field.component';
import { EmptyState } from '../../shared/ui/empty-state.component';
import { ToastService } from '../../shared/ui/toast.service';
import { LoadError } from '../../shared/ui/load-error.component';
import { recurso } from '../../core/util/recurso';

@Component({
  selector: 'app-admin-profiles',
  standalone: true,
  imports: [LoadError, 
    ReactiveFormsModule,
    Button,
    Icon,
    Card,
    Modal,
    SciInput,
    SciSelect,
    EmptyState,
  ],
  template: `
    <div class="page">
      <div class="page-header">
        <div class="page-heading">
          <h1>Perfiles de acceso</h1>
          <p class="page-sub">Asignación de personas a zonas con vigencia (CU-03).</p>
        </div>
        <button sci-btn variant="primary" size="md" iconName="plus" (click)="openCreate()">
          Nueva asignación
        </button>
      </div>

      <sci-card>
        <div class="body">
          @if (loading()) {
            <div class="table-wrap"><table class="sci-table"><tbody>
              @for (i of [1,2,3,4,5]; track i) {
                <tr class="sci-skel-row">@for (c of [1,2,3,4]; track c) {<td><div class="skel"></div></td>}</tr>
              }
            </tbody></table></div>
          } @else if (carga.error(); as e) {
            <sci-load-error [message]="e" (retry)="carga.cargar()" />
          } @else if (perfiles().length === 0) {
            <sci-empty-state icon="id-card" title="Sin asignaciones" message="Asigna una persona a una zona para permitirle el acceso.">
              <button sci-btn variant="primary" size="sm" iconName="plus" (click)="openCreate()">Nueva asignación</button>
            </sci-empty-state>
          } @else {
            <div class="table-wrap">
              <table class="sci-table">
                <thead>
                  <tr>
                    <th>Persona</th>
                    <th>Zona</th>
                    <th>Vigencia</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  @for (p of perfiles(); track p.id) {
                    <tr>
                      <td>
                        <div class="cell-strong">{{ p.personaNombre }}</div>
                        <div class="cell-muted">{{ personaTipo(p.personaId) }}</div>
                      </td>
                      <td>{{ p.zonaNombre }}</td>
                      <td>{{ p.vigenciaInicio }} → {{ p.vigenciaFin }}</td>
                      <td>
                        <div class="cell-actions">
                          <button class="sci-btn-ghost" aria-label="Eliminar asignación" (click)="remove(p)">
                            <sci-icon name="trash" [size]="17" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      </sci-card>
    </div>

    <sci-modal [open]="modalOpen()" title="Nueva asignación" (closed)="modalOpen.set(false)">
      <form [formGroup]="form" (ngSubmit)="save()" class="modal-form">
        <sci-select formControlName="personaId" label="Persona" [options]="personaOptions()" />
        <sci-select formControlName="zonaId" label="Zona" [options]="zonaOptions()" />
        <sci-input formControlName="vigenciaInicio" label="Vigencia desde" type="date" [error]="f('vigenciaInicio')" />
        <sci-input formControlName="vigenciaFin" label="Vigencia hasta" type="date" [error]="f('vigenciaFin')" />
        <div sci-modal-actions>
          <button sci-btn variant="ghost" size="md" (click)="modalOpen.set(false)">Cancelar</button>
          <button sci-btn variant="primary" size="md" type="submit" [loading]="saving()">Asignar</button>
        </div>
      </form>
    </sci-modal>
  `,
  styles: [
    `
      .body { padding: 20px; }
      .modal-form { display: flex; flex-direction: column; gap: 16px; }
      .cell-strong { font-weight: 600; color: var(--text); }
      .cell-muted { font-size: 12px; color: var(--text-muted); }
    `,
  ],
})
export class ProfilesComponent implements OnInit {
  private readonly service = inject(ProfilesService);
  private readonly personasSvc = inject(PersonasService);
  private readonly zonas = inject(ZonasService);
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);

  protected readonly saving = signal(false);
  /** Carga común (Fase 8.2): estado cargando / listo / error + reintentar. */
  protected readonly carga = recurso(() => this.service.list(), [] as PerfilAcceso[], 'No se pudieron cargar las asignaciones.');
  protected readonly perfiles = this.carga.datos;
  protected readonly loading = this.carga.cargando;
  protected readonly personasList = signal<Persona[]>([]);
  protected readonly zonasList = signal<Zona[]>([]);
  protected readonly modalOpen = signal(false);

  protected readonly personaOptions = computed(() =>
    this.personasList()
      .filter((p) => p.estado === 'activo')
      .map((p) => ({ value: p.id, label: `${p.nombre} (${TIPO_PERSONA_LABELS[p.tipo]})` })),
  );
  protected readonly zonaOptions = computed(() =>
    this.zonasList()
      .filter((z) => z.estado === 'activo')
      .map((z) => ({ value: z.id, label: z.nombre })),
  );
  protected readonly form = this.fb.group({
    id: [''],
    personaId: ['', Validators.required],
    zonaId: ['', Validators.required],
    vigenciaInicio: ['', Validators.required],
    vigenciaFin: ['', Validators.required],
  });

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.carga.cargar();
    this.personasSvc.list('todos').subscribe({ next: (ps) => this.personasList.set(ps), error: () => this.toast.error('Error', 'No se pudieron cargar las personas.') });
    this.zonas.list('todos').subscribe({ next: (zs) => this.zonasList.set(zs), error: () => this.toast.error('Error', 'No se pudieron cargar las zonas.') });
  }

  protected personaTipo(personaId: string): string {
    const p = this.personasList().find((x) => x.id === personaId);
    return p ? TIPO_PERSONA_LABELS[p.tipo] : '';
  }

  protected f(name: string): string | null {
    const c = this.form.get(name);
    if (c?.touched && c.errors) {
      if (c.errors['required']) return 'Campo requerido.';
      if (c.errors['vigencia']) return c.errors['vigencia'];
    }
    return null;
  }

  protected openCreate(): void {
    this.form.reset();
    this.form.patchValue({
      personaId: this.personaOptions()[0]?.value ?? '',
      zonaId: this.zonaOptions()[0]?.value ?? '',
    });
    this.modalOpen.set(true);
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.value;
    // Regla de negocio: la vigencia de fin debe ser >= inicio (el backend la valida también).
    if (v.vigenciaInicio! > v.vigenciaFin!) {
      this.form.controls.vigenciaFin.setErrors({ vigencia: 'La vigencia final debe ser igual o posterior a la inicial.' });
      return;
    }
    // Fase 8: sin fechas absurdas (mismo rango que el backend).
    for (const campo of ['vigenciaInicio', 'vigenciaFin'] as const) {
      const anio = Number(String(v[campo]).slice(0, 4));
      if (!(anio >= 2020 && anio <= 2100)) {
        this.form.controls[campo].setErrors({ vigencia: 'La fecha debe estar entre los años 2020 y 2100.' });
        this.form.controls[campo].markAsTouched();
        return;
      }
    }
    this.saving.set(true);
    this.service.create({
      personaId: v.personaId!,
      zonaId: v.zonaId!,
      vigenciaInicio: v.vigenciaInicio!,
      vigenciaFin: v.vigenciaFin!,
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.modalOpen.set(false);
        this.toast.success('Asignación creada');
        this.load();
      },
      error: (e) => {
        this.saving.set(false);
        this.toast.error('Error', this.errorMessage(e) ?? 'No se guardó la asignación.');
      },
    });
  }

  protected remove(p: PerfilAcceso): void {
    if (!window.confirm(`¿Eliminar la asignación de ${p.personaNombre} a ${p.zonaNombre}?`)) return;
    this.service.remove(p.id).subscribe({
      next: () => {
        this.toast.info('Asignación eliminada');
        this.load();
      },
      error: () => this.toast.error('Error', 'No se pudo eliminar la asignación.'),
    });
  }

  private errorMessage(e: unknown): string | null {
    const detail = (e as { error?: { detail?: string } })?.error?.detail;
    return detail ? String(detail) : null;
  }
}