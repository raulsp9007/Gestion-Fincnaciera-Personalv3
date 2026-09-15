# Recordatorio de recurrentes próximos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar un banner agrupado en Inicio con las transacciones recurrentes que van a repetirse en los próximos 3 días, con opción de descartar y de activar notificaciones locales del navegador.

**Architecture:** Nuevo helper `getUpcomingReminders()` en `js/db.js` recorre `d.inicio[]` + `d.customMenus[].data[]`, filtra por ventana de fecha (`recurringNext` entre hoy+1 y hoy+3) y excluye claves ya descartadas. `js/render/inicio.js` renderiza un banner (variante B: agrupado, un solo `✕`) dentro de `renderInicio()`, y dispara `Notification` locales (no push) para claves nuevas cuando el usuario dio permiso. Dedupe vía dos sets en `localStorage` (`dismissed`, `notified`), clave = `${id}:${recurringNext}`.

**Tech Stack:** Vanilla JS (sin build), `Notification` Web API, `localStorage`, mismo patrón de template literals + inline styles ya usado en el resto de la app.

**No hay framework de tests en este proyecto** — verificación manual vía consola del navegador (DevTools) y/o interacción directa con la UI cargada en `index.html`.

---

### Task 1: Helpers de almacenamiento (dismissed/notified) en `js/db.js`

**Files:**
- Modify: `D:\DOCUMENTOS\GestionFinancieraV2\js\db.js` (insertar después de `processRecurringTxs`, que termina en la línea 590 con `}`)

- [ ] **Step 1: Localizar el punto de inserción**

Buscar el final exacto de `processRecurringTxs` en `js/db.js`:

```js
  if (changed) saveData();
  return affectedMenuIds;
}

// ── Import transactions into a specific menu ──────────────
```

Insertar el bloque de abajo INMEDIATAMENTE DESPUÉS del `}` que cierra `processRecurringTxs` (antes del comentario `// ── Import transactions...`).

- [ ] **Step 2: Insertar los helpers**

```js
// ── Recordatorios de recurrentes próximos ─────────────────
const REMINDER_WINDOW_DAYS      = 3;
const REMINDER_DISMISSED_KEY    = 'cashmap_v2_dismissed_reminders';
const REMINDER_NOTIFIED_KEY     = 'cashmap_v2_notified_reminders';

function _reminderKey(id, recurringNext) {
  return `${id}:${recurringNext}`;
}

function _readReminderStore(storageKey) {
  try { return JSON.parse(localStorage.getItem(storageKey)) ?? []; }
  catch { return []; }
}

// Quita claves cuya fecha (parte después de ":") ya pasó, para que el set
// no crezca sin límite. Devuelve la lista ya podada (y la persiste).
function _pruneReminderStore(storageKey, today) {
  const kept = _readReminderStore(storageKey).filter(key => {
    const date = key.split(':')[1];
    return date && date >= today;
  });
  localStorage.setItem(storageKey, JSON.stringify(kept));
  return kept;
}

function getDismissedReminders() {
  return _pruneReminderStore(REMINDER_DISMISSED_KEY, _nowDate());
}

function dismissReminders(keys) {
  const current = _pruneReminderStore(REMINDER_DISMISSED_KEY, _nowDate());
  const merged  = [...new Set([...current, ...keys])];
  localStorage.setItem(REMINDER_DISMISSED_KEY, JSON.stringify(merged));
}

function getNotifiedReminders() {
  return _pruneReminderStore(REMINDER_NOTIFIED_KEY, _nowDate());
}

function markReminderNotified(key) {
  const current = _pruneReminderStore(REMINDER_NOTIFIED_KEY, _nowDate());
  if (!current.includes(key)) {
    current.push(key);
    localStorage.setItem(REMINDER_NOTIFIED_KEY, JSON.stringify(current));
  }
}

// Recurrentes con recurringNext dentro de (hoy, hoy+REMINDER_WINDOW_DAYS],
// excluyendo los ya descartados por el usuario. recurringNext <= hoy ya lo
// maneja processRecurringTxs() (se materializa como transacción real).
function getUpcomingReminders() {
  const d       = loadData();
  const today   = _nowDate();
  const limitD  = new Date(today + 'T12:00:00');
  limitD.setDate(limitD.getDate() + REMINDER_WINDOW_DAYS);
  const limit   = limitD.toISOString().slice(0, 10);
  const dismissed = new Set(getDismissedReminders());

  const items = [];
  const collect = (tx, menuId, menuName) => {
    if (!tx.recurring || !tx.recurringNext) return;
    if (tx.recurringNext <= today || tx.recurringNext > limit) return;
    const key = _reminderKey(tx.id, tx.recurringNext);
    if (dismissed.has(key)) return;
    items.push({
      key, id: tx.id, menuId, menuName,
      description: tx.description ?? '',
      amount: tx.amount ?? 0,
      recurringNext: tx.recurringNext
    });
  };

  d.inicio.forEach(t => collect(t, null, null));
  for (const m of d.customMenus) {
    (m.data ?? []).filter(t => !t._deleted).forEach(t => collect(t, m.id, m.name));
  }

  items.sort((a, b) => a.recurringNext.localeCompare(b.recurringNext));
  return items;
}
```

