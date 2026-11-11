import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService, DEMO_ACCOUNTS } from '../../core/services/auth.service';
import { Icon } from '../../shared/ui/icon.component';
import { Button } from '../../shared/ui/button.component';
import { SciInput } from '../../shared/ui/field.component';
import { ToastService } from '../../shared/ui/toast.service';
import { homeFor } from '../../core/auth/paths';
import { SHOW_DEMO_ACCOUNTS } from '../../../environments/environment';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, Icon, Button, SciInput],
  template: `
    <div class="login">
      <div class="card">
        <div class="brand">
          <span class="brand-mark"><sci-icon name="shield" [size]="22" /></span>
          <span class="brand-name">SCIAD</span>
        </div>
        <h1 class="title">Control de acceso</h1>
        <p class="sub">Ingresa para acceder al sistema de identidad y accesos.</p>

        <form [formGroup]="form" (ngSubmit)="submit()" class="frm">
          <sci-input
            formControlName="email"
            label="Correo electrónico"
            placeholder="usuario@sciad.gt"
            [error]="emailError()"
          />
          <sci-input
            formControlName="password"
            type="password"
            label="Contraseña"
            placeholder="••••••••"
            [error]="passwordError()"
          />

          @if (serverError()) {
            <div class="error-banner" role="alert">
              <sci-icon name="alertTriangle" [size]="18" />
              {{ serverError() }}
            </div>
          }

          <button sci-btn variant="primary" size="md" [loading]="loading()" class="submit">
            Entrar
          </button>
        </form>

        @if (showDemoAccounts) {
          <div class="demo">
            <div class="demo-label uppercase-label">Cuentas de demostración</div>
            <div class="demo-grid">
              @for (acc of demoAccounts; track acc.email) {
                <button type="button" class="demo-chip" (click)="fill(acc.email, acc.password)">
                  <span class="dot" [class]="'d-' + acc.rol.toLowerCase()"></span>
                  <span>{{ acc.label }}</span>
                </button>
              }
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .login {
        min-height: 100dvh;
        display: grid;
        place-items: center;
        padding: 24px;
        background:
          radial-gradient(1100px 500px at 85% -10%, var(--sciad-brand-soft), transparent 60%),
          var(--surface-muted);
      }
      .card {
        width: 100%;
        max-width: 400px;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-lg);
        padding: 32px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 16px;
      }
      .brand-mark {
        width: 40px;
        height: 40px;
        border-radius: 11px;
        background: var(--sciad-brand);
        color: #fff;
        display: grid;
        place-items: center;
      }
      .brand-name {
        font-family: var(--font-display);
        font-weight: 700;
        font-size: 22px;
        letter-spacing: 0.02em;
      }
      .title {
        font-size: 22px;
      }
      .sub {
        font-size: 14px;
        margin-bottom: 12px;
      }
      .frm {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .submit {
        width: 100%;
        margin-top: 4px;
      }
      .demo {
        margin-top: 24px;
        padding-top: 16px;
        border-top: 1px solid var(--border);
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .demo-label {
        color: var(--text-subtle);
      }
      .demo-grid {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .demo-chip {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        padding: 9px 12px;
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        background: var(--surface);
        color: var(--text);
        font-size: 13px;
        font-weight: 500;
        text-align: left;
        transition: border-color var(--dur-fast), background var(--dur-fast);
      }
      .demo-chip:hover {
        border-color: var(--sciad-brand);
        background: var(--sciad-brand-soft);
      }
      .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--text-subtle);
      }
      .dot.d-admin { background: var(--sciad-brand); }
      .dot.d-seguridad { background: var(--sciad-success); }
      .dot.d-gerencia { background: var(--sciad-warning); }
    `,
  ],
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  // Con SHOW_DEMO_ACCOUNTS=false (producción) esta rama se elimina en la compilación: DEMO_ACCOUNTS no llega al bundle.
  protected readonly demoAccounts = SHOW_DEMO_ACCOUNTS ? DEMO_ACCOUNTS : [];
  /** Las cuentas demo (con su contraseña) solo se muestran en desarrollo; el build de producción las oculta. */
  protected readonly showDemoAccounts = SHOW_DEMO_ACCOUNTS;
  protected readonly loading = signal(false);
  protected readonly serverError = signal<string | null>(null);

  protected readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  protected emailError(): string | null {
    const c = this.form.controls.email;
    if (c.touched && c.errors?.['required']) return 'Ingresa tu correo.';
    if (c.touched && c.errors?.['email']) return 'Correo no válido.';
    return null;
  }
  protected passwordError(): string | null {
    const c = this.form.controls.password;
    if (c.touched && c.errors?.['required']) return 'Ingresa tu contraseña.';
    return null;
  }

  fill(email: string, password: string): void {
    this.form.setValue({ email, password });
    this.serverError.set(null);
  }

  submit(): void {
    this.serverError.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { email, password } = this.form.value;
    this.loading.set(true);
    this.auth.login({ email: email!, password: password! }).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.toast.success('Bienvenido', `Sesión iniciada como ${res.user.nombre}`);
        this.router.navigate([homeFor(res.user.rol)]);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        if (err.status === 401) {
          this.serverError.set('Credenciales incorrectas. Revisa correo y contraseña.');
        } else {
          this.serverError.set('No se pudo iniciar sesión. Intenta de nuevo.');
        }
      },
    });
  }
}
