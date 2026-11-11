import {
  Component,
  ElementRef,
  HostListener,
  inject,
  input,
  model,
  output,
} from '@angular/core';
import { Icon, IconName } from './icon.component';

@Component({
  selector: 'sci-modal',
  standalone: true,
  imports: [Icon],
  template: `
    <div class="overlay" (click)="onBackdrop()" [class.visible]="open()">
      <div
        class="panel"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="title() || 'Diálogo'"
        (click)="stop($event)"
      >
        <header class="head">
          <h3 class="modal-title">{{ title() }}</h3>
          <button class="close" aria-label="Cerrar" (click)="close()">
            <sci-icon name="x" [size]="18" />
          </button>
        </header>
        <div class="body"><ng-content></ng-content></div>
        <ng-content select="[sci-modal-actions]"></ng-content>
      </div>
    </div>
  `,
  styles: [
    `
      .overlay {
        position: fixed;
        inset: 0;
        z-index: 50;
        background: rgb(15 23 42 / 0.45);
        display: grid;
        place-items: center;
        padding: 16px;
        opacity: 0;
        visibility: hidden;
        transition: opacity var(--dur) var(--ease-out), visibility var(--dur);
      }
      .overlay.visible {
        opacity: 1;
        visibility: visible;
      }
      .panel {
        width: 100%;
        max-width: 560px;
        max-height: min(85vh, 720px);
        overflow: auto;
        background: var(--surface);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-lg);
        display: flex;
        flex-direction: column;
        transform: translateY(8px) scale(0.98);
        transition: transform var(--dur) var(--ease-out);
      }
      .overlay.visible .panel {
        transform: none;
      }
      .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid var(--border);
      }
      .modal-title { font-size: 18px; }
      .close {
        border: none;
        background: transparent;
        color: var(--text-muted);
        width: 32px;
        height: 32px;
        border-radius: 8px;
        display: grid;
        place-items: center;
      }
      .close:hover { background: var(--surface-sunken); color: var(--text); }
      .body { padding: 20px; }
      ::ng-deep [sci-modal-actions] {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 16px 20px;
        border-top: 1px solid var(--border);
      }
    `,
  ],
})
export class Modal {
  readonly el = inject(ElementRef<HTMLElement>);
  readonly open = input(false);
  readonly title = input<string>('');
  readonly closed = output<void>();

  close(): void {
    this.closed.emit();
  }
  stop(e: Event): void {
    e.stopPropagation();
  }
  onBackdrop(): void {
    this.close();
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.open()) this.close();
  }
}
