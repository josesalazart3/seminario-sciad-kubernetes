// Carga de datos común para todas las pantallas (Fase 8.2): un único patrón con estado "cargando" / "listo" / "error",
// mensaje de error legible y reintento. Todo vive en signals, así que la vista se repinta sola al llegar la respuesta
// (la app es zoneless: un dato que no está en un signal no dispara la detección de cambios).
//
//   protected readonly zonas = recurso(() => this.service.list(), [] as Zona[]);
//   ngOnInit() { this.zonas.cargar(); }
//   plantilla: @if (zonas.cargando()) {…} @else if (zonas.error(); as e) { <sci-load-error [message]="e" (retry)="zonas.cargar()" /> } …
import { DestroyRef, WritableSignal, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, Subscription } from 'rxjs';

export type EstadoCarga = 'cargando' | 'listo' | 'error';

export interface Recurso<T> {
  readonly datos: WritableSignal<T>;
  readonly estado: () => EstadoCarga;
  readonly cargando: () => boolean;
  readonly error: () => string | null;
  /** (Re)carga. Si ya había una petición en curso, se cancela y vale la última. */
  cargar(): void;
}

/** Mensaje legible para el usuario a partir de un error HTTP. */
export function mensajeError(e: unknown, porDefecto = 'No se pudieron cargar los datos.'): string {
  if (e instanceof HttpErrorResponse) {
    if (e.status === 0) return 'No hay conexión con el servidor. Revise la red e intente de nuevo.';
    const detail = (e.error as { detail?: string } | null)?.detail;
    if (detail) return detail;
    if (e.status === 403) return 'Su rol no tiene permiso para ver esta información.';
    if (e.status >= 500) return 'El servidor tuvo un problema al responder. Intente de nuevo.';
  }
  return porDefecto;
}

/** Debe llamarse en un contexto de inyección (inicializador de campo de un componente). */
export function recurso<T>(fuente: () => Observable<T>, inicial: T, mensajePorDefecto?: string): Recurso<T> {
  const datos = signal<T>(inicial);
  const estado = signal<EstadoCarga>('cargando');
  const error = signal<string | null>(null);
  let sub: Subscription | undefined;
  inject(DestroyRef).onDestroy(() => sub?.unsubscribe());

  return {
    datos,
    estado: estado.asReadonly(),
    cargando: computed(() => estado() === 'cargando'),
    error: error.asReadonly(),
    cargar(): void {
      sub?.unsubscribe();
      estado.set('cargando');
      error.set(null);
      sub = fuente().subscribe({
        next: (v) => { datos.set(v); estado.set('listo'); },
        error: (e: unknown) => { error.set(mensajeError(e, mensajePorDefecto)); estado.set('error'); },
      });
    },
  };
}
