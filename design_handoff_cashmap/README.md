# Handoff: CashMap — Personal/Family Finance PWA

## Overview
CashMap is a multi-user personal finance PWA (mobile-first, installable, offline-capable with background sync). This package covers five core screens: Inicio (dashboard), modal de nueva transacción, panel de Deudas, panel Admin (recurrentes), and vista de menú personalizado compartido. All UI copy is in Spanish.

## About the Design Files
The bundled file (`CashMap.dc.html`) is a **design reference built in HTML** — an interactive click-through prototype showing intended layout, states, and behavior. It is not production code. The task is to **recreate this design in the target codebase's existing environment** (React Native, React web, Flutter, Swift, etc.), using that codebase's established component patterns, state management, and data layer — or, if no environment exists yet, choose the most appropriate stack (recommended: React + a lightweight state manager, given the multi-view/tab structure) and implement from scratch there.

To view the reference: open `CashMap.dc.html` directly in a browser.

## Fidelity
**High-fidelity.** Colors, spacing, typography, and component layout are final-intent. Treat hex values and spacing below as the source of truth. Icons in the prototype are emoji (used as category identifiers, matching the app's own category-emoji convention) — no icon-font/SVG icon set is implied elsewhere.

## Global Layout & Navigation
- App shell: single-page, tab-based navigation with 4 sections: **Inicio, Deudas, Menús, Admin** (Admin only visible to `admin` role).
- **Mobile (<860px)**: bottom tab bar, fixed FAB (+) button above it for "Nueva transacción" (hidden for `viewer` role).
- **Desktop (≥860px)**: left sidebar nav (220px wide) replaces bottom bar; main content column caps at 640px, centered.
- Top bar (56–60px): app wordmark + accent dot (left), sync status badge, role switcher, theme toggle, user avatar (right).
- Content area scrolls vertically; top bar and nav are fixed.

## Design Tokens

### Colors — Light theme
- bg: `#f6f7f6`
- surface: `#ffffff`
- surfaceAlt: `#eef1ee`
- text: `#151b17`
- textMuted: `#68716c`
- border: `#e2e6e1`
- accent (brand/positive): `#2f6f4f`
- accentText (text on accent): `#ffffff`
- danger (negative/expense): `#c23b3b`

### Colors — Dark theme
- bg: `#0e1310`
- surface: `#161d19`
- surfaceAlt: `#1d2521`
- text: `#eef2ef`
- textMuted: `#8a9490`
- border: `#2a332e`
- accent: `#4fae7f`
- accentText: `#0e1310`
- danger: `#e97b7b`

Theme is a global toggle (☀️/🌙 button in top bar), swaps all tokens above app-wide.

### Category colors (fixed per category, same in both themes)
Gasto: Renta `#5b6bd6`, Mercado `#1f9e8a`, Deuda `#d1495b`, Transporte `#3b9bd1`, Comida `#e0762e`, Ocio `#c2559e`, Leche `#d9a62e`, Salud `#2fa39e`.
Ingreso: Salario `#2f6f4f`, Zelle `#7a5fc9`, Extra `#3b9bd1`.
Each category = emoji + color. Category chips/swatches use the solid color only as a small icon-circle background (16–20px) or bar-chart fill — never as text-on-tint — to keep contrast solid across many categories. Labels stay in neutral `text`/`textMuted`.

### Typography
- Font: `system-ui, -apple-system, "Segoe UI", sans-serif` throughout (no custom webfont).
- Sizes used: 10.5–11px (micro labels), 12–12.5px (meta/secondary), 13–14px (body/list), 15–16px (headings/section titles), 19–22px (balance figures, bold 700).
- Money values: `font-variant-numeric: tabular-nums`, weight 600–700, colored green (accent) for positive/income, red (danger) for negative/expense.

### Spacing & shape
- Card radius: 16px (major cards), 12px (list rows/compact cards), 20px (modal sheet top corners), full pill (999px) for chips/badges.
- Card padding: 16–20px.
- Borders: 1px solid `border` token on all card/list dividers.
- Gaps: 8–12px between related controls, 16–22px between stacked sections.

## Screens

### 1. Inicio (Dashboard)
- **Balance card**: month label ("Septiembre 2026"), 3 stats side by side — Ingresos (accent), Gastos (danger), Balance (text) — bold 19px tabular numbers.
- **Category donut + legend**: CSS conic-gradient donut (118px, 14px ring via inset white/surface circle) built from all-time gasto totals per category; center shows total gasto. Legend: color swatch + emoji + name + percentage, sorted descending by spend.
- **Monthly trend**: grouped bar chart, one pair of bars (income=accent, expense=danger) per month, 16px wide bars, height scaled to max value (70px cap), month label below.
- **Filters**: segmented pill row (Todos / Ingresos / Gastos) + horizontally scrollable category chips (only categories present in data), single-select, tap again to clear.
- **Transaction list**: grouped by month (newest first), month header, then rows: 36px rounded-square emoji icon (category color at ~15% opacity bg), description + "Categoría · fecha" meta (+ "↻ recurrente" suffix when applicable), amount right-aligned colored by sign.

### 2. Modal — Nueva transacción
- Bottom sheet (mobile) / centered sheet (desktop), rounded top corners 20px, max-width 480px, backdrop `rgba(0,0,0,.45)`.
- Fields in order: **Tipo** (segmented Gasto/Ingreso, resets category selection on change) → **Categoría** (chip grid, filtered by selected type) → **Monto** (numeric input) → **Fecha** (date input) → **Descripción** (text) → **Nota** (optional text) → **Recurrente** (toggle switch) → when on, **Frecuencia** (Semanal/Mensual pill choice).
- Primary CTA "Guardar transacción" full-width, accent-filled, 14px radius, bottom of sheet.
- Submission prepends the new transaction to the dashboard list and closes the modal.

### 3. Panel de Deudas
- Summary card: "Total pendiente por cobrar", bold total.
- One card per person: initials avatar (color-tinted circle), name, status line ("Pendiente · N% pagado" or "Pagado por completo"), pending/total amounts right-aligned, progress bar (color = person's assigned color, width = paid%).
- Quick abono: numeric input + "Registrar abono" button inline (hidden for `viewer` role) — submitting adds to paid total (capped at total owed) and appends a payment record.
- "Ver historial de abonos" toggle expands a list of past payments (date + amount).

### 4. Panel Admin (recurrentes) — plus other admin sections
Admin tab contains 5 stacked sections:
1. **Usuarios**: avatar, name, email, role badge (Admin/Editor/Viewer, tinted pill).
2. **Categorías**: chip cloud of all categories (color swatch + emoji + name) + "+ Nueva" action.
3. **Presupuestos**: category + spent/limit figures + progress bar (turns danger-colored if overspent).
4. **Plantillas recurrentes**: row per template — icon, description, "Frecuencia · próx. fecha", signed amount, and 3 actions: **Pausar/Reanudar** (toggles active state, dims row to 55% opacity when paused), **✎ Editar** (placeholder), **🗑 Eliminar** (removes row).
5. **Permisos de menús compartidos**: read-only list of shared menus with each member's role.

### 5. Vista de menú personalizado compartido
- Reached by tapping a menu card in the **Menús** tab (grid of folder-style cards: icon+color circle, name, currency, Compartido/Privado badge).
- Detail view: back link, header card (icon, name, currency, shared/private badge), row of member chips (avatar initials + name + role), "+ Nueva transacción" CTA (hidden for `viewer`), and a transaction list scoped to that menu's own currency/context.

## Interactions & Behavior
- **Tab switching**: instant, no transition — state-driven view swap.
- **Role switcher** (A/E/V pills in top bar, demo-only control representing what would normally come from auth): switching to non-admin auto-redirects away from the Admin tab; `viewer` hides all mutating controls (FAB, abono input, "+ Nueva transacción", any edit actions) app-wide — this is the pattern to reproduce for real role-based permissioning.
- **Sync badge**: 3 states — ok (accent dot, "Sincronizado"), syncing (amber dot, "Sincronizando…"), error (danger dot, "Error de sync"). In the prototype it auto-cycles ok→syncing→ok every ~14s to demonstrate the pattern; in production drive it from actual network/sync state.
- **Theme toggle**: swaps the full token set instantly, persists per session (add persistent storage in production).
- **Category dependency**: transaction category options always filter to the selected type (gasto vs ingreso).

## State Management
Minimum state needed per view:
- `theme`: 'light' | 'dark'
- `role`: 'admin' | 'editor' | 'viewer' (from auth in production)
- `activeTab`: 'inicio' | 'deudas' | 'menus' | 'admin'
- `transactions[]`: {id, date, desc, amount (signed), type, category, recurring}
- `debts[]`: {id, name, color, total, paid, payments[]}
- `recurringTemplates[]`: {id, desc, amount, type, freq, nextDate, active}
- `menus[]`: {id, name, icon, color, currency, shared, members[], transactions[]}
- Transaction modal form state: type, category, amount, date, desc, note, recurring, freq
- Derived/computed (recompute, don't store): filtered transaction list, month groupings, category totals for donut, monthly trend aggregates, budget spent/limit percentages.

## Assets
No external assets — all category/nav icons are emoji. No custom fonts. No images.

## Files
- `CashMap.dc.html` — full interactive prototype (all 5 screens + shared shell, theme toggle, role switcher).
