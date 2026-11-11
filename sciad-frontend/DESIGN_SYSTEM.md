# DESIGN_SYSTEM.md — SCIAD

> Sistema de diseño propio para el frontend de SCIAD (Sistema de Control Integral de
> Identidad y Acceso Digital). Producto SaaS de seguridad y control de acceso físico.
> Inspiración de referencia: Okta, Auth0, Vercel Dashboard, Linear (claridad de datos,
> jerarquía visual, feedback inmediato).

---

## 1. Design Read

Reading this as: **a B2B security/access-control dashboard for technical and non-technical
operators (admin, guard, management)**, with a **calm, trustworthy, data-dense language**,
leaning toward **custom SCSS design tokens + a restrained motion layer**.

Dials: `DESIGN_VARIANCE: 3` (predictable, grid-based, trust-first) · `MOTION_INTENSITY: 4`
(fluid CSS transitions, skeletons, no cinematic motion) · `VISUAL_DENSITY: 5` (daily app,
legible tables).

## 2. Color (paleta semántica)

Base neutra **slate** (fría, confiable). Un único color de marca (azul índigo) separado de
los colores semánticos de estado para no confundir "marca" con "autorizado/denegado".

| Token | Hex (light) | Uso |
|---|---|---|
| `--sciad-brand` | `#3b5bdb` | Acción primaria, marca, links |
| `--sciad-brand-strong` | `#2f4ac0` | Hover de primario |
| `--sciad-brand-soft` | `#e7ecfd` | Fondo de acentos suaves |
| `--sciad-success` | `#157f43` | Acceso **autorizado** (verde) |
| `--sciad-success-soft` | `#e3f5ea` | Fondo badge autorizado |
| `--sciad-danger` | `#c62828` | Acceso **denegado / alerta** (rojo) |
| `--sciad-danger-soft` | `#fbe9e9` | Fondo badge denegado |
| `--sciad-warning` | `#b26a00` | **Pendiente de revisión** (ámbar) |
| `--sciad-warning-soft` | `#fdf2e0` | Fondo badge pendiente |
| `--sciad-info` | `#0b6bcb` | Información / fuera de horario |

Escala neutra (slate): `--gray-25 #fbfcfe` ... `--gray-900 #0f172a`. Superficies:
`--surface #ffffff`, `--surface-muted #f4f6fb`, `--surface-sunken #eef1f7`,
`--border #e3e8f0`, `--border-strong #cbd5e1`. Texto: `--text #0f172a`,
`--text-muted #5b6675`, `--text-subtle #8a93a3`.

Contraste: todos los pares texto/fondo cumplen WCAG AA (≥ 4.5:1 cuerpo, ≥ 3:1 texto grande).

Dark mode (opcional, bonus): tokens `--surface`/`--text`/`--border` se invierten dentro de
`[data-theme="dark"]`. Los colores semánticos se mantienen (no se desaturan).

## 3. Tipografía

- **Títulos:** `Inter Tight` (o `Inter` como fallback), pesos 600/700, `letter-spacing: -0.01em`.
- **Cuerpo / UI:** `Inter`, peso 400/500.
- **Datos / tokens / horas:** `JetBrains Mono` (hashes, DPI, timestamps) para alineación y
  legibilidad de dígitos.
- Escala: `display 30px`, `h1 24px`, `h2 20px`, `h3 16px`, `body 14px`, `sm 13px`, `xs 12px`.
- Stack final (con fallback de sistema para entorno offline/Docker):
  `"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.

## 4. Espaciado, radios y sombras

- **Espaciado base 4px:** escala `4 / 8 / 12 / 16 / 24 / 32 / 48 / 64`.
- **Radios (un solo sistema):** `--radius-sm 8px` (inputs, botones, badges),
  `--radius-md 12px` (tarjetas, tablas), `--radius-lg 16px` (modales, drawers).
- **Sombras (tintadas al hue base, nunca negro puro):**
  `--shadow-sm 0 1px 2px rgb(15 23 42 / .06)`,
  `--shadow-md 0 4px 12px rgb(15 23 42 / .08)`,
  `--shadow-lg 0 12px 32px rgb(15 23 42 / .12)`.

## 5. Componentes base reutilizables

Implementados en `src/app/shared/ui/` como standalone components/directives:

- **Button** (`sci-btn`): variantes `primary | secondary | ghost | danger`; tamaños
  `sm | md`; estados hover/active (`translateY(1px)`), focus-ring visible, loading spinner.
- **Input / Select / Textarea** (`sci-field`): label arriba, helper opcional, error abajo,
  focus-ring de marca, contraste AA.
- **Card** (`sci-card`): contenedor con borde + radius-md + shadow-sm.
- **KpiCard**: título, valor grande (mono), delta/tendencia, icono, color semántico.
- **Badge / StatusBadge**: estados `activo | inactivo | autorizado | denegado | pendiente |
  revocado | vencido` con color semántico + soft bg.
- **DataTable** (`sci-table`): cabecera sticky, filas con `divide-y`, paginación, orden,
  empty-state integrado, skeletons en carga.
- **Modal** (`sci-modal`): overlay + panel radius-lg + focus trap + cierre con Esc.
- **Toast** (`sci-toast`): notificaciones transitorias (éxito/error/info), apilan arriba-derecha.
- **Spinner / Skeleton**: spinner de anillo para acciones; skeletons a medida del layout en carga.
- **EmptyState**: ilustración/icono + título + acción sugerida (no solo "no hay datos").

## 6. Estados (obligatorios en toda pantalla)

- **Loading:** skeleton shimmer a medida del layout (no solo spinner).
- **Empty:** `EmptyState` con copy útil y CTA.
- **Error:** banner inline + reintentar.

## 7. Motion

Transiciones `transform/opacity` ~200ms `cubic-bezier(.16,1,.3,1)`. Respeta
`prefers-reduced-motion` (colapsa a instantáneo).

## 8. Iconografía

Familias vía `<svg>` inline del set **Lucide** (ángulos 1.75px, 20px). Una familia en todo el
proyecto. (Contexto: el proyecto ya usa Lucide en otros artefactos; se mantiene para coherencia.)

## 9. Responsive

Breakpoints: `sm 640 / md 768 / lg 1024 / xl 1280`. Layout admin: sidebar colapsable a drawer
en móvil. Vista **Personal de Seguridad: mobile-first** (opera 100% desde el teléfono).
Verificado en 3 anchos: móvil (390px), tablet (820px), desktop (1440px).

## 10. Accesibilidad

WCAG AA: contraste, navegación por teclado (focus visible), `aria-*` en modales/toasts/tablas,
textos alternativos, `prefers-reduced-motion`.
