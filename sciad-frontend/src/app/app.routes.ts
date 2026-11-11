import { Routes } from '@angular/router';
import {
  authGuard,
  adminGuard,
  securityGuard,
  managementGuard,
  homeRedirectGuard,
} from './core/auth/guards';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  // Raíz: redirige al home del rol autenticado (o a login).
  { path: '', canActivate: [homeRedirectGuard], children: [] },

  {
    path: 'admin',
    canActivate: [authGuard, adminGuard],
    loadComponent: () =>
      import('./shared/layout/app-shell.component').then((m) => m.AppShell),
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/admin/dashboard.component').then((m) => m.AdminDashboardComponent),
      },
      {
        path: 'usuarios',
        loadComponent: () =>
          import('./features/admin/users.component').then((m) => m.UsersComponent),
      },
      {
        path: 'personas',
        loadComponent: () =>
          import('./features/admin/personas.component').then((m) => m.PersonasComponent),
      },
      {
        path: 'zonas',
        loadComponent: () =>
          import('./features/admin/zonas.component').then((m) => m.ZonasComponent),
      },
      {
        path: 'perfiles',
        loadComponent: () =>
          import('./features/admin/profiles.component').then((m) => m.ProfilesComponent),
      },
      {
        path: 'credenciales',
        loadComponent: () =>
          import('./features/admin/credentials.component').then((m) => m.CredentialsComponent),
      },
      {
        path: 'auditoria',
        loadComponent: () =>
          import('./features/admin/audit.component').then((m) => m.AuditComponent),
      },
      {
        path: 'reportes',
        loadComponent: () =>
          import('./features/reports/reports.component').then((m) => m.ReportsComponent),
      },
      // El backend permite al Administrador registrar accesos (RequireSeguridadOAdmin): se expone
      // el mismo escáner para usarlo desde una computadora con cámara web.
      {
        path: 'escaneo',
        loadComponent: () =>
          import('./features/security/scan.component').then((m) => m.ScanComponent),
      },
      {
        path: 'accesos',
        loadComponent: () =>
          import('./features/security/access-log.component').then((m) => m.AccessLogComponent),
      },
    ],
  },

  {
    path: 'seguridad',
    canActivate: [authGuard, securityGuard],
    loadComponent: () =>
      import('./shared/layout/app-shell.component').then((m) => m.AppShell),
    children: [
      { path: '', redirectTo: 'escaneo', pathMatch: 'full' },
      {
        path: 'escaneo',
        loadComponent: () =>
          import('./features/security/scan.component').then((m) => m.ScanComponent),
      },
      {
        path: 'accesos',
        loadComponent: () =>
          import('./features/security/access-log.component').then((m) => m.AccessLogComponent),
      },
    ],
  },

  {
    path: 'gerencia',
    canActivate: [authGuard, managementGuard],
    loadComponent: () =>
      import('./shared/layout/app-shell.component').then((m) => m.AppShell),
    children: [
      { path: '', redirectTo: 'trazabilidad', pathMatch: 'full' },
      {
        path: 'trazabilidad',
        loadComponent: () =>
          import('./features/management/traceability.component').then((m) => m.TraceabilityComponent),
      },
      {
        path: 'notificaciones',
        loadComponent: () =>
          import('./features/management/notifications.component').then((m) => m.NotificationsComponent),
      },
      {
        path: 'reportes',
        loadComponent: () =>
          import('./features/reports/reports.component').then((m) => m.ReportsComponent),
      },
    ],
  },

  { path: '**', redirectTo: '' },
];
