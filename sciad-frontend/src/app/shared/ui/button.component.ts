import { Component, booleanAttribute, input } from '@angular/core';
import { Icon, IconName } from './icon.component';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

@Component({
  selector: 'button[sci-btn]',
  standalone: true,
  imports: [Icon],
  template: `
    @if (loading()) {
      <span class="btn-spinner" aria-hidden="true"></span>
      <span class="btn-label"><ng-content></ng-content></span>
    } @else {
      @if (iconName(); as ic) {
        <sci-icon [name]="ic" [size]="size() === 'sm' ? 16 : 18" />
      }
      <span class="btn-label"><ng-content></ng-content></span>
      @if (iconRight(); as ir) {
        <sci-icon [name]="ir" [size]="size() === 'sm' ? 16 : 18" />
      }
    }
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        border: 1px solid transparent;
        border-radius: var(--radius-sm);
        font-family: var(--font-body);
        font-weight: 600;
        line-height: 1;
        white-space: nowrap;
        transition:
          background-color var(--dur) var(--ease-out),
          border-color var(--dur) var(--ease-out),
          color var(--dur) var(--ease-out),
          transform var(--dur-fast) var(--ease-out),
          box-shadow var(--dur) var(--ease-out);
        user-select: none;
      }
      :host:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
      :host:not(:disabled):active {
        transform: translateY(1px);
      }

      .btn-spinner {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        border: 2px solid currentColor;
        border-right-color: transparent;
        animation: spin 0.7s linear infinite;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      :host([variant='primary']) {
        background: var(--sciad-brand);
        color: #fff;
        box-shadow: var(--shadow-sm);
      }
      :host([variant='primary']:not(:disabled):hover) {
        background: var(--sciad-brand-strong);
      }

      :host([variant='secondary']) {
        background: var(--surface);
        color: var(--text);
        border-color: var(--border-strong);
      }
      :host([variant='secondary']:not(:disabled):hover) {
        background: var(--surface-muted);
      }

      :host([variant='ghost']) {
        background: transparent;
        color: var(--text-muted);
      }
      :host([variant='ghost']:not(:disabled):hover) {
        background: var(--surface-sunken);
        color: var(--text);
      }

      :host([variant='danger']) {
        background: var(--sciad-danger);
        color: #fff;
      }
      :host([variant='danger']:not(:disabled):hover) {
        background: #a91e1e;
      }

      :host([size='sm']) {
        padding: 0 12px;
        height: 32px;
        font-size: 13px;
      }
      :host([size='md']) {
        padding: 0 16px;
        height: 40px;
        font-size: 14px;
      }
    `,
  ],
  host: {
    '[attr.disabled]': 'disabled() || loading() ? "" : null',
  },
})
export class Button {
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<ButtonSize>('md');
  readonly loading = input(false, { transform: booleanAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly iconName = input<IconName | null>(null);
  readonly iconRight = input<IconName | null>(null);
}
