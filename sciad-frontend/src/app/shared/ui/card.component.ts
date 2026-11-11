import { Component } from '@angular/core';

@Component({
  selector: 'sci-card',
  standalone: true,
  template: ` <ng-content></ng-content> `,
  styles: [
    `
      :host {
        display: block;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-sm);
      }
    `,
  ],
})
export class Card {}
