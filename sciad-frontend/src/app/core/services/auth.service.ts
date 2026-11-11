// Sesión simulada (RBAC) con signals. En Fase 2 valida contra la API real.
import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Usuario, CredencialesLogin, Rol } from '../models/user.model';

// Datos de demo para la pantalla de login
export interface DemoAccount {
  email: string;
  password: string;
  rol: Rol;
  label: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { email: 'admin@sciad.gt', password: 'sciad123', rol: 'ADMIN', label: 'Administrador' },
  { email: 'seguridad@sciad.gt', password: 'sciad123', rol: 'SEGURIDAD', label: 'Personal de Seguridad' },
  { email: 'gerencia@sciad.gt', password: 'sciad123', rol: 'GERENCIA', label: 'Gerencia / Auditoría' },
];

const STORAGE_KEY = 'sciad.session';

interface SessionState {
  user: Usuario | null;
  token: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly session = signal<SessionState>(this.readStored());

  readonly user = this.session.asReadonly();
  readonly isAuthenticated = computed(() => this.session().user !== null);
  readonly token = computed(() => this.session().token);
  readonly role = computed<Rol | null>(() => this.session().user?.rol ?? null);

  constructor(private http: HttpClient) {}

  login(creds: CredencialesLogin): Observable<{ user: Usuario; token: string }> {
    return this.http
      .post<{ user: Usuario; token: string }>(`${environment.apiUrl}/auth/login`, creds)
      .pipe(
        map((res) => {
          this.setSession(res.user, res.token);
          return res;
        }),
      );
  }

  logout(): void {
    this.session.set({ user: null, token: null });
    this.clearStored();
  }

  /** Nombre del usuario actual para registrar acciones. */
  currentUserName(): string {
    return this.session().user?.nombre ?? 'Operador';
  }

  currentUser(): Usuario | null {
    return this.session().user ?? null;
  }

  // La sesión (JWT) vive en sessionStorage, NO en localStorage: se borra al cerrar la pestaña o la app instalada, no queda
  // en disco entre sesiones del navegador y no se comparte entre pestañas. Recargar la página NO cierra la sesión.
  // (Cualquier entrada antigua en localStorage se elimina.)
  private setSession(user: Usuario, token: string): void {
    this.session.set({ user, token });
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ user, token }));
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  private clearStored(): void {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(STORAGE_KEY);
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
  }

  private readStored(): SessionState {
    if (typeof sessionStorage === 'undefined') return { user: null, token: null };
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY); // migración: no dejar tokens viejos en disco
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return { user: null, token: null };
      const parsed = JSON.parse(raw) as SessionState;
      return parsed.user ? parsed : { user: null, token: null };
    } catch {
      return { user: null, token: null };
    }
  }
}