- [ ] **Step 3: Verificar sintaxis**

```bash
node --check "D:\DOCUMENTOS\GestionFinancieraV2\js\db.js"
```
Expected: sin salida (sintaxis válida).

- [ ] **Step 4: Verificación funcional rápida en Node**

Crear un archivo temporal de prueba (no se commitea, es solo para verificar antes de seguir):

```bash
cat > "D:\DOCUMENTOS\GestionFinancieraV2\_reminder_check.js" << 'EOF'
const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = v; }
};

function _reminderKey(id, recurringNext) {
  return `${id}:${recurringNext}`;
}

function _readReminderStore(storageKey) {
  try { return JSON.parse(localStorage.getItem(storageKey)) ?? []; }
  catch { return []; }
}

function _pruneReminderStore(storageKey, today) {
  const kept = _readReminderStore(storageKey).filter(key => {
    const date = key.split(':')[1];
    return date && date >= today;
  });
  localStorage.setItem(storageKey, JSON.stringify(kept));
  return kept;
}

const REMINDER_DISMISSED_KEY = 'cashmap_v2_dismissed_reminders';

function getDismissedReminders() {
  return _pruneReminderStore(REMINDER_DISMISSED_KEY, new Date().toISOString().slice(0,10));
}

function dismissReminders(keys) {
  const current = _pruneReminderStore(REMINDER_DISMISSED_KEY, new Date().toISOString().slice(0,10));
  const merged  = [...new Set([...current, ...keys])];
  localStorage.setItem(REMINDER_DISMISSED_KEY, JSON.stringify(merged));
}

const today = new Date().toISOString().slice(0, 10);
console.log('key:', _reminderKey(123, today));
dismissReminders(['123:' + today]);
console.log('dismissed:', getDismissedReminders());
EOF
node "D:\DOCUMENTOS\GestionFinancieraV2\_reminder_check.js"
rm "D:\DOCUMENTOS\GestionFinancieraV2\_reminder_check.js"
```

Expected: imprime `key: 123:<hoy>` y luego `dismissed: [ '123:<hoy>' ]` — confirma que la lógica de dedupe/pruning funciona antes de integrarla en `db.js` real. Esto es una copia standalone solo para probar el algoritmo — el código real ya insertado en `db.js` en el Step 2 es el que queda en el repo.

- [ ] **Step 5: Commit**

```bash
cd "D:\DOCUMENTOS\GestionFinancieraV2"
git add js/db.js
git commit -m "feat(recordatorios): helpers de dedupe y getUpcomingReminders en db.js"
```

---

### Task 2: CSS del banner en `css/main.css`

**Files:**
- Modify: `D:\DOCUMENTOS\GestionFinancieraV2\css\main.css` (agregar al final del archivo)

- [ ] **Step 1: Agregar los estilos**

Agregar al final de `css/main.css`:

