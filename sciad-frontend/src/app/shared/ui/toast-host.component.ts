import { Component, inject } from '@angular/core';
import { ToastService, ToastType } from './toast.service';
import { Icon, IconName } from './icon.component';

const TYPE_META: Record<
  ToastType,
  { icon: IconName; tone: 'success' | 'danger' | 'warning' | 'info' }
> = {
  success: { icon: 'checkCircle', tone: 'success' },
  error: { icon: 'alertTriangle', tone: 'danger' },
  warning: { icon: 'alertTriangle', tone: 'warning' },
  info: { icon: 'info', tone: 'info' },
};

@Component({
  selector: 'sci-toast-host',
  standalone: true,
  imports: [Icon],
  template: `
    <div class="toast-host" aria-live="polite" aria-atomic="false">
      @for (t of service.toasts(); track t.id) {
        <div class="toast" [class]="'tone-' + TYPE_META[t.type].tone" role="status">
          <span class="toast-icon">
            <sci-icon [name]="TYPE_META[t.type].icon" [size]="18" />
          </span>
          <div class="toast-body">
            <div class="toast-title">{{ t.title }}</div>
            @if (t.message) {
              <div class="toast-msg">{{ t.message }}</div>
            }
          </div>
          <button class="toast-close" aria-label="Cerrar" (click)="service.dismiss(t.id)">
            <sci-icon name="x" [size]="16" />
          </button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: contents;
      }
      .toast-host {
        position: fixed;
        top: 16px;
        right: 16px;
        z-index: 100;
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-width: 380px;
        width: calc(100vw - 32px);
      }
      .toast {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        background: var(--surface);
        border: 1px solid var(--border);
        border-left-width: 3px;
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-lg);
        padding: 12px 14px;
      }
      .toast-icon { margin-top: 1px; }
      .tone-success { border-left-color: var(--sciad-success); }
      .tone-success .toast-icon { color: var(--sciad-success); }
      .tone-danger { border-left-color: var(--sciad-danger); }
      .tone-danger .toast-icon { color: var(--sciad-danger); }
      .tone-warning { border-left-color: var(--sciad-warning); }
      .tone-warning .toast-icon { color: var(--sciad-warning); }
      .tone-info { border-left-color: var(--sciad-info); }
      .tone-info .toast-icon { color: var(--sciad-info); }
      .toast-body { flex: 1; min-width: 0; }
      .toast-title { font-weight: 600; font-size: 14px; color: var(--text); }
      .toast-msg { font-size: 13px; color: var(--text-muted); margin-top: 2px; }
      .toast-close {
        background: transparent;
        border: none;
        color: var(--text-subtle);
        padding: 2px;
      }
      .toast-close:hover { color: var(--text); }
    `,
  ],
})
export class ToastHost {
  readonly service = inject(ToastService);
  protected readonly TYPE_META = TYPE_META;
}
