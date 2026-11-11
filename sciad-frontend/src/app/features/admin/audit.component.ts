// Auditoría e integridad (CU-08): Fase 3 lo reconcilia al backend real — AuditoriaHallazgoDto
// {tipo, descripcion, personaId, personaNombre, estado:'abierto'|'en_revision'|'resuelto', fecha}.
// "Verificar integridad" ejecuta POST /auditoria/verificar (solo Admin) y vuelve a cargar.
import { Component, inject, OnInit, signal } from '@angular/core';
import { AuditService } from '../../core/services/crud.service';
import { HallazgoAuditoria, HallazgoEstado } from '../../core/models/audit.model';
import { Button } from '../../shared/ui/button.component';
import { Card } from '../../shared/ui/card.component';
import { Badge, StatusKey } from '../../shared/ui/badge.component';
import { EmptyState } from '../../shared/ui/empty-state.component';
import { ToastService } from '../../shared/ui/toast.service';
import { LoadError } from '../../shared/ui/load-error.component';
import { recurso } from '../../core/util/recurso';

function estBadge(e: HallazgoEstado): StatusKey {
  return e === 'abierto' ? 'abierto' : e === 'en_revision' ? 'revisando' : 'resuelto';
}
const TIPO_LABELS: Record<string, string> = {
  acceso_sin_egreso: 'Acceso sin egreso',
  concentracion: 'Concentración inusual',
  registro_duplicado: 'Registro duplicado',
};
function tipoLabel(tipo: string): string {
  return TIPO_LABELS[tipo] ?? tipo;
}

@Component({
  selector: 'app-admin-audit',
  standalone: true,
  imports: [LoadError, Button, Card, Badge, EmptyState],
  template: `
    <div class="page">
      <div class="page-header">
        <div class="page-heading">
          <h1>Auditoría e integridad</h1>
          <p class="page-sub">Inconsistencias detectadas en las bitácoras (CU-08 / CU-09).</p>
        </div>
        <button sci-btn variant="primary" size="md" iconName="activity" [loading]="verifying()" (click)="verify()">
          Verificar integridad
        </button>
      </div>

      <sci-card>
        <div class="body">
          @if (loading()) {
            <table class="sci-table"><tbody>
              @for (i of [1,2,3]; track i) {
                <tr class="sci-skel-row">@for (c of [1,2,3,4]; track c) {<td><div class="skel"></div></td>}</tr>
              }
            </tbody></table>
          } @else if (carga.error(); as e) {
            <sci-load-error [message]="e" (retry)="carga.cargar()" />
          } @else if (items().length === 0) {
            <sci-empty-state icon="checkCircle" title="Sin hallazgos" message="Todas las bitácoras verificadas sin inconsistencias." />
          } @else {
            <div class="list">
              @for (a of items(); track a.id) {
                <div class="item">
                  <div class="item-main">
                    <div class="item-head">
                      <span class="item-type">{{ tipoLabel(a.tipo) }}</span>
                      <sci-badge [status]="estBadge(a.estado)" />
                    </div>
                    <p class="item-desc">{{ a.descripcion }}</p>
                    <div class="item-meta">
                      @if (a.personaNombre) {
                        <span class="chip">{{ a.personaNombre }}</span>
                      }
                      <span class="muted subtle">{{ a.fecha }}</span>
                    </div>
                  </div>
                  <div class="item-actions">
                    @if (a.estado === 'abierto') {
                      <button sci-btn variant="secondary" size="sm" (click)="advance(a, 'en_revision')">Iniciar revisión</button>
                    }
                    @if (a.estado === 'en_revision') {
                      <button sci-btn variant="primary" size="sm" iconName="check" (click)="advance(a, 'resuelto')">Marcar resuelto</button>
                    }
                    @if (a.estado === 'resuelto') {
                      <button sci-btn variant="ghost" size="sm" (click)="advance(a, 'abierto')">Reabrir</button>
                    }
                  </div>
                </div>
              }
            </div>
          }
        </div>
      </sci-card>
    </div>
  `,
  styles: [
    `
      .body { padding: 8px 0; }
      .list { display: flex; flex-direction: column; }
      .item {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        padding: 18px 20px;
        border-bottom: 1px solid var(--border);
      }
      .item:last-child { border-bottom: none; }
      .item-main { min-width: 0; }
      .item-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .item-type { font-weight: 700; font-size: 15px; color: var(--text); }
      .item-desc { font-size: 14px; color: var(--text-muted); margin-top: 6px; }
      .item-meta { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
      .item-actions { display: flex; gap: 8px; flex: none; }
      @media (max-width: 639px) {
        .item { flex-direction: column; }
      }
    `,
  ],
})
export class AuditComponent implements OnInit {
  private readonly service = inject(AuditService);
  private readonly toast = inject(ToastService);

  protected readonly estBadge = estBadge;
  protected readonly tipoLabel = tipoLabel;
  protected readonly verifying = signal(false);
  /** Carga común (Fase 8.2): estado cargando / listo / error + reintentar. */
  protected readonly carga = recurso(() => this.service.list(), [] as HallazgoAuditoria[], 'No se pudieron cargar los hallazgos.');
  protected readonly items = this.carga.datos;
  protected readonly loading = this.carga.cargando;

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.carga.cargar();
  }

  protected verify(): void {
    this.verifying.set(true);
    this.service.verificar().subscribe({
      next: (res) => {
        this.verifying.set(false);
        const detalle =
          res.hallazgosCreados === 0 && res.notificacionesGeneradas === 0
            ? 'Sin inconsistencias detectadas.'
            : `${res.hallazgosCreados} hallazgo(s), ${res.notificacionesGeneradas} notificación(es).`;
        this.toast.info('Verificación completada', detalle);
        this.load();
      },
      error: () => {
        this.verifying.set(false);
        this.toast.error('Error', 'La verificación no se pudo ejecutar.');
      },
    });
  }

  protected advance(a: HallazgoAuditoria, estado: HallazgoEstado): void {
    this.service.setEstado(a.id, estado).subscribe({
      next: () => {
        this.toast.success('Estado actualizado', tipoLabel(a.tipo));
        this.load();
      },
      error: () => this.toast.error('Error', 'No se pudo actualizar.'),
    });
  }
}