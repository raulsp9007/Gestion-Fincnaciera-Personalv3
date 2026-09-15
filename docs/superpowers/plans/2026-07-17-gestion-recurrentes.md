# Gestión de recurrentes preestablecidos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Panel central en Admin ("🔁 Recurrentes") para ver, pausar/reanudar, editar, eliminar y ver historial de cualquier plantilla recurrente (Inicio o menús), más un widget resumen en Inicio y un atajo para crear una plantilla desde cero.

**Architecture:** Extiende el mecanismo actual (campos `recurring`/`recurringNext` en cualquier transacción) con dos campos nuevos opcionales (`recurringPaused`, `_pausedNext`) y un campo de trazabilidad (`templateId` en las ocurrencias generadas). Reutiliza `openEditTxModal`/`openEditMenuTxModal` (ya existentes) para editar, y `deleteTx`/`deleteMenuTx`+`pushDeleteToGas` (ya arreglado esta sesión) para eliminar. Nueva UI: una pestaña más en el modal de Admin ya existente, siguiendo el mismo patrón que "📋 Menús".

**Tech Stack:** Vanilla JS (sin build), template literals, mismo patrón de modal/tabs ya usado en Admin.

**No hay framework de tests en este proyecto** — verificación manual vía consola del navegador y/o interacción directa con la UI.

---

### Task 1: Capa de datos en `js/db.js`

**Files:**
- Modify: `D:\DOCUMENTOS\GestionFinancieraV2\js\db.js`

- [ ] **Step 1: Agregar `templateId` a las ocurrencias generadas por `processRecurringTxs`**

Buscar en `processRecurringTxs()`:

```js
  // Inicio txs
  d.inicio.filter(t => t.recurring && t.recurringNext).forEach(t => {
    while (t.recurringNext && t.recurringNext <= today) {
      const due = t.recurringNext;
      const occId = _recurringOccurrenceId(t.id, due);
      if (!d.inicio.some(x => x.id === occId)) {
        const { recurringNext: _rn, ...base } = t;
        d.inicio.push({ ...base, id: occId, date: due, updatedAt: now });
        changed = true;
      }
      t.recurringNext = nextOccurrence(due, t.recurring);
    }
  });
```

Reemplazar la línea `d.inicio.push({ ...base, id: occId, date: due, updatedAt: now });` por:

```js
        d.inicio.push({ ...base, id: occId, date: due, updatedAt: now, templateId: t.id });
```

Buscar el bloque equivalente de menús:

```js
    m.data.filter(t => t.recurring && t.recurringNext).forEach(t => {
      while (t.recurringNext && t.recurringNext <= today) {
        const due = t.recurringNext;
        const occId = _recurringOccurrenceId(`${m.id}_${t.id}`, due);
        if (!m.data.some(x => x.id === occId)) {
          const { recurringNext: _rn, ...base } = t;
          m.data.push({ ...base, id: occId, date: due, updatedAt: now });
          changed = true;
          menuChanged = true;
        }
        t.recurringNext = nextOccurrence(due, t.recurring);
      }
    });
```

Reemplazar la línea `m.data.push({ ...base, id: occId, date: due, updatedAt: now });` por:

```js
          m.data.push({ ...base, id: occId, date: due, updatedAt: now, templateId: t.id });
```

- [ ] **Step 2: Agregar helpers de gestión de plantillas**

Insertar después del cierre de `processRecurringTxs()` (después del `}` que cierra la función, antes del bloque de helpers de recordatorios `// ── Recordatorios de recurrentes próximos ──`):

