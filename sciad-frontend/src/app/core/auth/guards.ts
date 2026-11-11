import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { Rol } from '../models/user.model';
import { homeFor } from './paths';

/** Requiere sesión activa; si no, redirige a login. */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAuthenticated()) return true;
  return router.createUrlTree(['/login']);
};

/** Requiere uno de los roles indicados. */
export function roleGuard(...allowed: Rol[]): CanActivateFn {
  return (_route: ActivatedRouteSnapshot, _state: RouterStateSnapshot) => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const role = auth.role();
    if (role && allowed.includes(role)) return true;
    // Redirige al home del rol actual, o a login si no hay sesión.
    return router.createUrlTree([homeFor(role)]);
  };
}

/** Redirige '/' al home del rol autenticado (o a login). */
export const homeRedirectGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return router.createUrlTree([homeFor(auth.role())]);
};

// Guards por rol reutilizables
export const adminGuard = roleGuard('ADMIN');
export const securityGuard = roleGuard('SEGURIDAD');
export const managementGuard = roleGuard('GERENCIA');
