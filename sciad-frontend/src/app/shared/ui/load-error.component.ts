// Estado de error de carga común (Fase 8.2): mensaje visible + botón "Reintentar". Nunca una lista vacía silenciosa.
import { Component, input, output } from '@angular/core';
import { EmptyState } from './empty-state.component';
import { Button } from './button.component';

@Component({
  selector: 'sci-load-error',
  standalone: true,
  imports: [EmptyState, Button],
  template: `
    <sci-empty-state icon="alertTriangle" [title]="title()" [message]="message()" role="alert">
      <button sci-btn variant="primary" size="sm" iconName="refresh" (click)="retry.emit()">Reintentar</button>
    </sci-empty-state>
  `,
})
export class LoadError {
  readonly title = input('No se pudo cargar');
  readonly message = input('No se pudieron cargar los datos.');
  readonly retry = output<void>();
}