```js
// ── Gestión de plantillas recurrentes ─────────────────────
function getAllRecurringTemplates() {
  const d = loadData();
  const items = [];

  d.inicio.filter(t => t.recurring).forEach(t => {
    items.push({ ...t, menuId: null, menuName: 'Inicio' });
  });

  d.customMenus.forEach(m => {
    (m.data ?? []).filter(t => !t._deleted && t.recurring).forEach(t => {
      items.push({ ...t, menuId: m.id, menuName: m.name });
    });
  });

  items.sort((a, b) => (a.recurringNext ?? '9999-99-99').localeCompare(b.recurringNext ?? '9999-99-99'));
  return items;
}

// Pausa una plantilla: guarda su recurringNext en _pausedNext y lo limpia,
// para que processRecurringTxs() la ignore sin perder el período.
function pauseRecurringTemplate(menuId, id) {
  const list = menuId == null ? getTxs() : getMenuTxs(menuId);
  const tx = list.find(t => t.id === id);
  if (!tx || !tx.recurring || tx.recurringPaused) return;
  const fields = { recurringPaused: true, _pausedNext: tx.recurringNext, recurringNext: undefined };
  if (menuId == null) updateTx(id, fields);
  else updateMenuTx(menuId, id, fields);
}

// Reanuda una plantilla pausada. Si la fecha guardada ya quedó en el pasado,
// recalcula desde hoy en vez de disparar un backlog de ocurrencias atrasadas.
function resumeRecurringTemplate(menuId, id) {
  const list = menuId == null ? getTxs() : getMenuTxs(menuId);
  const tx = list.find(t => t.id === id);
  if (!tx || !tx.recurringPaused) return;
  const today = _nowDate();
  const next = (tx._pausedNext && tx._pausedNext > today) ? tx._pausedNext : nextOccurrence(today, tx.recurring);
  const fields = { recurringPaused: false, _pausedNext: undefined, recurringNext: next };
  if (menuId == null) updateTx(id, fields);
  else updateMenuTx(menuId, id, fields);
}

// Ocurrencias ya generadas por una plantilla, más recientes primero.
function getRecurringOccurrences(menuId, templateId) {
  const list = menuId == null ? loadData().inicio : (getCustomMenu(menuId)?.data ?? []);
  return list.filter(t => t.templateId === templateId && !t._deleted)
    .sort((a, b) => b.date.localeCompare(a.date));
}
```

- [ ] **Step 3: Verificar sintaxis**

```bash
node --check "D:\DOCUMENTOS\GestionFinancieraV2\js\db.js"
```
Expected: sin salida.

- [ ] **Step 4: Verificación funcional rápida en Node**

```bash
cat > "D:\DOCUMENTOS\GestionFinancieraV2\_recurring_check.js" << 'EOF'
function _nowDate() { return new Date().toISOString().slice(0, 10); }
function nextOccurrence(dateStr, period) {
  const d = new Date(dateStr + 'T12:00:00');
  if (period === 'semanal') d.setDate(d.getDate() + 7);
  else if (period === 'mensual') d.setMonth(d.getMonth() + 1);
  else if (period === 'anual') d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

let store = [{ id: 1, recurring: 'mensual', recurringNext: '2026-08-01', description: 'Test' }];
function getTxs() { return store; }
function updateTx(id, fields) {
  const idx = store.findIndex(t => t.id === id);
  store[idx] = { ...store[idx], ...fields };
}

function pauseRecurringTemplate(menuId, id) {
  const tx = store.find(t => t.id === id);
  if (!tx || !tx.recurring || tx.recurringPaused) return;
  updateTx(id, { recurringPaused: true, _pausedNext: tx.recurringNext, recurringNext: undefined });
}
function resumeRecurringTemplate(menuId, id) {
  const tx = store.find(t => t.id === id);
  if (!tx || !tx.recurringPaused) return;
  const today = _nowDate();
  const next = (tx._pausedNext && tx._pausedNext > today) ? tx._pausedNext : nextOccurrence(today, tx.recurring);
  updateTx(id, { recurringPaused: false, _pausedNext: undefined, recurringNext: next });
}

pauseRecurringTemplate(null, 1);
console.log('tras pausar:', store[0]);
resumeRecurringTemplate(null, 1);
console.log('tras reanudar (fecha futura, se restaura igual):', store[0]);
EOF
node "D:\DOCUMENTOS\GestionFinancieraV2\_recurring_check.js"
rm "D:\DOCUMENTOS\GestionFinancieraV2\_recurring_check.js"
```

Expected: `tras pausar` muestra `recurringPaused: true, recurringNext: undefined, _pausedNext: '2026-08-01'`. `tras reanudar` muestra `recurringPaused: false, recurringNext: '2026-08-01'` (se restauró porque la fecha guardada sigue en el futuro). Esto es una copia standalone solo para probar el algoritmo — el código real ya insertado en `db.js` en el Step 2 es el que queda en el repo.