```css
/* ── Reminder banner (recurrentes próximos) ───────────────── */
.reminder{
  display:flex;align-items:flex-start;gap:12px;
  background:linear-gradient(180deg,#f59e0b14,#f59e0b0a);
  border:1px solid #f59e0b40;border-radius:10px;padding:12px 14px;margin-bottom:14px;
}
.reminder .icon{font-size:1.15rem;line-height:1;margin-top:1px;flex-shrink:0}
.reminder .body{flex:1;min-width:0}
.reminder .lead{font-size:.85rem;font-weight:600;color:var(--text);margin-bottom:4px}
.reminder ul.items{list-style:none;margin:2px 0 0;padding:0;display:flex;flex-direction:column;gap:3px}
.reminder ul.items li{font-size:.78rem;color:var(--text2);display:flex;justify-content:space-between;gap:10px}
.reminder ul.items li b{color:var(--text);font-weight:600}
.reminder ul.items li .when{color:var(--yellow);font-weight:600;flex-shrink:0;text-align:right}
.reminder .actions{display:flex;gap:6px;flex-shrink:0;margin-top:1px}
.reminder .btn-ghost-sm{
  background:transparent;border:1px solid var(--border);color:var(--text2);
  font-size:.72rem;padding:5px 10px;border-radius:7px;cursor:pointer;transition:.15s;
  font-family:inherit;white-space:nowrap;
}
.reminder .btn-ghost-sm:hover{background:var(--bg3);color:var(--text)}
.reminder .btn-x{
  background:transparent;border:none;color:var(--text2);font-size:1rem;line-height:1;
  cursor:pointer;padding:2px 4px;border-radius:6px;transition:.15s;
}
.reminder .btn-x:hover{background:var(--bg3);color:var(--text)}
```

- [ ] **Step 2: Commit**

```bash
cd "D:\DOCUMENTOS\GestionFinancieraV2"
git add css/main.css
git commit -m "feat(recordatorios): estilos del banner de recurrentes proximos"
```

---

### Task 3: Render del banner + notificación local en `js/render/inicio.js`

**Files:**
- Modify: `D:\DOCUMENTOS\GestionFinancieraV2\js\render\inicio.js`

- [ ] **Step 1: Insertar las funciones del banner**

Buscar esta función existente (línea 24-28):

```js
function _monthLabel(ym) {
  const [y, m] = ym.split('-');
  return new Date(+y, +m - 1, 1)
    .toLocaleDateString('es-ES', { month: 'short', year: 'numeric' });
}
```

Insertar el bloque de abajo INMEDIATAMENTE DESPUÉS del `}` que cierra `_monthLabel`:

```js

// ── Banner de recordatorios (recurrentes próximos) ────────
function _reminderWhen(dateStr) {
  const today = _nowDate();
  const diffDays = Math.round(
    (new Date(dateStr + 'T12:00:00') - new Date(today + 'T12:00:00')) / 86400000
  );
  if (diffDays <= 1) return 'mañana';
  return `en ${diffDays} días`;
}

function _reminderAmount(it) {
  if (it.menuId == null) return fmtMoney(it.amount);
  const menu = getCustomMenu(it.menuId);
  return _fmtCurr(it.amount, menu?.currency ?? '€');
}

function _maybeNotifyReminders(items) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const notified = new Set(getNotifiedReminders());
  items.filter(it => !notified.has(it.key)).forEach(it => {
    try {
      new Notification('CashMap — recordatorio', {
        body: `${it.description || 'Recurrente'}: ${_reminderWhen(it.recurringNext)}`,
        icon: './icon.svg'
      });
    } catch { /* navegador puede bloquear silenciosamente, no es fatal */ }
    markReminderNotified(it.key);
  });
}

function _buildReminderBanner() {
  const items = getUpcomingReminders();
  if (!items.length) return '';

  _maybeNotifyReminders(items);

  const showNotifBtn = typeof Notification !== 'undefined' && Notification.permission === 'default';
  const lead = items.length === 1
    ? '1 recurrente se repite pronto'
    : `${items.length} recurrentes se repiten pronto`;

  return `<div class="reminder">
    <span class="icon">⏰</span>
    <div class="body">
      <div class="lead">${lead}</div>
      <ul class="items">
        ${items.map(it => {
          const origin = it.menuName ? ` <span style="color:var(--text2);font-weight:400">(${esc(it.menuName)})</span>` : '';
          return `<li><b>${esc(it.description || 'Recurrente')}</b>${origin}<span class="when">${_reminderWhen(it.recurringNext)} · ${_reminderAmount(it)}</span></li>`;
        }).join('')}
      </ul>
    </div>
    <div class="actions">
      ${showNotifBtn ? `<button class="btn-ghost-sm" onclick="requestReminderNotifications()">🔔 Activar notificaciones</button>` : ''}
      <button class="btn-x" title="Descartar" onclick="dismissReminderBanner()">✕</button>
    </div>
  </div>`;
}

function dismissReminderBanner() {
  const items = getUpcomingReminders();
  dismissReminders(items.map(it => it.key));
  renderInicio();
}

function requestReminderNotifications() {
  Notification.requestPermission().then(() => renderInicio());
}
```

