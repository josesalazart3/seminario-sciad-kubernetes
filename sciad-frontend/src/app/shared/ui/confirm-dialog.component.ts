// Diálogo de confirmación común (Fase 8.4) sobre sci-modal (foco atrapado, Esc cierra).
import { Component, input, output } from '@angular/core';
import { Modal } from './modal.component';
import { Button, ButtonVariant } from './button.component';

@Component({
  selector: 'sci-confirm-dialog',
  standalone: true,
  imports: [Modal, Button],
  template: `
    <sci-modal [open]="open()" [title]="title()" (closed)="cancelled.emit()">
      <p class="msg">{{ message() }}</p>
      <div sci-modal-actions>
        <button sci-btn variant="ghost" size="md" type="button" [disabled]="loading()" (click)="cancelled.emit()">Cancelar</button>
        <button sci-btn [variant]="variant()" size="md" type="button" class="confirmar" [loading]="loading()" (click)="confirmed.emit()">
          {{ confirmLabel() }}
        </button>
      </div>
    </sci-modal>
  `,
  styles: [`.msg { margin: 0; font-size: 14px; line-height: 1.5; color: var(--text); }`],
})
export class ConfirmDialog {
  readonly open = input(false);
  readonly title = input('Confirmar');
  readonly message = input('');
  readonly confirmLabel = input('Confirmar');
  readonly variant = input<ButtonVariant>('primary');
  readonly loading = input(false);
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();
}
