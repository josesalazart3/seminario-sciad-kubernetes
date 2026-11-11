// Credenciales QR (CU-04): Fase 3 las reconcilia al backend — generar por PERSONA registrada
// (POST /credenciales/{personaId}/generar), revocar con motivo opcional, reemitir, nunca borrado.
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CredentialsService, PersonasService } from '../../core/services/crud.service';
import { Credencial } from '../../core/models/credential.model';
import { Persona, TIPO_PERSONA_LABELS } from '../../core/models/persona.model';
import { Button } from '../../shared/ui/button.component';
import { Icon } from '../../shared/ui/icon.component';
import { Card } from '../../shared/ui/card.component';
import { Badge, StatusKey } from '../../shared/ui/badge.component';
import { Modal } from '../../shared/ui/modal.component';
import { SciInput, SciSelect } from '../../shared/ui/field.component';
import { EmptyState } from '../../shared/ui/empty-state.component';
import { ToastService } from '../../shared/ui/toast.service';
import { QrImage } from '../../shared/ui/qr-image.component';
import { descargarQrPng, imprimirGafete } from '../../core/util/qr';
import { LoadError } from '../../shared/ui/load-error.component';
import { recurso } from '../../core/util/recurso';

function badgeFor(estado: string): StatusKey {
  return estado === 'activa' ? 'activo' : 'revocado';
}

