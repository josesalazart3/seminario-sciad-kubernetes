import { Component, input } from '@angular/core';
import { Icon, IconName } from './icon.component';

export type KpiTone = 'brand' | 'success' | 'danger' | 'warning' | 'info';

@Component({
  selector: 'sci-kpi-card',
  standalone: true,
  imports: [Icon],
  template: `
    <div class="kpi" [class]="'tone-' + tone()">
      <div class="kpi-top">
        <span class="kpi-title">{{ title() }}</span>
        <span class="kpi-icon"><sci-icon [name]="icon()" [size]="18" /></span>
      </div>
      @if (loading()) {
        <div class="skeleton-line"></div>
      } @else {
        <div class="kpi-value">{{ value() }}</div>
      }
      <div class="kpi-foot">
        @if (sub(); as s) {
          <span class="kpi-sub">{{ s }}</span>
        }
        @if (delta(); as d) {
          <span class="kpi-delta" [class.down]="d.startsWith('-')">
            <sci-icon [name]="d.startsWith('-') ? 'arrowDownRight' : 'arrowUpRight'" [size]="14" />
            {{ d }}
          </span>
        }
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .kpi {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-sm);
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .kpi-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .kpi-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--text-muted);
      }
      .kpi-icon {
        width: 30px;
        height: 30px;
        border-radius: 8px;
        display: grid;
        place-items: center;
        background: var(--surface-sunken);
        color: var(--text-muted);
      }
      .tone-brand .kpi-icon { background: var(--sciad-brand-soft); color: var(--sciad-brand); }
      .tone-success .kpi-icon { background: var(--sciad-success-soft); color: var(--sciad-success); }
      .tone-danger .kpi-icon { background: var(--sciad-danger-soft); color: var(--sciad-danger); }
      .tone-warning .kpi-icon { background: var(--sciad-warning-soft); color: var(--sciad-warning); }
      .tone-info .kpi-icon { background: var(--sciad-info-soft); color: var(--sciad-info); }

      .kpi-value {
        font-family: var(--font-mono);
        font-size: 30px;
        font-weight: 700;
        line-height: 1;
        color: var(--text);
        letter-spacing: -0.01em;
      }
      .kpi-foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        min-height: 18px;
      }
      .kpi-sub { font-size: 12px; color: var(--text-subtle); }
      .kpi-delta {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        font-size: 12px;
        font-weight: 600;
        color: var(--sciad-success);
      }
      .kpi-delta.down { color: var(--sciad-danger); }
      .skeleton-line {
        height: 34px;
        border-radius: 6px;
        background: linear-gradient(90deg, var(--surface-sunken) 25%, var(--surface-muted) 50%, var(--surface-sunken) 75%);
        background-size: 200% 100%;
        animation: shimmer 1.2s infinite;
      }
      @keyframes shimmer {
        to { background-position: -200% 0; }
      }
    `,
  ],
})
export class KpiCard {
  readonly title = input<string>('');
  readonly value = input<string | number>('');
  readonly icon = input<IconName>('chart');
  readonly tone = input<KpiTone>('brand');
  readonly sub = input<string | null>(null);
  readonly delta = input<string | null>(null);
  readonly loading = input(false);
}
