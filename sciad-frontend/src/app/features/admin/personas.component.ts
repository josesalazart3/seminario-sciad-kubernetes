// Personas (Colaboradores/Visitantes) — alta/baja de personas que pueden portar credencial.
// Fase 2B CRUD admin; reconciliado Fase 3 al contrato real (tipo 1=colaborador, 2=visitante).
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { PersonasService } from '../../core/services/crud.service';
import { Persona, TIPO_PERSONA_LABELS } from '../../core/models/persona.model';
import { Button } from '../../shared/ui/button.component';
import { Icon } from '../../shared/ui/icon.component';
import { Card } from '../../shared/ui/card.component';
import { Badge } from '../../shared/ui/badge.component';
import { Modal } from '../../shared/ui/modal.component';
import { SciInput, SciSelect } from '../../shared/ui/field.component';
import { EmptyState } from '../../shared/ui/empty-state.component';
import { ToastService } from '../../shared/ui/toast.service';
import {
  DPI_LONGITUD,
  dpiValidator,
  nombreTitleCase,
  nombreValidator,
} from '../../core/util/persona-validacion';
import { LoadError } from '../../shared/ui/load-error.component';
import { recurso } from '../../core/util/recurso';
import { EstadoTabs } from '../../shared/ui/estado-tabs.component';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog.component';
import { gestorEstado } from '../../core/util/gestor-estado';

const TIPO_OPTIONS = Object.entries(TIPO_PERSONA_LABELS).map(([value, label]) => ({ value, label }));