@Component({
  selector: 'app-admin-credentials',
  standalone: true,
  imports: [LoadError, 
    ReactiveFormsModule,
    Button,
    Icon,
    Card,
    Badge,
    Modal,
    SciInput,
    SciSelect,
    EmptyState,
    QrImage,
  ],
  template: `
    <div class="page">
      <div class="page-header">
        <div class="page-heading">
          <h1>Credenciales QR</h1>
          <p class="page-sub">Generación, reemisión y revocación de credenciales (CU-04).</p>
        </div>
        <button sci-btn variant="primary" size="md" iconName="plus" (click)="openCreate()">
          Generar credencial
        </button>
      </div>

      <sci-card>
        <div class="wrap">
          @if (loading()) {
            <table class="sci-table"><tbody>
              @for (i of [1,2,3,4,5]; track i) {
                <tr class="sci-skel-row">@for (c of [1,2,3,4,5]; track c) {<td><div class="skel"></div></td>}</tr>
              }
            </tbody></table>
          } @else if (carga.error(); as e) {
            <sci-load-error [message]="e" (retry)="carga.cargar()" />
          } @else if (credenciales().length === 0) {
            <sci-empty-state icon="qr" title="Sin credenciales" message="Aún no hay credenciales emitidas.">
              <button sci-btn variant="primary" size="sm" iconName="plus" (click)="openCreate()">Generar primera</button>
            </sci-empty-state>
          } @else {
            <table class="sci-table">
              <thead>
                <tr>
                  <th>Titular</th>
                  <th class="hide-sm">Documento</th>
                  <th>Token QR</th>
                  <th class="hide-md">Emitido</th>
                  <th>Estado</th>
                  <th class="hide-lg">Motivo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                @for (c of credenciales(); track c.id) {
                  <tr>
                    <td>
                      <div class="cell-strong">{{ c.personaNombre }}</div>
                      <div class="cell-muted">{{ personaTipo(c.personaId) }}</div>
                    </td>
                    <td class="cell-muted hide-sm">{{ c.dpiCodigo }}</td>
                    <td><span class="chip mono qr-token">{{ c.tokenCorto }}…</span></td>
                    <td class="cell-muted hide-md">{{ c.emitido }}</td>
                    <td><sci-badge [status]="badgeFor(c.estado)" /></td>
                    <td class="cell-muted hide-lg">{{ c.motivo ?? (c.estado === 'revocada' ? '—' : '') }}</td>
                    <td>
                      <div class="cell-actions">
                        @if (c.estado === 'activa') {
                          <button class="sci-btn-ghost" aria-label="Revocar" title="Revocar" (click)="openRevoke(c)"><sci-icon name="trash" [size]="17" /></button>
                        }
                        @if (puedeReemitir(c)) {
                          <button class="sci-btn-ghost" aria-label="Reemitir" title="Reemitir" (click)="reissue(c)"><sci-icon name="refresh" [size]="17" /></button>
                        }
                        <button class="sci-btn-ghost" aria-label="Ver" (click)="previewToken(c)"><sci-icon name="eye" [size]="17" /></button>
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

    <!-- Generar (por persona registrada) -->
    <sci-modal [open]="createOpen()" title="Generar credencial" (closed)="createOpen.set(false)">
      <form [formGroup]="createForm" (ngSubmit)="generate()" class="modal-form">
        <sci-select formControlName="personaId" label="Persona" [options]="personaOptions()" [error]="cf('personaId')" />
        <p class="modal-note">Se emitirá la primera credencial de la persona seleccionada. Si ya tiene una credencial activa, use «Reemitir» en su fila para reemplazarla.</p>
        <div sci-modal-actions>
          <button sci-btn variant="ghost" size="md" (click)="createOpen.set(false)">Cancelar</button>
          <button sci-btn variant="primary" size="md" type="submit" [loading]="saving()">Generar</button>
        </div>
      </form>
    </sci-modal>

    <!-- Revocar -->
    <sci-modal [open]="revokeOpen()" title="Revocar credencial" (closed)="revokeOpen.set(false)">
      <form [formGroup]="revokeForm" (ngSubmit)="revoke()" class="modal-form">
        <p class="modal-note">Se revocará la credencial de <strong>{{ selected()?.personaNombre }}</strong>. Esta acción no se puede deshacer.</p>
        <sci-input formControlName="motivo" label="Motivo (opcional)" placeholder="Pérdida, extravío, baja…" [error]="rf('motivo')" />
        <div sci-modal-actions>
          <button sci-btn variant="ghost" size="md" (click)="revokeOpen.set(false)">Cancelar</button>
          <button sci-btn variant="danger" size="md" type="submit" [loading]="saving()">Revocar</button>
        </div>
      </form>
    </sci-modal>

    <!-- Ver QR -->
    <sci-modal [open]="viewOpen()" title="Credencial QR" (closed)="viewOpen.set(false)">
      @if (selected(); as sel) {
        <div class="qr-view">
          <div class="qr-box" [class.qr-revoked]="sel.estado !== 'activa'">
            <sci-qr [value]="sel.qr" [size]="240" />
            @if (sel.estado !== 'activa') {
              <div class="qr-stamp">REVOCADA</div>
            }
          </div>
          <div class="qr-titular">{{ sel.personaNombre }}</div>
          <div class="qr-sub">{{ personaTipo(sel.personaId) }} · {{ estatusLabel() }}</div>
          <div class="qr-code mono">{{ sel.tokenCorto }}…</div>
          <p class="qr-note">El código QR va cifrado y no incluye datos personales.</p>
          <div class="qr-actions">
            <button sci-btn variant="secondary" size="md" iconName="download" (click)="descargar(sel)">Descargar PNG</button>
            <button sci-btn variant="primary" size="md" iconName="printer" (click)="imprimir(sel)" [disabled]="sel.estado !== 'activa'">Imprimir gafete</button>
          </div>
        </div>
      }
    </sci-modal>
  `,
  styles: [
    `
      .qr-token { font-family: var(--font-mono); max-width: 180px; overflow: hidden; text-overflow: ellipsis; }
      .modal-form { display: flex; flex-direction: column; gap: 16px; }
      .modal-note { font-size: 13px; color: var(--text-muted); }
      .qr-view {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        padding: 8px;
        text-align: center;
      }
      .qr-box {
        position: relative;
        padding: 12px;
        border: 1px solid var(--border-strong);
        border-radius: var(--radius-md);
        background: #fff;
        color: #000;
      }
      .qr-box.qr-revoked sci-qr { opacity: 0.25; }
      .qr-stamp {
        position: absolute; inset: 0; display: grid; place-items: center;
        font-weight: 800; font-size: 26px; letter-spacing: 0.1em; color: var(--sciad-danger);
        transform: rotate(-14deg);
      }
      .qr-code { font-size: 11px; font-weight: 600; color: var(--text-muted); word-break: break-all; max-width: 320px; }
      .qr-note { font-size: 12px; color: var(--text-subtle); max-width: 320px; }
      .qr-actions { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-top: 4px; }
      .qr-titular { font-weight: 600; font-size: 15px; color: var(--text); }
      .qr-sub { font-size: 13px; color: var(--text-muted); }
    `,
  ],
})
export class CredentialsComponent implements OnInit {
  private readonly service = inject(CredentialsService);
  private readonly personasSvc = inject(PersonasService);
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);

  protected readonly saving = signal(false);
  /** Carga común (Fase 8.2): estado cargando / listo / error + reintentar. */
  protected readonly carga = recurso(() => this.service.list(), [] as Credencial[], 'No se pudieron cargar las credenciales.');
  protected readonly credenciales = this.carga.datos;
  protected readonly loading = this.carga.cargando;
  protected readonly personasList = signal<Persona[]>([]);
  protected readonly createOpen = signal(false);
  protected readonly revokeOpen = signal(false);
  protected readonly viewOpen = signal(false);
  protected readonly selected = signal<Credencial | null>(null);

  protected readonly personaOptions = computed(() =>
    this.personasList()
      .filter((p) => p.estado === 'activo')
      .map((p) => ({ value: p.id, label: `${p.nombre} — ${TIPO_PERSONA_LABELS[p.tipo]}` })),
  );
  protected readonly createForm = this.fb.group({
    personaId: ['', Validators.required],
  });
  protected readonly revokeForm = this.fb.group({
    motivo: ['', Validators.maxLength(200)],
  });

  protected readonly badgeFor = badgeFor;

  ngOnInit(): void {
    this.load();
    this.personasSvc.list().subscribe({
      next: (ps) => this.personasList.set(ps),
      error: () => this.toast.error('Error', 'No se pudieron cargar las personas.'),
    });
  }

  private load(): void {
    this.carga.cargar();
  }

  protected personaTipo(personaId: string): string {
    const p = this.personasList().find((x) => x.id === personaId);
    return p ? TIPO_PERSONA_LABELS[p.tipo] : '';
  }

  protected cf(name: string): string | null {
    const c = this.createForm.get(name);
    if (c?.touched && c.errors?.['required']) return 'Selecciona una persona.';
    return null;
  }
  protected rf(name: string): string | null {
    const c = this.revokeForm.get(name);
    if (c?.touched && c.errors?.['maxlength']) return 'El motivo no puede superar 200 caracteres.';
    return null;
  }

  protected openCreate(): void {
    if (this.personaOptions().length === 0) {
      this.toast.warning('Sin personas', 'Registra una persona primero (Colaboradores/Visitantes).');
      return;
    }
    this.createForm.reset();
    this.createForm.patchValue({ personaId: this.personaOptions()[0].value });
    this.createOpen.set(true);
  }
  protected generate(): void {
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }
    const personaId = this.createForm.value.personaId!;
    this.saving.set(true);
    this.service.generar(personaId).subscribe({
      next: (c) => {
        this.saving.set(false);
        this.createOpen.set(false);
        this.selected.set(c);
        this.viewOpen.set(true);
        this.toast.success('Credencial generada', `QR ${c.tokenCorto}… emitido.`);
        this.load();
      },
      error: (e) => {
        this.saving.set(false);
        this.toast.error('Error', this.errorMessage(e) ?? 'No se pudo generar la credencial.');
      },
    });
  }

  protected openRevoke(c: Credencial): void {
    this.selected.set(c);
    this.revokeForm.reset();
    this.revokeOpen.set(true);
  }
  protected revoke(): void {
    const sel = this.selected();
    if (!sel) return;
    this.saving.set(true);
    this.service.revocar(sel.id, this.revokeForm.value.motivo ?? undefined).subscribe({
      next: () => {
        this.saving.set(false);
        this.revokeOpen.set(false);
        this.toast.warning('Credencial revocada', sel.personaNombre);
        this.load();
      },
      error: (e) => {
        this.saving.set(false);
        this.toast.error('Error', this.errorMessage(e) ?? 'No se pudo revocar.');
      },
    });
  }

  /** Reemitir: la credencial activa, o una revocada cuando la persona ya no tiene ninguna activa. */
  protected puedeReemitir(c: Credencial): boolean {
    if (c.estado === 'activa') return true;
    const masReciente = this.credenciales().find((x) => x.personaId === c.personaId);
    return masReciente?.id === c.id && !this.credenciales().some((x) => x.personaId === c.personaId && x.estado === 'activa');
  }

  protected reissue(c: Credencial): void {
    const aviso = c.estado === 'activa'
      ? `¿Reemitir la credencial de ${c.personaNombre}? La credencial actual quedará revocada (motivo «Reemisión») y se emitirá una nueva con otro código QR.`
      : `¿Emitir una nueva credencial para ${c.personaNombre} a partir de esta credencial revocada?`;
    if (!window.confirm(aviso)) return;
    this.service.reemitir(c.id).subscribe({
      next: (updated) => {
        this.toast.success('Credencial reemitida', `Nuevo QR ${updated.tokenCorto}…`);
        this.load();
      },
      error: (e) => this.toast.error('No se pudo reemitir', this.errorMessage(e) ?? 'Intente de nuevo.'),
    });
  }

  protected previewToken(c: Credencial): void {
    this.selected.set(c);
    this.viewOpen.set(true);
  }

  protected async descargar(c: Credencial): Promise<void> {
    try {
      await descargarQrPng(c.qr, c.personaNombre);
    } catch {
      this.toast.error('Error', 'No se pudo generar la imagen del QR.');
    }
  }

  protected async imprimir(c: Credencial): Promise<void> {
    try {
      await imprimirGafete({ qr: c.qr, codigo: c.tokenCorto, titular: c.personaNombre, tipo: this.personaTipo(c.personaId) });
    } catch {
      this.toast.error('Error', 'No se pudo preparar la impresión del gafete.');
    }
  }

  protected estatusLabel(): string {
    const s = this.selected()?.estado;
    return s === 'activa' ? 'Activa' : s === 'revocada' ? 'Revocada' : '';
  }

  private errorMessage(e: unknown): string | null {
    const detail = (e as { error?: { detail?: string } })?.error?.detail;
    return detail ? String(detail) : null;
  }
}