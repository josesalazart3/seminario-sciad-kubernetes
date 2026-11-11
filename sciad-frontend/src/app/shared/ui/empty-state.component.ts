import { Component, input } from '@angular/core';
import { Icon, IconName } from './icon.component';

@Component({
  selector: 'sci-empty-state',
  standalone: true,
  imports: [Icon],
  template: `
    <div class="empty">
      <div class="empty-icon"><sci-icon [name]="icon()" [size]="28" /></div>
      <h3 class="empty-title">{{ title() }}</h3>
      <p class="empty-msg">{{ message() }}</p>
      <div class="empty-action"><ng-content></ng-content></div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 48px 24px;
        gap: 8px;
      }
      .empty-icon {
        width: 56px;
        height: 56px;
        border-radius: var(--radius-md);
        background: var(--surface-sunken);
        color: var(--text-subtle);
        display: grid;
        place-items: center;
        margin-bottom: 4px;
      }
      .empty-title { font-size: 16px; }
      .empty-msg { max-width: 380px; font-size: 14px; }
      .empty-action { margin-top: 12px; }
    `,
  ],
})
export class EmptyState {
  readonly icon = input<IconName>('file');
  readonly title = input<string>('Sin datos');
  readonly message = input<string>('No hay información para mostrar.');
  // El slot ng-content es opcional: si va vacío no renderiza nada visible.
}