- [ ] **Step 5: Commit**

```bash
cd "D:\DOCUMENTOS\GestionFinancieraV2"
git add js/db.js
git commit -m "feat(recurrentes): templateId + helpers de pausar/reanudar/listar plantillas"
```

---

### Task 2: HTML — pestaña Admin + modal de historial

**Files:**
- Modify: `D:\DOCUMENTOS\GestionFinancieraV2\index.html`

- [ ] **Step 1: Agregar el botón de la pestaña**

Buscar en el tab bar del Admin:

```html
      <button class="admin-tab"        onclick="switchAdminTab('menus')">📋 Menús</button>
      <button class="admin-tab"        onclick="switchAdminTab('config')">⚙️ Configuración</button>
```

Reemplazar por (agrega el nuevo botón entre Menús y Configuración):

```html
      <button class="admin-tab"        onclick="switchAdminTab('menus')">📋 Menús</button>
      <button class="admin-tab"        onclick="switchAdminTab('recurrentes')">🔁 Recurrentes</button>
      <button class="admin-tab"        onclick="switchAdminTab('config')">⚙️ Configuración</button>
```

- [ ] **Step 2: Agregar el panel de la pestaña**

Buscar:

```html
      <!-- TAB: Configuración -->
      <div id="admin-tab-config" class="admin-tab-panel" style="display:none">
```

Insertar INMEDIATAMENTE ANTES (nuevo panel completo):

```html
      <!-- TAB: Recurrentes -->
      <div id="admin-tab-recurrentes" class="admin-tab-panel" style="display:none">
        <div class="section-title" style="margin-top:0">Plantillas recurrentes</div>
        <button class="btn btn-primary btn-sm" style="margin-bottom:12px" onclick="openNewRecurringTemplateModal()">+ Nueva plantilla recurrente</button>
        <div id="admin-recurring-list"></div>
      </div>

```

- [ ] **Step 3: Agregar el modal de historial**

Buscar:

```html
  </div>
</div>

<!-- ── USER FORM MODAL (crear / editar) ──────────────── -->
```

Insertar INMEDIATAMENTE ANTES de `<!-- ── USER FORM MODAL...`:

```html
<!-- ── RECURRING HISTORY MODAL ─────────────────────────────── -->
<div class="modal-overlay" id="recurring-history-modal">
  <div class="modal" style="width:min(420px,96vw)">
    <h3>📜 Historial de ocurrencias</h3>
    <div id="recurring-history-list" style="max-height:50vh;overflow-y:auto;margin:12px 0"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeRecurringHistoryModal()">Cerrar</button>
    </div>
  </div>
</div>

```

**Atención:** el patrón `</div>\n</div>\n\n<!-- ── USER FORM MODAL` aparece una sola vez en el archivo — es el cierre del modal de Admin. Si al buscar aparece más de una coincidencia, usar el contexto completo del bloque (el `<div class="modal-actions">...Cerrar...</div>` de Admin justo antes) para confirmar el punto exacto.

- [ ] **Step 4: Verificar que el HTML quedó bien formado**

```bash
grep -c "admin-tab-recurrentes\|recurring-history-modal\|openNewRecurringTemplateModal" "D:\DOCUMENTOS\GestionFinancieraV2\index.html"
```
Expected: número mayor que 0.

- [ ] **Step 5: Commit**

```bash
cd "D:\DOCUMENTOS\GestionFinancieraV2"
git add index.html
git commit -m "feat(recurrentes): pestana Admin y modal de historial en index.html"
```

---

### Task 3: Render y acciones en `js/render/admin.js`

**Files:**
- Modify: `D:\DOCUMENTOS\GestionFinancieraV2\js\render\admin.js`

- [ ] **Step 1: Registrar la pestaña en `switchAdminTab`**

Buscar:

