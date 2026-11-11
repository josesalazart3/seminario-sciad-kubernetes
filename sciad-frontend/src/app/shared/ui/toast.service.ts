import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: number;
  type: ToastType;
  title: string;
  message?: string;
}

const TOAST_MS = 4200;

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private counter = 0;

  private push(type: ToastType, title: string, message?: string): void {
    const id = ++this.counter;
    this.toasts.update((list) => [...list, { id, type, title, message }]);
    setTimeout(() => this.dismiss(id), TOAST_MS);
  }

  success(title: string, message?: string): void {
    this.push('success', title, message);
  }
  error(title: string, message?: string): void {
    this.push('error', title, message);
  }
  info(title: string, message?: string): void {
    this.push('info', title, message);
  }
  warning(title: string, message?: string): void {
    this.push('warning', title, message);
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
