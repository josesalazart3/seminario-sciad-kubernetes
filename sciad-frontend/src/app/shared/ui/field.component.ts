// Campos de formulario con label, helper y error (ControlValueAccessor).
// Compatibles con reactive forms: <sci-input formControlName="x" label="..." />
import { booleanAttribute, ChangeDetectorRef, Component, Directive, forwardRef, inject, input } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

const FIELD_STYLES = `
  :host { display: block; }
  .fld { display: flex; flex-direction: column; gap: 6px; }
  .fld-label { font-size: 13px; font-weight: 600; color: var(--text); }
  input, select {
    width: 100%;
    height: 40px;
    padding: 0 12px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong);
    background: var(--surface);
    color: var(--text);
    font-size: 14px;
    transition: border-color var(--dur) var(--ease-out), box-shadow var(--dur) var(--ease-out);
  }
  select { appearance: none; background-image: linear-gradient(45deg, transparent 50%, var(--text-muted) 50%), linear-gradient(135deg, var(--text-muted) 50%, transparent 50%); background-position: calc(100% - 18px) 18px, calc(100% - 13px) 18px; background-size: 5px 5px; background-repeat: no-repeat; padding-right: 34px; }
  input::placeholder { color: var(--text-subtle); }
  input:focus, select:focus { outline: none; border-color: var(--sciad-brand); box-shadow: 0 0 0 3px var(--sciad-brand-soft); }
  input:disabled, select:disabled { background: var(--surface-muted); color: var(--text-subtle); cursor: not-allowed; }
  .has-error input, .has-error select { border-color: var(--sciad-danger); }
  .has-error input:focus, .has-error select:focus { box-shadow: 0 0 0 3px var(--sciad-danger-soft); }
  .fld-helper { font-size: 12px; color: var(--text-subtle); }
  .fld-error { font-size: 12px; color: var(--sciad-danger); font-weight: 500; }
  .fld-foot { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
  .fld-counter { font-size: 12px; color: var(--text-subtle); font-variant-numeric: tabular-nums; white-space: nowrap; }
`;

@Directive()
export abstract class FieldBase<T> implements ControlValueAccessor {
  readonly label = input<string | null>(null);
  readonly helper = input<string | null>(null);
  readonly error = input<string | null>(null);
  readonly placeholder = input<string>('');

  value: T | null = null;
  disabled = false;

  private onChange: (v: T | null) => void = () => {};
  private onTouched: () => void = () => {};
  private readonly cdr = inject(ChangeDetectorRef);

  // Sin zone.js, un valor puesto desde el formulario (patchValue al abrir «Editar») no se pintaba hasta otro evento.
  writeValue(v: T | null): void {
    this.value = v;
    this.cdr.markForCheck();
  }
  registerOnChange(fn: (v: T | null) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(d: boolean): void {
    this.disabled = d;
  }
  protected handleInput(v: T | null): void {
    this.value = v;
    this.onChange(v);
    this.onTouched();
  }
  protected inputId = `fld-${Math.random().toString(36).slice(2, 8)}`;
}

@Component({
  selector: 'sci-input',
  standalone: true,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SciInput), multi: true },
  ],
  template: `
    <label class="fld" [class.has-error]="error()" [class.has-label]="!!label()">
      @if (label(); as l) {
        <span class="fld-label">{{ l }}</span>
      }
      <input
        [id]="inputId"
        [type]="type()"
        [value]="value ?? ''"
        [placeholder]="placeholder()"
        [disabled]="disabled"
        [attr.inputmode]="inputmode()"
        [attr.maxlength]="maxlength()"
        [attr.aria-invalid]="error() ? 'true' : null"
        (input)="onInput($any($event.target))"
        (paste)="onPaste($event)"
      />
      @if (counter()) {
        <!-- Con contador (p. ej. DPI "n/13"): el contador se ve SIEMPRE, junto al error o la ayuda. -->
        <span class="fld-foot">
          @if (error(); as e) {
            <span class="fld-error">{{ e }}</span>
          } @else if (helper()) {
            <span class="fld-helper">{{ helper() }}</span>
          } @else {
            <span></span>
          }
          <span class="fld-counter" aria-live="polite">{{ counter() }}</span>
        </span>
      } @else {
        @if (helper() && !error()) {
          <span class="fld-helper">{{ helper() }}</span>
        }
        @if (error(); as e) {
          <span class="fld-error">{{ e }}</span>
        }
      }
    </label>
  `,
  styles: [FIELD_STYLES],
})
export class SciInput extends FieldBase<string> {
  readonly type = input<string>('text');
  readonly inputmode = input<string | null>(null);
  readonly maxlength = input<number | null>(null);
  /** Contador visible siempre (p. ej. "6/13"), también cuando hay error. */
  readonly counter = input<string | null>(null);
  /** Solo acepta dígitos: filtra lo que se teclea y lo que se pega (p. ej. un DPI con guiones o espacios). */
  readonly soloDigitos = input(false, { transform: booleanAttribute });

  protected onInput(el: HTMLInputElement): void {
    let v = el.value;
    if (this.soloDigitos()) {
      const limpio = this.recortar(v.replace(/\D/g, ''));
      if (limpio !== v) el.value = limpio;
      v = limpio;
    }
    this.handleInput(v);
  }

  /** Al pegar se filtra ANTES de aplicar maxlength, para no perder dígitos si el texto trae guiones. */
  protected onPaste(ev: ClipboardEvent): void {
    if (!this.soloDigitos()) return;
    ev.preventDefault();
    const el = ev.target as HTMLInputElement;
    const pegado = (ev.clipboardData?.getData('text') ?? '').replace(/\D/g, '');
    const inicio = el.selectionStart ?? el.value.length;
    const fin = el.selectionEnd ?? inicio;
    const nuevo = this.recortar(el.value.slice(0, inicio) + pegado + el.value.slice(fin));
    el.value = nuevo;
    this.handleInput(nuevo);
  }

  private recortar(v: string): string {
    const max = this.maxlength();
    return max ? v.slice(0, max) : v;
  }
}

@Component({
  selector: 'sci-select',
  standalone: true,
  // Fase 8.2: sin este provider, formControlName en <sci-select> no tenía value accessor → Angular lanzaba
  // "Cannot read properties of null (reading 'writeValue')" al crear la pantalla, el ciclo de detección de cambios
  // (zoneless) se cortaba y la lista no se pintaba hasta otro evento. Además el valor elegido nunca llegaba al formulario.
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SciSelect), multi: true },
  ],
  template: `
    <label class="fld" [class.has-error]="error()" [class.has-label]="!!label()">
      @if (label(); as l) {
        <span class="fld-label">{{ l }}</span>
      }
      <select
        [id]="inputId"
        [value]="value ?? ''"
        [disabled]="disabled"
        [attr.aria-invalid]="error() ? 'true' : null"
        (change)="handleInput($any($event.target).value)"
      >
        @if (placeholder()) {
          <option value="" disabled selected>{{ placeholder() }}</option>
        }
        @for (opt of options(); track opt.value) {
          <!-- [selected]: el value del <select> se asigna antes de crear las opciones; sin esto se veía la primera. -->
          <option [value]="opt.value" [selected]="opt.value === (value ?? '')">{{ opt.label }}</option>
        }
      </select>
      @if (helper() && !error()) {
        <span class="fld-helper">{{ helper() }}</span>
      }
      @if (error(); as e) {
        <span class="fld-error">{{ e }}</span>
      }
    </label>
  `,
  styles: [FIELD_STYLES],
})
export class SciSelect extends FieldBase<string> {
  readonly options = input<{ value: string; label: string }[]>([]);
}