```js
function switchAdminTab(id) {
  document.querySelectorAll('.admin-tab-panel').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
  const panel = document.getElementById('admin-tab-' + id);
  if (panel) panel.style.display = '';
  // Activar botón correspondiente
  const bar = document.getElementById('admin-tab-bar');
  if (bar) {
    const idx = ['usuarios','categorias','autosave','datos','menus','config'].indexOf(id);
    const btns = bar.querySelectorAll('.admin-tab');
    if (btns[idx]) btns[idx].classList.add('active');
  }
}
```

Reemplazar la línea del array por (agrega `'recurrentes'` en la misma posición del botón nuevo, entre `'menus'` y `'config'`):

```js
    const idx = ['usuarios','categorias','autosave','datos','menus','recurrentes','config'].indexOf(id);
```

También agregar la llamada de render cuando se abre esa pestaña. Buscar en `openAdminPanel()`:

```js
  renderSharedDeudasAdmin();
  _renderTimezoneSection();
  _renderTimeFormatSection();
  _renderAdminMenusList();
  document.getElementById('admin-modal').classList.add('open');
  switchAdminTab('usuarios');
}
```

Reemplazar por:

```js
  renderSharedDeudasAdmin();
  _renderTimezoneSection();
  _renderTimeFormatSection();
  _renderAdminMenusList();
  renderAdminRecurring();
  document.getElementById('admin-modal').classList.add('open');
  switchAdminTab('usuarios');
}
```

- [ ] **Step 2: Agregar `renderAdminRecurring()` y las funciones de acción**

Insertar al final del archivo `js/render/admin.js`:

```js
// ── Plantillas recurrentes ─────────────────────────────────
const _RECURRING_PERIOD_LABEL = { semanal: 'Semanal', mensual: 'Mensual', anual: 'Anual' };

function renderAdminRecurring() {
  const el = document.getElementById('admin-recurring-list');
  if (!el) return;
  const items = getAllRecurringTemplates();
  if (!items.length) {
    el.innerHTML = '<div style="color:var(--text2);font-size:.78rem;margin-bottom:12px">Sin plantillas recurrentes.</div>';
    return;
  }
  el.innerHTML = items.map(t => {
    const curr    = t.menuId == null ? '€' : (getCustomMenu(t.menuId)?.currency ?? '€');
    const amtStr  = t.menuId == null ? fmtMoney(t.amount) : _fmtCurr(t.amount, curr);
    const nextStr = t.recurringPaused
      ? '<span class="badge pendiente">⏸ Pausado</span>'
      : `Próx: ${fmtDate(t.recurringNext)}`;
    const menuArg = t.menuId ?? 'null';
    return `<div class="cat-row">
      <span class="cat-row-label" style="font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.description || 'Recurrente')}</span>
      <span style="font-size:.72rem;color:var(--text2);flex-shrink:0">${esc(t.menuName)}</span>
      <span style="font-size:.72rem;flex-shrink:0">${amtStr}</span>
      <span style="font-size:.72rem;color:var(--text2);flex-shrink:0">${_RECURRING_PERIOD_LABEL[t.recurring] ?? esc(t.recurring)}</span>
      <span style="font-size:.72rem;flex-shrink:0">${nextStr}</span>
      <div class="cat-row-actions">
        ${t.recurringPaused
          ? `<button title="Reanudar" onclick="_adminResumeRecurring(${menuArg},${t.id})">▶</button>`
          : `<button title="Pausar" onclick="_adminPauseRecurring(${menuArg},${t.id})">⏸</button>`}
        <button title="Editar" onclick="adminEditRecurringTemplate(${menuArg},${t.id})">✏️</button>
        <button title="Historial" onclick="openRecurringHistoryModal(${menuArg},${t.id})">📜</button>
        <button title="Eliminar" onclick="adminDeleteRecurringTemplate(${menuArg},${t.id})">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

function _afterRecurringChange(menuId) {
  renderAdminRecurring();
  if (menuId == null) syncPrivateData().catch(() => {});
  else onMenuSaved(menuId).catch(() => {});
}

function _adminPauseRecurring(menuId, id) {
  pauseRecurringTemplate(menuId, id);
  _afterRecurringChange(menuId);
  showToast('Plantilla pausada');
}