- [ ] **Step 2: Conectar el banner al render principal**

Buscar en `renderInicio()` (línea ~52-56):

```js
  el.innerHTML = `
    <div class="overview-topbar">
      <span class="section-label">📊 VISTA GENERAL</span>
      <span class="overview-updated">Actualizado: ${updStr}</span>
    </div>
    ${_buildMonthTabs()}
```

Reemplazar por:

```js
  el.innerHTML = `
    <div class="overview-topbar">
      <span class="section-label">📊 VISTA GENERAL</span>
      <span class="overview-updated">Actualizado: ${updStr}</span>
    </div>
    ${_buildReminderBanner()}
    ${_buildMonthTabs()}
```

- [ ] **Step 3: Verificar sintaxis**

```bash
node --check "D:\DOCUMENTOS\GestionFinancieraV2\js\render\inicio.js"
```
Expected: sin salida.

- [ ] **Step 4: Commit**

```bash
cd "D:\DOCUMENTOS\GestionFinancieraV2"
git add js/render/inicio.js
git commit -m "feat(recordatorios): banner de recurrentes proximos + notificacion local"
```

---

### Task 4: Verificación manual en el navegador

**Files:** ninguno — solo verificación.

- [ ] **Step 1: Bump de versión**

```bash
grep -n "CACHE_NAME = " "D:\DOCUMENTOS\GestionFinancieraV2\cashmap_sw.js"
grep -n "APP_VERSION" "D:\DOCUMENTOS\GestionFinancieraV2\js\config.js"
```

Incrementar ambos en 1 respecto al valor mostrado (ej. `v2-88` → `v2-89` en ambos archivos).

- [ ] **Step 2: Commit del bump**

```bash
cd "D:\DOCUMENTOS\GestionFinancieraV2"
git add cashmap_sw.js js/config.js
git commit -m "chore(sw): bump cache tras agregar banner de recordatorios"
```

- [ ] **Step 3: Preparar un recurrente de prueba en 2 días**

Abrir la app, forzar recarga (Ctrl+Shift+R), ir a Inicio, crear una transacción con recurrencia (ej. "mensual"), con fecha = hoy. Luego en DevTools console, forzar que `recurringNext` caiga dentro de la ventana de 3 días:

```js
const d = loadData();
d.inicio[d.inicio.length - 1].recurringNext = new Date(Date.now() + 2*86400000).toISOString().slice(0,10);
saveData();
renderInicio();
```

Expected: aparece el banner "1 recurrente se repite pronto" con la descripción, "en 2 días" y el monto correcto.

- [ ] **Step 4: Probar con un recurrente en un menú personalizado**

Repetir el mismo ajuste de `recurringNext` sobre un ítem recurrente dentro de `d.customMenus[i].data[]` (menú cualquiera, ej. Vehículo). Recargar Inicio.

Expected: el banner ahora dice "2 recurrentes se repiten pronto", y el ítem del menú muestra el nombre del menú entre paréntesis y su moneda propia (no EUR).

- [ ] **Step 5: Probar descarte**

Click en "✕" del banner.

Expected: banner desaparece. Recargar la página completa (F5) → banner sigue sin aparecer (las claves quedaron en `localStorage['cashmap_v2_dismissed_reminders']`, verificar con `localStorage.getItem('cashmap_v2_dismissed_reminders')` en consola).

- [ ] **Step 6: Probar notificaciones locales**

Volver a poner un recurrente dentro de ventana (repetir Step 3 con otra transacción, o borrar la clave de dismissed vía `localStorage.removeItem('cashmap_v2_dismissed_reminders')` y recargar). Click en "🔔 Activar notificaciones", conceder permiso en el prompt del navegador.

Expected: aparece una notificación del sistema/navegador con el texto del recordatorio. El botón desaparece del banner tras conceder permiso. Recargar la página → NO debe repetirse la misma notificación (ya está en `cashmap_v2_notified_reminders`).

- [ ] **Step 7: Confirmar sin errores en consola**

Revisar DevTools console durante todo el flujo — no debe haber ningún error rojo.
