// Interceptor HTTP: adjunta el JWT (Bearer) a cada petición y maneja la sesión vencida.
// Si el servidor responde 401 en cualquier endpoint (excepto el propio login), el token expiró
// (8 h, RF-10) o fue invalidado: se cierra la sesión local y se vuelve al login.
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../../shared/ui/toast.service';

export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const toast = inject(ToastService);

  const token = auth.token();
  if (token) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }
  const esLogin = req.url.includes('/auth/login');

  return next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401 && !esLogin && auth.isAuthenticated()) {
        auth.logout();
        toast.warning('Sesión expirada', 'Inicia sesión nuevamente para continuar.');
        void router.navigate(['/login']);
      }
      return throwError(() => err);
    }),
  );
};