function _adminResumeRecurring(menuId, id) {
  resumeRecurringTemplate(menuId, id);
  _afterRecurringChange(menuId);
  showToast('Plantilla reanudada');
}

function adminEditRecurringTemplate(menuId, id) {
  closeAdminPanel();
  if (menuId == null) openEditTxModal(id);
  else openEditMenuTxModal(menuId, id);
}

function adminDeleteRecurringTemplate(menuId, id) {
  const list = menuId == null ? getTxs() : getMenuTxs(menuId);
  const tx = list.find(t => t.id === id);
  if (!tx) return;
  showConfirm(
    `¿Eliminar la plantilla recurrente "${esc(tx.description || 'Recurrente')}"? El historial de registros ya generados NO se borra.`,
    () => {
      if (menuId == null) {
        deleteTx(id);
        syncPrivateData().catch(() => {});
      } else {
        deleteMenuTx(menuId, id);
        pushDeleteToGas(menuId, id);
      }
      renderAdminRecurring();
      showToast('Plantilla eliminada');
    },
    { icon: '🗑️', okLabel: 'Eliminar' }
  );
}

function openRecurringHistoryModal(menuId, templateId) {
  const occ  = getRecurringOccurrences(menuId, templateId);
  const curr = menuId == null ? '€' : (getCustomMenu(menuId)?.currency ?? '€');
  const el   = document.getElementById('recurring-history-list');
  el.innerHTML = occ.length
    ? occ.map(o => `<div class="cat-row">
        <span style="flex:1">${fmtDate(o.date)}</span>
        <span>${menuId == null ? fmtMoney(o.amount) : _fmtCurr(o.amount, curr)}</span>
      </div>`).join('')
    : '<div style="color:var(--text2);font-size:.82rem;text-align:center;padding:16px">Sin ocurrencias generadas todavía.</div>';
  document.getElementById('recurring-history-modal').classList.add('open');
}

