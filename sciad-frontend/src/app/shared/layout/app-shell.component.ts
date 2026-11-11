import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ROL_LABELS, Rol } from '../../core/models/user.model';
import { Icon, IconName } from '../ui/icon.component';

interface NavItem {
  label: string;
  path: string;
  icon: IconName;
  roles: Rol[];
}

const NAV: NavItem[] = [
  { label: 'Dashboard', path: '/admin/dashboard', icon: 'dashboard', roles: ['ADMIN'] },
  { label: 'Usuarios', path: '/admin/usuarios', icon: 'users', roles: ['ADMIN'] },
  { label: 'Personas', path: '/admin/personas', icon: 'users', roles: ['ADMIN'] },
  { label: 'Zonas de acceso', path: '/admin/zonas', icon: 'building2', roles: ['ADMIN'] },
  { label: 'Perfiles de acceso', path: '/admin/perfiles', icon: 'id-card', roles: ['ADMIN'] },
  { label: 'Credenciales QR', path: '/admin/credenciales', icon: 'qr', roles: ['ADMIN'] },
  { label: 'Auditoría', path: '/admin/auditoria', icon: 'activity', roles: ['ADMIN'] },
  { label: 'Reportes', path: '/admin/reportes', icon: 'file', roles: ['ADMIN'] },
  { label: 'Punto de acceso', path: '/admin/escaneo', icon: 'scan', roles: ['ADMIN'] },
  { label: 'Accesos de hoy', path: '/admin/accesos', icon: 'clock', roles: ['ADMIN'] },

  { label: 'Punto de acceso', path: '/seguridad/escaneo', icon: 'scan', roles: ['SEGURIDAD'] },
  { label: 'Accesos del turno', path: '/seguridad/accesos', icon: 'clock', roles: ['SEGURIDAD'] },

  { label: 'Trazabilidad', path: '/gerencia/trazabilidad', icon: 'activity', roles: ['GERENCIA'] },
  { label: 'Notificaciones', path: '/gerencia/notificaciones', icon: 'bell', roles: ['GERENCIA'] },
  { label: 'Reportes', path: '/gerencia/reportes', icon: 'file', roles: ['GERENCIA'] },
];

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon],
  template: `
    <div class="shell">
      <aside class="sidebar" [class.open]="mobileOpen()" aria-label="Navegación principal">
        <div class="brand">
          <span class="brand-mark"><sci-icon name="shield" [size]="20" /></span>
          <span class="brand-name">SCIAD</span>
        </div>

        <nav class="nav">
          @for (item of navItems(); track item.path) {
            <a
              class="nav-item"
              [routerLink]="item.path"
              routerLinkActive="active"
              [routerLinkActiveOptions]="{ exact: false }"
            >
              <sci-icon [name]="item.icon" [size]="18" />
              <span>{{ item.label }}</span>
            </a>
          }
        </nav>

        <div class="sidebar-foot">
          <div class="user-box">
            <span class="avatar">{{ currentUser()?.avatarInitials }}</span>
            <div class="user-meta">
              <div class="user-name">{{ currentUser()?.nombre }}</div>
              <div class="user-role">{{ roleLabel() }}</div>
            </div>
          </div>
          <button class="logout" (click)="logout()" [attr.aria-label]="'Cerrar sesión'">
            <sci-icon name="log-out" [size]="18" />
            <span class="logout-txt">Salir</span>
          </button>
        </div>
      </aside>

      <div class="backdrop" [class.open]="mobileOpen()" (click)="mobileOpen.set(false)"></div>

      <div class="main">
        <header class="topbar">
          <button class="hamburger" (click)="mobileOpen.set(!mobileOpen())" aria-label="Abrir menú">
            <sci-icon name="menu" [size]="20" />
          </button>
          <div class="topbar-title">{{ pageTitle() }}</div>
          <div class="topbar-right">
            <span class="role-chip mono">{{ roleLabel() }}</span>
            <span class="avatar top-avatar">{{ currentUser()?.avatarInitials }}</span>
          </div>
        </header>
        <main class="content">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100dvh;
      }
      .shell {
        display: flex;
        height: 100%;
      }
      .sidebar {
        width: var(--sidebar-w);
        flex: none;
        background: var(--surface);
        border-right: 1px solid var(--border);
        display: flex;
        flex-direction: column;
        height: 100%;
        position: relative;
        z-index: 20;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 18px 20px;
        border-bottom: 1px solid var(--border);
      }
      .brand-mark {
        width: 36px;
        height: 36px;
        border-radius: 10px;
        background: var(--sciad-brand);
        color: #fff;
        display: grid;
        place-items: center;
      }
      .brand-name {
        font-family: var(--font-display);
        font-weight: 700;
        font-size: 20px;
        letter-spacing: 0.02em;
        color: var(--text);
      }
      .nav {
        flex: 1;
        overflow-y: auto;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .nav-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        border-radius: var(--radius-sm);
        color: var(--text-muted);
        font-weight: 500;
        font-size: 14px;
        transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast);
      }
      .nav-item:hover {
        background: var(--surface-muted);
        color: var(--text);
      }
      .nav-item.active {
        background: var(--sciad-brand-soft);
        color: var(--sciad-brand);
        font-weight: 600;
      }
      .sidebar-foot {
        border-top: 1px solid var(--border);
        padding: 14px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .user-box {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .user-meta {
        min-width: 0;
      }
      .user-name {
        font-weight: 600;
        font-size: 13px;
        color: var(--text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .user-role {
        font-size: 12px;
        color: var(--text-subtle);
      }
      .logout {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 8px 10px;
        border: none;
        border-radius: var(--radius-sm);
        background: transparent;
        color: var(--text-muted);
        font-weight: 500;
        font-size: 13px;
      }
      .logout:hover {
        background: var(--sciad-danger-soft);
        color: var(--sciad-danger);
      }

      .main {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        height: 100%;
      }
      .topbar {
        height: var(--topbar-h);
        flex: none;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 0 20px;
        background: var(--surface);
        border-bottom: 1px solid var(--border);
      }
      .hamburger {
        display: none;
        border: none;
        background: transparent;
        color: var(--text-muted);
        width: 36px;
        height: 36px;
        border-radius: 8px;
        align-items: center;
        justify-content: center;
      }
      .hamburger:hover {
        background: var(--surface-sunken);
      }
      .topbar-title {
        font-family: var(--font-display);
        font-weight: 600;
        font-size: 16px;
        color: var(--text);
      }
      .topbar-right {
        margin-left: auto;
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .role-chip {
        font-size: 12px;
        font-weight: 600;
        color: var(--sciad-brand);
        background: var(--sciad-brand-soft);
        padding: 4px 10px;
        border-radius: 999px;
      }
      .top-avatar {
        background: var(--surface-sunken);
        color: var(--text-muted);
      }
      .content {
        flex: 1;
        overflow-y: auto;
      }

      .backdrop {
        display: none;
      }

      @media (max-width: 767px) {
        .sidebar {
          position: fixed;
          top: 0;
          left: 0;
          bottom: 0;
          transform: translateX(-100%);
          transition: transform var(--dur) var(--ease-out);
          box-shadow: var(--shadow-lg);
        }
        .sidebar.open {
          transform: none;
        }
        .backdrop {
          display: block;
          position: fixed;
          inset: 0;
          background: rgb(15 23 42 / 0.45);
          z-index: 15;
          opacity: 0;
          visibility: hidden;
          transition: opacity var(--dur), visibility var(--dur);
        }
        .backdrop.open {
          opacity: 1;
          visibility: visible;
        }
        .hamburger {
          display: inline-flex;
        }
        .logout-txt {
          display: none;
        }
      }
    `,
  ],
})
export class AppShell {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly currentUser = computed(() => this.auth.user().user);
  readonly role = this.auth.role;
  protected readonly mobileOpen = signal(false);
  protected readonly navItems = computed(() => {
    const r = this.auth.role();
    return NAV.filter((i) => i.roles.includes(r as Rol));
  });
  protected readonly roleLabel = computed(() =>
    this.auth.role() ? ROL_LABELS[this.auth.role() as Rol] : '',
  );
  protected readonly pageTitle = computed(() => {
    const item = this.navItems().find((i) => this.router.url.startsWith(i.path));
    return item?.label ?? 'SCIAD';
  });

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
