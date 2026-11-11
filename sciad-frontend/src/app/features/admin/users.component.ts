import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { UsersService } from '../../core/services/crud.service';
import { Usuario, ROL_LABELS, Rol } from '../../core/models/user.model';
import { Button } from '../../shared/ui/button.component';
import { Icon } from '../../shared/ui/icon.component';
import { Card } from '../../shared/ui/card.component';
import { Badge, StatusKey } from '../../shared/ui/badge.component';
import { Modal } from '../../shared/ui/modal.component';
import { SciInput, SciSelect } from '../../shared/ui/field.component';
import { EmptyState } from '../../shared/ui/empty-state.component';
import { ToastService } from '../../shared/ui/toast.service';
import { LoadError } from '../../shared/ui/load-error.component';
import { recurso } from '../../core/util/recurso';
import { EstadoTabs } from '../../shared/ui/estado-tabs.component';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog.component';
import { gestorEstado } from '../../core/util/gestor-estado';
import { AuthService } from '../../core/services/auth.service';

const ROL_OPTIONS = (Object.keys(ROL_LABELS) as Rol[]).map((r) => ({
  value: r,
  label: ROL_LABELS[r],
}));

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [EstadoTabs, ConfirmDialog, LoadError, 
    ReactiveFormsModule,
    Button,
    Icon,
    Card,
    Badge,
    Modal,
    SciInput,
    SciSelect,
    EmptyState,
  ],
  template: `
    <div class="page">
      <div class="page-header">
        <div class="page-heading">
          <h1>Gestión de usuarios</h1>
          <p class="page-sub">Usuarios del sistema y sus roles (CU-02).</p>
        </div>
        <div class="page-actions">
          <div class="search-box">
            <sci-icon name="search" [size]="16" class="search-ic" />
            <input
              class="search-input"
              placeholder="Buscar por nombre o correo…"
              (input)="searchText.set($any($event.target).value)"
            />
          </div>
          <button sci-btn variant="primary" size="md" iconName="plus" (click)="openCreate()">
            Nuevo usuario
          </button>
        </div>
      </div>

      <sci-estado-tabs
        [valor]="estados.tab()"
        [conteos]="estados.conteos()"
        etiqueta="Estado de los usuarios"
        controla="tabla-usuarios"
        (cambio)="estados.irA($event)"
      />

      <sci-card>
        <div class="table-wrap" id="tabla-usuarios" role="tabpanel" [attr.aria-labelledby]="'tab-' + estados.tab()">
          @if (loading()) {
            <table class="sci-table"><tbody>
              @for (i of [1,2,3,4,5]; track i) {
                <tr class="sci-skel-row">@for (c of [1,2,3,4]; track c) {<td><div class="skel"></div></td>}</tr>
              }
            </tbody></table>
          } @else if (carga.error(); as e) {
            <sci-load-error [message]="e" (retry)="carga.cargar()" />
          } @else if (filtered().length === 0) {
            <sci-empty-state [title]="estados.tab() === 'deshabilitados' ? 'Sin usuarios deshabilitados' : 'Sin usuarios'" [message]="searchText() ? 'No hay usuarios que coincidan con la búsqueda.' : estados.vacio()"
              icon="users"
             
             
            >
              <button sci-btn variant="primary" size="sm" iconName="plus" (click)="openCreate()">Nuevo usuario</button>
            </sci-empty-state>
          } @else {
            <table class="sci-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Puesto</th>
                  <th>Rol</th>
                  <th class="hide-sm">Creación</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                @for (u of filtered(); track u.id) {
                  <tr>
                    <td>
                      <div class="user-cell">
                        <span class="avatar">{{ u.avatarInitials }}</span>
                        <div>
                          <div class="cell-strong">{{ u.nombre }}</div>
                          <div class="cell-muted">{{ u.email }}</div>
                        </div>
                      </div>
                    </td>
                    <td class="cell-muted">{{ u.puesto }}</td>
                    <td><sci-badge [label]="ROL_LABELS[u.rol]" [status]="badgeForRol(u.rol)" /></td>
                    <td class="cell-muted hide-sm">{{ date(u.fechaCreacion) }}</td>
                    <td><sci-badge [status]="u.activo ? 'activo' : 'inactivo'" /></td>
                    <td>
                      <div class="cell-actions">
                        <button class="sci-btn-ghost" aria-label="Editar" (click)="openEdit(u)"><sci-icon name="edit" [size]="17" /></button>
                        @if (u.activo) {
                          @if (!esYo(u)) {
                            <button class="sci-btn-ghost" [attr.aria-label]="'Deshabilitar ' + u.nombre" title="Deshabilitar" (click)="estados.pedir(u)">
                              <sci-icon name="x" [size]="17" />
                            </button>
                          }
                        } @else {
                          <button sci-btn variant="secondary" size="sm" iconName="refresh" [attr.aria-label]="'Reactivar ' + u.nombre" (click)="estados.pedir(u)">Reactivar</button>
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

    <sci-modal [open]="modalOpen()" [title]="editing() ? 'Editar usuario' : 'Nuevo usuario'" (closed)="modalOpen.set(false)">
      <form [formGroup]="form" (ngSubmit)="save()" class="modal-form">
        <sci-input formControlName="nombre" label="Nombre completo" [error]="f('nombre')" />
        <sci-input formControlName="email" label="Correo electrónico" [error]="f('email')" />
        <sci-input formControlName="puesto" label="Puesto" />
        <sci-select formControlName="rol" label="Rol" [options]="rolOptions" />
        <sci-input
          formControlName="password"
          type="password"
          [label]="editing() ? 'Nueva contraseña (dejar en blanco para no cambiarla)' : 'Contraseña'"
          placeholder="Mínimo 8 caracteres"
          [error]="f('password')"
        />
        <div sci-modal-actions>
          <button sci-btn variant="ghost" size="md" (click)="modalOpen.set(false)">Cancelar</button>
          <button sci-btn variant="primary" size="md" type="submit" [loading]="saving()">
            {{ editing() ? 'Guardar' : 'Crear usuario' }}
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
      .search-box {
        position: relative;
        display: flex;
        align-items: center;
      }
      .search-ic {
        position: absolute;
        left: 12px;
        color: var(--text-subtle);
        pointer-events: none;
      }
      .search-input {
        width: 260px;
        height: 40px;
        padding: 0 12px 0 38px;
        border-radius: var(--radius-sm);
        border: 1px solid var(--border-strong);
        background: var(--surface);
        color: var(--text);
        font-size: 14px;
      }
      .search-input:focus {
        outline: none;
        border-color: var(--sciad-brand);
        box-shadow: 0 0 0 3px var(--sciad-brand-soft);
      }
      @media (max-width: 639px) {
        .search-input { width: 100%; }
      }
      .user-cell { display: flex; align-items: center; gap: 12px; }
      .modal-form { display: flex; flex-direction: column; gap: 16px; }
    `,
  ],
})
export class UsersComponent implements OnInit {
  private readonly service = inject(UsersService);
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);

  protected readonly ROL_LABELS = ROL_LABELS;
  protected readonly rolOptions = ROL_OPTIONS;
  protected readonly saving = signal(false);
  /** Carga común (Fase 8.2): estado cargando / listo / error + reintentar. */
  protected readonly carga = recurso(() => this.service.list('todos'), [] as Usuario[], 'No se pudieron cargar los usuarios.');
  protected readonly users = this.carga.datos;
  protected readonly loading = this.carga.cargando;
  protected readonly searchText = signal('');
  protected readonly modalOpen = signal(false);
  protected readonly editing = signal<Usuario | null>(null);

  /** Activos / Deshabilitados / Todos (Fase 8.4): patrón común, baja lógica por el endpoint de estado existente. */
  protected readonly estados = gestorEstado<Usuario>({
    datos: this.carga.datos,
    id: (u) => u.id,
    nombre: (u) => u.nombre,
    esActivo: (u) => u.activo,
    cambiar: (u, estado) => this.service.setEstado(u.id, estado),
    singular: 'usuario',
    plural: 'usuarios',
    femenino: false,
  });

  /** Primero la búsqueda (y los demás filtros); después la pestaña de estado. */
  protected filtered = computed(() => this.estados.filtrar(this.buscados()));

  private buscados = computed(() => {
    const q = this.searchText().toLowerCase();
    return this.users().filter(
      (u) =>
        !q || u.nombre.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    );
  });

  protected readonly form = this.fb.group({
    id: [''],
    nombre: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    puesto: ['', Validators.required],
    rol: ['ADMIN', Validators.required],
    password: ['', [Validators.minLength(8), Validators.maxLength(72)]],
  });

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.carga.cargar();
  }

  protected f(name: string): string | null {
    const c = this.form.get(name);
    if (c?.touched && c.errors) {
      if (c.errors['required']) return 'Campo requerido.';
      if (c.errors['email']) return 'Correo no válido.';
      if (c.errors['minlength']) return 'La contraseña debe tener al menos 8 caracteres.';
    }
    return null;
  }

  protected badgeForRol(r: Rol): StatusKey {
    return r === 'ADMIN' ? 'activo' : r === 'GERENCIA' ? 'pendiente' : 'inactivo';
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.form.reset();
    this.form.patchValue({ rol: 'ADMIN' });
    this.modalOpen.set(true);
  }
  protected openEdit(u: Usuario): void {
    this.editing.set(u);
    this.form.patchValue({
      id: u.id,
      nombre: u.nombre,
      email: u.email,
      puesto: u.puesto,
      rol: u.rol,
      password: '',
    });
    this.form.controls.password.markAsUntouched();
    this.modalOpen.set(true);
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.value;
    const editing = this.editing();
    const payload: Usuario = {
      id: editing?.id ?? '',
      nombre: v.nombre!,
      email: v.email!,
      puesto: v.puesto!,
      rol: v.rol as Rol,
      activo: editing?.activo ?? true,
      avatarInitials: initials(v.nombre!),
      fechaCreacion: editing?.fechaCreacion ?? new Date().toISOString(),
    };
    this.saving.set(true);
    // Al crear el backend exige password (>= 8). Al editar es opcional: solo se manda si se escribió una nueva.
    const req = editing
      ? this.service.update(payload, v.password || undefined)
      : this.service.create({ ...payload, password: v.password ?? '' });
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.modalOpen.set(false);
        this.toast.success(editing ? 'Usuario actualizado' : 'Usuario creado');
        this.load();
      },
      error: (e: { error?: { detail?: string } }) => {
        this.saving.set(false);
        // Fase 8: mostrar el motivo que da el servidor (correo duplicado, formato inválido…), nunca solo un genérico.
        this.toast.error('No se guardó el usuario', e?.error?.detail ?? 'Intente de nuevo.');
      },
    });
  }


  /** Un administrador no puede deshabilitar su propia cuenta (el backend también lo impide). */
  protected esYo(u: Usuario): boolean {
    return this.auth.currentUser()?.id === u.id;
  }

  protected date(iso: string): string {
    return new Date(iso).toLocaleDateString('es-GT', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}