function closeRecurringHistoryModal() {
  document.getElementById('recurring-history-modal').classList.remove('open');
}
```

- [ ] **Step 3: Verificar sintaxis**

```bash
node --check "D:\DOCUMENTOS\GestionFinancieraV2\js\render\admin.js"
```
Expected: sin salida.

- [ ] **Step 4: Commit**

```bash
cd "D:\DOCUMENTOS\GestionFinancieraV2"
git add js/render/admin.js
git commit -m "feat(recurrentes): panel Admin con listado, pausar/reanudar, editar, eliminar e historial"
```

---

### Task 4: Widget en Inicio + atajo de creación

**Files:**
- Modify: `D:\DOCUMENTOS\GestionFinancieraV2\js\render\inicio.js`

- [ ] **Step 1: Agregar `_buildRecurringSummary()` y `openNewRecurringTemplateModal()`**

Buscar (justo antes del banner de recordatorios, función `_buildReminderBanner`):

```js
function _buildReminderBanner() {
```

Insertar INMEDIATAMENTE ANTES:

```js
// ── Resumen de plantillas recurrentes ─────────────────────
function _buildRecurringSummary() {
  const all = getAllRecurringTemplates();
  if (!all.length) return '';
  const active = all.filter(t => !t.recurringPaused).length;
  const paused = all.filter(t => t.recurringPaused).length;
  const activeLabel = `${active} plantilla${active === 1 ? '' : 's'} recurrente${active === 1 ? '' : 's'} activa${active === 1 ? '' : 's'}`;
  const pausedLabel = paused ? ` · ${paused} pausada${paused === 1 ? '' : 's'}` : '';
  return `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:.82rem">
    <span>🔁 ${activeLabel}${pausedLabel}</span>
    <a href="#" onclick="event.preventDefault();openAdminPanel().then(()=>switchAdminTab('recurrentes'))" style="color:var(--acc);font-weight:600;text-decoration:none;flex-shrink:0">Gestionar →</a>
  </div>`;
}

function openNewRecurringTemplateModal() {
  closeAdminPanel();
  openNewRecordModal();
  document.getElementById('tx-recurring').value = 'mensual';
}
```

**Nota de diseño:** `openNewRecurringTemplateModal()` reutiliza `openNewRecordModal()` (ya existente), que detecta automáticamente el destino según la vista activa (`_currentView`) — si se abre desde el widget de Inicio (fuera de un menú), el destino será Inicio. Si el usuario quiere una plantilla dentro de un menú específico, debe abrir ese menú y usar su propio botón "+ Nuevo" (ya soporta el campo Recurrencia desde antes) — no se agrega un selector de menú destino aquí, por alcance ("Igual que hoy" fue la respuesta elegida en el brainstorming).

- [ ] **Step 2: Conectar el widget al render principal**

Buscar en `renderInicio()`:

```js
  el.innerHTML = `
    <div class="overview-topbar">
      <span class="section-label">📊 VISTA GENERAL</span>
      <span class="overview-updated">Actualizado: ${updStr}</span>
    </div>
    ${_buildReminderBanner()}
    ${_buildMonthTabs()}
```

Reemplazar por:

```js
  el.innerHTML = `
    <div class="overview-topbar">
      <span class="section-label">📊 VISTA GENERAL</span>
      <span class="overview-updated">Actualizado: ${updStr}</span>
    </div>
    ${_buildRecurringSummary()}
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
git commit -m "feat(recurrentes): widget resumen en Inicio + atajo para nueva plantilla"
```

---

### Task 5: Bump de versión + verificación manual en el navegador

**Files:** ninguno de código — solo versión y verificación.

- [ ] **Step 1: Bump de versión**

```bash
grep -n "CACHE_NAME = " "D:\DOCUMENTOS\GestionFinancieraV2\cashmap_sw.js"
grep -n "APP_VERSION" "D:\DOCUMENTOS\GestionFinancieraV2\js\config.js"
```

Incrementar ambos en 1 respecto al valor mostrado (ej. `v2-93` → `v2-94` en ambos archivos).

- [ ] **Step 2: Commit del bump**

```bash
cd "D:\DOCUMENTOS\GestionFinancieraV2"
git add cashmap_sw.js js/config.js
git commit -m "chore(sw): bump cache tras agregar gestion de recurrentes"
```

- [ ] **Step 3: Verificación en el navegador**

Abrir la app (local o desplegada), forzar recarga (Ctrl+Shift+R o unregister SW + limpiar caché).

1. Crear una transacción en Inicio con Recurrencia "Mensual", fecha hoy → confirmar que aparece en Inicio con el widget "🔁 1 plantilla recurrente activa" arriba del banner de recordatorios.
2. Click en "Gestionar →" → debe abrir Panel Admin directo en la pestaña "🔁 Recurrentes", mostrando la fila con Descripción, Origen "Inicio", Monto, "Mensual", "Próx: <fecha>".
3. Click en ⏸ (Pausar) → la fila debe mostrar el badge "⏸ Pausado", toast "Plantilla pausada". Recargar la página → sigue pausada (persistió).
4. Click en ▶ (Reanudar) → vuelve a mostrar "Próx: <fecha>" con la fecha correcta (igual a la que tenía antes de pausar, ya que sigue en el futuro).
5. Click en ✏️ (Editar) → debe cerrar el Admin y abrir el modal de transacción normal con los datos precargados (incluida la recurrencia). Cambiar el monto y guardar → confirmar que el cambio se refleja al reabrir el panel Recurrentes.
6. Click en 📜 (Historial) → abre modal; si aún no se generó ninguna ocurrencia real, debe decir "Sin ocurrencias generadas todavía."
7. Click en 🗑 (Eliminar) → confirmar diálogo, eliminar → la fila desaparece del panel y del widget de Inicio.
8. Abrir la consola del navegador (DevTools) y verificar que no aparezca ningún error rojo durante todo el flujo anterior.

- [ ] **Step 4: Verificación con un menú compartido (si aplica)**

Repetir el flujo de creación+pausar+eliminar dentro de un menú compartido (`shared: true`). Tras cada acción, confirmar en el Google Sheet correspondiente (o en otro dispositivo) que el cambio se propaga: pausar/reanudar actualiza los campos `recurring`/`recurringNext` en la fila; eliminar marca `deleted:1` (verificar que `pushDeleteToGas` fue llamado, no solo `onMenuSaved`).