@Component({
  selector: 'app-admin-personas',
  standalone: true,
  imports: [EstadoTabs, ConfirmDialog, LoadError, ReactiveFormsModule, Button, Icon, Card, Badge, Modal, SciInput, SciSelect, EmptyState],
  template: `
    <div class="page">
      <div class="page-header">
        <div class="page-heading">
          <h1>Personas</h1>
          <p class="page-sub">Colaboradores y visitantes que pueden portar una credencial QR.</p>
        </div>
        <div class="page-actions">
          <div class="search-box">
            <sci-icon name="search" [size]="16" class="search-ic" />
            <input
              class="search-input"
              placeholder="Buscar por nombre o DPI…"
              aria-label="Buscar por nombre o DPI"
              maxlength="120"
              [value]="searchText()"
              (input)="buscar($any($event.target))"
            />
            @if (busquedaDpi(); as n) {
              <span class="search-count" aria-live="polite">{{ n }}/{{ DPI_LONGITUD }}</span>
            }
          </div>
          <button sci-btn variant="primary" size="md" iconName="plus" (click)="openCreate()">
            Nueva persona
          </button>
        </div>
      </div>

      <sci-estado-tabs
        [valor]="estados.tab()"
        [conteos]="estados.conteos()"
        etiqueta="Estado de las personas"
        controla="tabla-personas"
        (cambio)="estados.irA($event)"
      />

      <sci-card>
        <div class="table-wrap" id="tabla-personas" role="tabpanel" [attr.aria-labelledby]="'tab-' + estados.tab()">
          @if (loading()) {
            <table class="sci-table"><tbody>
              @for (i of [1,2,3,4]; track i) {
                <tr class="sci-skel-row">@for (c of [1,2,3,4]; track c) {<td><div class="skel"></div></td>}</tr>
              }
            </tbody></table>
          } @else if (carga.error(); as e) {
            <sci-load-error [message]="e" (retry)="carga.cargar()" />
          } @else if (filtered().length === 0) {
            <sci-empty-state [title]="estados.tab() === 'deshabilitados' ? 'Sin personas deshabilitadas' : 'Sin personas'" [message]="searchText() ? 'No hay personas que coincidan con la búsqueda.' : estados.vacio()" icon="users">
              <button sci-btn variant="primary" size="sm" iconName="plus" (click)="openCreate()">Nueva persona</button>
            </sci-empty-state>
          } @else {
            <table class="sci-table">
              <thead>
                <tr><th>Persona</th><th class="hide-sm">DPI</th><th>Tipo</th><th>Estado</th><th></th></tr>
              </thead>
              <tbody>
                @for (p of filtered(); track p.id) {
                  <tr>
                    <td class="cell-strong">{{ p.nombre }}</td>
                    <td class="cell-mono hide-sm">{{ p.dpiCodigo }}</td>
                    <td><sci-badge [label]="TIPO_LABELS[p.tipo]" [status]="p.tipo === 1 ? 'baja' : 'pendiente'" /></td>
                    <td><sci-badge [status]="p.estado === 'activo' ? 'activo' : 'inactivo'" /></td>
                    <td>
                      <div class="cell-actions">
                        <button class="sci-btn-ghost" aria-label="Editar" (click)="openEdit(p)"><sci-icon name="edit" [size]="17" /></button>
                        @if (p.estado === 'activo') {
                          <button class="sci-btn-ghost" [attr.aria-label]="'Deshabilitar ' + p.nombre" title="Deshabilitar" (click)="estados.pedir(p)">
                            <sci-icon name="x" [size]="17" />
                          </button>
                        } @else {
                          <button sci-btn variant="secondary" size="sm" iconName="refresh" [attr.aria-label]="'Reactivar ' + p.nombre" (click)="estados.pedir(p)">Reactivar</button>
                        }
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </div>
      </sci-card>
    </div>

    <sci-modal [open]="modalOpen()" [title]="editing() ? 'Editar persona' : 'Nueva persona'" (closed)="modalOpen.set(false)">
      <form [formGroup]="form" (ngSubmit)="save()" class="modal-form">
        <sci-input formControlName="nombre" label="Nombre completo" [error]="f('nombre')" (focusout)="titleCaseNombre()" />
        <sci-input
          formControlName="dpiCodigo"
          label="Código DPI"
          placeholder="13 dígitos, sin guiones"
          inputmode="numeric"
          [maxlength]="DPI_LONGITUD"
          soloDigitos
          [counter]="dpiContador()"
          [error]="f('dpiCodigo')"
        />
        <sci-select formControlName="tipo" label="Tipo" [options]="tipoOptions" />
        @if (serverError(); as e) {
          <p class="form-error" role="alert">{{ e }}</p>
        }
        <div sci-modal-actions>
          <button sci-btn variant="ghost" size="md" type="button" (click)="modalOpen.set(false)">Cancelar</button>
          <button sci-btn variant="primary" size="md" type="submit" [loading]="saving()" [disabled]="formInvalid()">
            {{ editing() ? 'Guardar' : 'Crear persona' }}
          </button>
        </div>
      </form>
    </sci-modal>

    @if (estados.pendiente(); as c) {
      <sci-confirm-dialog
        [open]="true"
        [title]="estados.textos(c).titulo"
        [message]="estados.textos(c).mensaje"
        [confirmLabel]="estados.textos(c).boton"
        [variant]="c.accion === 'deshabilitar' ? 'danger' : 'primary'"
        [loading]="estados.procesando()"
        (confirmed)="estados.confirmar()"
        (cancelled)="estados.cancelar()"
      />
    }
  `,
  styles: [
    `
      .search-box { position: relative; display: flex; align-items: center; }
      .search-ic { position: absolute; left: 12px; color: var(--text-subtle); pointer-events: none; }
      .search-count { position: absolute; right: 10px; font-size: 12px; color: var(--text-subtle); pointer-events: none; }
      .search-input {
        width: 260px; height: 40px; padding: 0 12px 0 38px;
        border-radius: var(--radius-sm); border: 1px solid var(--border-strong);
        background: var(--surface); color: var(--text); font-size: 14px;
      }
      .search-input:focus { outline: none; border-color: var(--sciad-brand); box-shadow: 0 0 0 3px var(--sciad-brand-soft); }
      @media (max-width: 639px) { .search-input { width: 100%; } }
      .modal-form { display: flex; flex-direction: column; gap: 16px; }
      .form-error {
        margin: 0; padding: 10px 12px; border-radius: var(--radius-sm);
        background: var(--sciad-danger-soft); color: var(--sciad-danger); font-size: 13px; font-weight: 500;
      }
    `,
  ],
})
export class PersonasComponent implements OnInit {
  private readonly service = inject(PersonasService);
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);

  protected readonly TIPO_LABELS = TIPO_PERSONA_LABELS;
  protected readonly DPI_LONGITUD = DPI_LONGITUD;
  protected readonly tipoOptions = TIPO_OPTIONS;
  protected readonly saving = signal(false);
  /** Carga común (Fase 8.2): estado cargando / listo / error + reintentar. */
  protected readonly carga = recurso(() => this.service.list('todos'), [] as Persona[], 'No se pudieron cargar las personas.');
  protected readonly personas = this.carga.datos;
  protected readonly loading = this.carga.cargando;
  protected readonly searchText = signal('');
  protected readonly modalOpen = signal(false);
  protected readonly editing = signal<Persona | null>(null);
  /** Error devuelto por el servidor (400/409/…): se muestra en el formulario, nunca se ignora. */
  protected readonly serverError = signal<string | null>(null);

  protected readonly form = this.fb.group({
    id: [''],
    nombre: ['', [nombreValidator]],
    dpiCodigo: ['', [dpiValidator]],
    tipo: ['1', Validators.required],
  });

  private readonly formValue = toSignal(this.form.valueChanges, { initialValue: this.form.value });
  private readonly formStatus = toSignal(this.form.statusChanges, { initialValue: this.form.status });
  protected readonly formInvalid = computed(() => this.formStatus() !== 'VALID');
  protected readonly dpiContador = computed(() => `${(this.formValue().dpiCodigo ?? '').length}/${DPI_LONGITUD}`);

  /** Si la búsqueda es solo dígitos (un DPI), su longitud para el contador n/13; si no, null. */
  protected readonly busquedaDpi = computed(() => {
    const q = this.searchText();
    return /^\d+$/.test(q) ? q.length : null;
  });

  /** Búsqueda por nombre o DPI: un DPI (solo dígitos) no puede pasar de 13. */
  protected buscar(el: HTMLInputElement): void {
    let v = el.value;
    if (/^\d+$/.test(v) && v.length > DPI_LONGITUD) {
      v = v.slice(0, DPI_LONGITUD);
      el.value = v;
    }
    this.searchText.set(v);
  }

  /** Activos / Deshabilitados / Todos (Fase 8.4): patrón común, baja lógica por el endpoint de estado existente. */
  protected readonly estados = gestorEstado<Persona>({
    datos: this.carga.datos,
    id: (p) => p.id,
    nombre: (p) => p.nombre,
    esActivo: (p) => p.estado === 'activo',
    cambiar: (p, estado) => this.service.setEstado(p.id, estado),
    singular: 'persona',
    plural: 'personas',
    femenino: true,
  });

  /** Primero la búsqueda (y los demás filtros); después la pestaña de estado. */
  protected filtered = computed(() => this.estados.filtrar(this.buscados()));

  private buscados = computed(() => {
    const q = this.searchText().toLowerCase();
    return this.personas().filter(
      (p) => !q || p.nombre.toLowerCase().includes(q) || p.dpiCodigo.toLowerCase().includes(q),
    );
  });

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.carga.cargar();
  }

  protected f(name: string): string | null {
    const c = this.form.get(name);
    if (!c?.touched || !c.errors) return null;
    if (c.errors['required']) return 'Campo requerido.';
    return (c.errors['dpi'] ?? c.errors['nombre'] ?? null) as string | null;
  }

  /** Al salir del campo, el nombre se muestra en "Title Case" (solo en la interfaz). */
  protected titleCaseNombre(): void {
    const c = this.form.controls.nombre;
    const v = nombreTitleCase(c.value);
    if (v !== c.value) c.setValue(v);
  }

  protected openCreate(): void {
    this.serverError.set(null);
    this.editing.set(null);
    this.form.reset();
    this.form.patchValue({ tipo: '1' });
    this.modalOpen.set(true);
  }
  protected openEdit(p: Persona): void {
    this.serverError.set(null);
    this.editing.set(p);
    this.form.patchValue({
      id: p.id,
      nombre: p.nombre,
      dpiCodigo: p.dpiCodigo,
      tipo: String(p.tipo),
    });
    this.modalOpen.set(true);
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.value;
    const editing = this.editing();
    const payload = { nombre: nombreTitleCase(v.nombre), dpiCodigo: v.dpiCodigo!, tipo: +v.tipo! as 1 | 2 };
    this.serverError.set(null);
    this.saving.set(true);
    const req = editing ? this.service.update({ id: editing.id, ...payload, estado: editing.estado }) : this.service.create(payload);
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.modalOpen.set(false);
        this.toast.success(editing ? 'Persona actualizada' : 'Persona creada', payload.nombre);
        if (!editing) this.searchText.set(''); // que la búsqueda activa no oculte a la persona recién creada
        this.load();
      },
      error: (e) => {
        this.saving.set(false);
        const msg = this.errorMessage(e) ?? 'No se guardó la persona. Intente de nuevo.';
        this.serverError.set(msg);
        this.toast.error('No se guardó la persona', msg);
      },
    });
  }


  private errorMessage(e: unknown): string | null {
    const detail = (e as { error?: { detail?: string } })?.error?.detail;
    return detail ? String(detail) : null;
  }
}