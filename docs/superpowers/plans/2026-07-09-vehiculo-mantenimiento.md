# Historial de compras y mantenimientos — menú Vehículo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un tercer tipo de registro (`entryType: 'maintenance'`, subtipos Reparación/Taller y Repuestos/Piezas) al menú tipo Vehículo, combinados en una sola sección de historial.

**Architecture:** Reutiliza el patrón ya existente de `entryType: 'oil'` (modal dedicado con campos condicionales según un `<select>` de subtipo, guardado vía `addMenuTx`/`updateMenuTx`/`deleteMenuTx` + `onMenuSaved`, renderizado en una sección de historial dentro de `renderVehicleMenu`). Sin cambios en `sync.js` ni `gas/Code.gs` — estos registros viajan como transacciones normales del menú.

**Tech Stack:** Vanilla JS (sin build), HTML template literals, mismo patrón de modal ya usado en `#oil-modal`.

**No hay framework de tests en este proyecto** — verificación manual vía consola del navegador (DevTools) y/o interacción directa con la UI cargada en `index.html`.

---

### Task 1: Modal `#maintenance-modal` en `index.html`

**Files:**
- Modify: `D:\DOCUMENTOS\GestionFinancieraV2\index.html` (insertar justo antes de `<!-- ── VEHICLE INFO MODAL ─────────────────────────────────── -->`, línea 918)

- [ ] **Step 1: Insertar el modal**

Buscar esta línea exacta en `index.html`:

```html
<!-- ── VEHICLE INFO MODAL ─────────────────────────────────── -->
```

Insertar INMEDIATAMENTE ANTES de esa línea (después del `</div>` de cierre de `#oil-modal`, línea 916):

```html
<!-- ── MAINTENANCE MODAL ──────────────────────────────────── -->
<div class="modal-overlay" id="maintenance-modal">
  <div class="modal" style="width:min(500px,96vw)">
    <h3 id="maintenance-modal-title">🔧 Registrar mantenimiento</h3>
    <input type="hidden" id="maint-menu-id">
    <input type="hidden" id="maint-entry-id">
    <div class="form-grid">
      <div class="form-row" style="grid-column:1/-1">
        <label>Tipo</label>
        <select id="maint-type-sel" onchange="_updateMaintTypeFields()"
                style="background:var(--bg2);border:1px solid var(--border);color:var(--text);padding:8px;border-radius:8px">
          <option value="reparacion">🔧 Reparación/Taller</option>
          <option value="repuesto">⚙️ Repuestos/Piezas</option>
        </select>
      </div>
      <div class="form-row">
        <label>Fecha</label>
        <input id="maint-date" type="date">
      </div>
      <div class="form-row">
        <label>Hora</label>
        <input id="maint-time" type="time">
      </div>
      <div class="form-row" id="maint-taller-row">
        <label>Taller</label>
        <input id="maint-taller" type="text" placeholder="Nombre del taller">
      </div>
      <div class="form-row" id="maint-description-row" style="grid-column:1/-1">
        <label>Descripción del trabajo</label>
        <input id="maint-description" type="text" placeholder="Ej: Cambio de frenos">
      </div>
      <div class="form-row" id="maint-pieza-row" style="display:none">
        <label>Pieza</label>
        <input id="maint-pieza" type="text" placeholder="Ej: Batería, Amortiguador…">
      </div>
      <div class="form-row" id="maint-marca-row" style="display:none">
        <label>Marca</label>
        <input id="maint-marca" type="text" placeholder="Opcional">
      </div>
      <div class="form-row">
        <label>Costo</label>
        <input id="maint-cost" type="number" min="0" step="0.01" placeholder="0.00">
      </div>
      <div class="form-row">
        <label>Km odómetro</label>
        <input id="maint-odometer" type="number" min="0" step="1" placeholder="Opcional">
      </div>
      <div class="form-row" style="grid-column:1/-1">
        <label>Notas</label>
        <textarea id="maint-notes" rows="2" placeholder="Opcional…"
                  style="background:var(--bg2);border:1px solid var(--border);color:var(--text);padding:8px;border-radius:8px;font-size:.85rem;resize:vertical"></textarea>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-danger btn-sm" id="maint-del-btn" style="display:none;margin-right:auto"
              onclick="confirmDeleteMaintEntry()">🗑 Eliminar</button>
      <button class="btn btn-ghost"   onclick="closeMaintenanceModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveMaintEntry()">Guardar</button>
    </div>
  </div>
</div>

```

- [ ] **Step 2: Verificar que el HTML quedó bien formado**

```bash
grep -c "maintenance-modal\|maint-" "D:\DOCUMENTOS\GestionFinancieraV2\index.html"
```
Expected: un número mayor que 0 (confirma que se insertaron los ids).

Abrir el archivo en un navegador o usar un linter de HTML online no es necesario — la app entera es un solo `index.html`, cualquier error de sintaxis se manifiesta como fallo de renderizado en el resto de las tareas.

- [ ] **Step 3: Commit**

```bash
cd "D:\DOCUMENTOS\GestionFinancieraV2"
git add index.html
git commit -m "feat(vehiculo): agregar modal de mantenimiento/compras al HTML"
```

---

### Task 2: Funciones JS del modal (`openMaintenanceModal`, `closeMaintenanceModal`, `saveMaintEntry`, `confirmDeleteMaintEntry`, `_updateMaintTypeFields`)

**Files:**
- Modify: `D:\DOCUMENTOS\GestionFinancieraV2\js\render\custom-menu.js` (insertar después de la función `confirmDeleteOilEntry`, que termina justo antes de la siguiente función en el archivo — buscar el texto exacto de abajo)

- [ ] **Step 1: Localizar el punto de inserción**

Buscar esta función existente (el final de `confirmDeleteOilEntry`):

```js
function confirmDeleteOilEntry() {
  const menuId  = parseInt(document.getElementById('oil-menu-id').value, 10);
  const entryId = parseInt(document.getElementById('oil-entry-id').value, 10);
  showConfirm('¿Eliminar este cambio de aceite?', () => {
    deleteMenuTx(menuId, entryId);
    closeOilModal();
    renderVehicleMenu(menuId);
    onMenuSaved(menuId).catch(() => {});
    showToast('Registro eliminado');
```

Esta función termina con `});` y `}` en las líneas siguientes. Insertar el bloque completo de abajo INMEDIATAMENTE DESPUÉS del cierre de `confirmDeleteOilEntry` (después del `}` final de esa función).

- [ ] **Step 2: Insertar las funciones nuevas**

```js
// ── Maintenance modal (Reparación/Taller + Repuestos/Piezas) ──
function _updateMaintTypeFields() {
  const type = document.getElementById('maint-type-sel').value;
  const isReparacion = type === 'reparacion';
  document.getElementById('maint-taller-row').style.display      = isReparacion ? '' : 'none';
  document.getElementById('maint-description-row').style.display = isReparacion ? '' : 'none';
  document.getElementById('maint-pieza-row').style.display        = isReparacion ? 'none' : '';
  document.getElementById('maint-marca-row').style.display        = isReparacion ? 'none' : '';
}

function openMaintenanceModal(menuId, entryId = null) {
  document.getElementById('maint-menu-id').value          = menuId;
  document.getElementById('maint-entry-id').value         = entryId ?? '';
  document.getElementById('maint-del-btn').style.display  = entryId != null ? '' : 'none';
  document.getElementById('maintenance-modal-title').textContent = entryId != null ? '🔧 Editar mantenimiento' : '🔧 Registrar mantenimiento';

  if (entryId != null) {
    const e = getMenuTxs(menuId).find(t => t.id === entryId);
    if (!e) return;
    document.getElementById('maint-type-sel').value    = e.maintType ?? 'reparacion';
    document.getElementById('maint-date').value        = e.date ?? '';
    document.getElementById('maint-time').value        = e.time ?? '';
    document.getElementById('maint-taller').value      = e.taller ?? '';
    document.getElementById('maint-description').value = e.description ?? '';
    document.getElementById('maint-pieza').value       = e.pieza ?? '';
    document.getElementById('maint-marca').value       = e.marca ?? '';
    document.getElementById('maint-cost').value        = e.cost ?? '';
    document.getElementById('maint-odometer').value    = e.odometerKm > 0 ? e.odometerKm : '';
    document.getElementById('maint-notes').value       = e.notes ?? '';
  } else {
    document.getElementById('maint-type-sel').value    = 'reparacion';
    document.getElementById('maint-date').value        = _nowDate();
    document.getElementById('maint-time').value        = _nowTime();
    document.getElementById('maint-taller').value      = '';
    document.getElementById('maint-description').value = '';
    document.getElementById('maint-pieza').value       = '';
    document.getElementById('maint-marca').value       = '';
    document.getElementById('maint-cost').value        = '';
    document.getElementById('maint-odometer').value    = '';
    document.getElementById('maint-notes').value       = '';
  }
  _updateMaintTypeFields();
  document.getElementById('maintenance-modal').classList.add('open');
}

function closeMaintenanceModal() {
  document.getElementById('maintenance-modal').classList.remove('open');
}

function saveMaintEntry() {
  const menuId  = parseInt(document.getElementById('maint-menu-id').value, 10);
  const entryId = document.getElementById('maint-entry-id').value;
  const cost    = parseFloat(document.getElementById('maint-cost').value);
  const maintType = document.getElementById('maint-type-sel').value;

  if (!cost) { showToast('Ingresa el costo', 'error'); return; }

  const fields = {
    entryType:   'maintenance',
    maintType,
    date:        document.getElementById('maint-date').value || _nowDate(),
    time:        document.getElementById('maint-time').value || '',
    cost,
    odometerKm:  parseInt(document.getElementById('maint-odometer').value, 10) || 0,
    notes:       document.getElementById('maint-notes').value.trim(),
    taller:      maintType === 'reparacion' ? document.getElementById('maint-taller').value.trim() : '',
    description: maintType === 'reparacion' ? document.getElementById('maint-description').value.trim() : '',
    pieza:       maintType === 'repuesto' ? document.getElementById('maint-pieza').value.trim() : '',
    marca:       maintType === 'repuesto' ? document.getElementById('maint-marca').value.trim() : '',
  };

  if (entryId) updateMenuTx(menuId, parseInt(entryId, 10), fields);
  else         addMenuTx(menuId, fields);

  closeMaintenanceModal();
  renderVehicleMenu(menuId);
  onMenuSaved(menuId).catch(() => {});
  showToast('Mantenimiento guardado ✓');
}

function confirmDeleteMaintEntry() {
  const menuId  = parseInt(document.getElementById('maint-menu-id').value, 10);
  const entryId = parseInt(document.getElementById('maint-entry-id').value, 10);
  showConfirm('¿Eliminar este registro de mantenimiento?', () => {
    deleteMenuTx(menuId, entryId);
    closeMaintenanceModal();
    renderVehicleMenu(menuId);
    onMenuSaved(menuId).catch(() => {});
    showToast('Registro eliminado');
  }, { icon: '🗑️', okLabel: 'Eliminar' });
}
```

- [ ] **Step 3: Verificar sintaxis**

```bash
node --check "D:\DOCUMENTOS\GestionFinancieraV2\js\render\custom-menu.js"
```
Expected: sin salida (sintaxis válida).

- [ ] **Step 4: Commit**

```bash
cd "D:\DOCUMENTOS\GestionFinancieraV2"
git add js/render/custom-menu.js
git commit -m "feat(vehiculo): funciones de guardado/edicion/borrado para mantenimiento"
```

---

### Task 3: Función de renderizado `_renderMaintenanceSection`

**Files:**
- Modify: `D:\DOCUMENTOS\GestionFinancieraV2\js\render\custom-menu.js` (insertar después de `_renderOilSection`, antes de la siguiente función del archivo)

- [ ] **Step 1: Localizar el punto de inserción**

Buscar el final de `_renderOilSection` (el bloque completo termina con este patrón, incluyendo el botón de editar por cada entrada):

```js
      <button class="btn btn-ghost btn-sm" onclick="openOilModal(${menuId},${e.id})"
              style="flex-shrink:0;padding:4px 8px">✏️</button>
    </div>`).join('')}
  </div>`;
}
```

Insertar el bloque de abajo INMEDIATAMENTE DESPUÉS de ese `}` de cierre de `_renderOilSection`.

- [ ] **Step 2: Insertar `_renderMaintenanceSection`**

```js
const _MAINT_TYPE_ICON  = { reparacion: '🔧', repuesto: '⚙️' };
const _MAINT_TYPE_LABEL = { reparacion: 'Reparación', repuesto: 'Repuesto' };

function _renderMaintenanceSection(menuId, entries, curr) {
  if (!entries.length) {
    return `<div style="text-align:center;color:var(--text2);padding:20px 0;font-size:.85rem">Sin registros de mantenimiento este mes</div>`;
  }
  const sorted = [...entries].sort((a, b) =>
    (b.date + (b.time || '00:00')).localeCompare(a.date + (a.time || '00:00')) || (b.updatedAt || '').localeCompare(a.updatedAt || '')
  );
  return `<div style="display:flex;flex-direction:column;gap:8px">
    ${sorted.map(e => {
      const icon  = _MAINT_TYPE_ICON[e.maintType] ?? '🔧';
      const title = e.maintType === 'repuesto'
        ? [e.pieza, e.marca].filter(Boolean).join(' · ') || 'Repuesto'
        : [e.taller, e.description].filter(Boolean).join(' · ') || _MAINT_TYPE_LABEL[e.maintType] || 'Mantenimiento';
      return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg2);border-radius:10px;border:1px solid var(--border)">
        <div style="font-size:1.3rem;min-width:28px;text-align:center">${icon}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:.88rem">${esc(title)}</div>
          <div style="font-size:.75rem;color:var(--text2)">${e.date}${e.time ? ' ' + fmtTime(e.time) : ''}${e.odometerKm > 0 ? ' · ' + e.odometerKm.toLocaleString() + ' km' : ''}</div>
          ${e.notes ? `<div style="font-size:.72rem;color:var(--text2);margin-top:2px">${esc(e.notes)}</div>` : ''}
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-weight:700;color:var(--red)">${_fmtCurr(e.cost || 0, curr)}</div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="openMaintenanceModal(${menuId},${e.id})"
                style="flex-shrink:0;padding:4px 8px">✏️</button>
      </div>`;
    }).join('')}
  </div>`;
}
```

- [ ] **Step 3: Verificar sintaxis**

```bash
node --check "D:\DOCUMENTOS\GestionFinancieraV2\js\render\custom-menu.js"
```
Expected: sin salida.

- [ ] **Step 4: Commit**

```bash
cd "D:\DOCUMENTOS\GestionFinancieraV2"
git add js/render/custom-menu.js
git commit -m "feat(vehiculo): renderizado de seccion combinada de mantenimiento"
```

---

### Task 4: Conectar la sección y el botón al dispatch de `renderVehicleMenu`

**Files:**
- Modify: `D:\DOCUMENTOS\GestionFinancieraV2\js\render\custom-menu.js` (dentro de `renderVehicleMenu`, cerca de donde ya están fuel/oil)

- [ ] **Step 1: Agregar filtro de entradas de mantenimiento**

Buscar en `renderVehicleMenu` (línea ~1140-1145):

```js
  const allEntries = getMenuTxs(menuId).filter(e => !e._deleted);
  // legacy 'fuel' menus: entries without entryType treated as fuel
  const allFuel  = allEntries.filter(e => !e.entryType || e.entryType === 'fuel');
  const allOil   = allEntries.filter(e => e.entryType === 'oil');
  const monthFuel = allFuel.filter(e => e.date?.startsWith(ym));
  const monthOil  = allOil.filter(e => e.date?.startsWith(ym));
```

Reemplazar por (agrega `allMaint`/`monthMaint` sin tocar las líneas existentes):

```js
  const allEntries = getMenuTxs(menuId).filter(e => !e._deleted);
  // legacy 'fuel' menus: entries without entryType treated as fuel
  const allFuel  = allEntries.filter(e => !e.entryType || e.entryType === 'fuel');
  const allOil   = allEntries.filter(e => e.entryType === 'oil');
  const allMaint = allEntries.filter(e => e.entryType === 'maintenance');
  const monthFuel  = allFuel.filter(e => e.date?.startsWith(ym));
  const monthOil   = allOil.filter(e => e.date?.startsWith(ym));
  const monthMaint = allMaint.filter(e => e.date?.startsWith(ym));
```

`ym` ya está definido en la línea `const ym = _menuMonth[menuId];` inmediatamente antes de este bloque (línea ~1132) — no requiere ningún cambio adicional.

- [ ] **Step 3: Agregar el botón "Registrar mantenimiento"**

Buscar:

```js
    ${_canWriteMenuTxs(menu) ? `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0">
        <button class="btn btn-primary" onclick="openFuelEntryModal(${menuId})">⛽ Registrar carga</button>
        <button class="btn btn-ghost"   onclick="openOilModal(${menuId})">🛢️ Cambio de aceite</button>
      </div>
    ` : ''}
```

Reemplazar por:

```js
    ${_canWriteMenuTxs(menu) ? `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0">
        <button class="btn btn-primary" onclick="openFuelEntryModal(${menuId})">⛽ Registrar carga</button>
        <button class="btn btn-ghost"   onclick="openOilModal(${menuId})">🛢️ Cambio de aceite</button>
        <button class="btn btn-ghost"   onclick="openMaintenanceModal(${menuId})">🔧 Mantenimiento</button>
      </div>
    ` : ''}
```

- [ ] **Step 4: Agregar la sección de historial combinado**

Buscar:

```js
    <div style="margin-top:16px">
      <div class="section-title" style="margin-bottom:8px">🛢️ Cambios de aceite</div>
      ${_renderOilSection(menuId, monthOil, curr)}
    </div>
```

Reemplazar por (agrega la sección nueva justo después, sin tocar la de aceite):

```js
    <div style="margin-top:16px">
      <div class="section-title" style="margin-bottom:8px">🛢️ Cambios de aceite</div>
      ${_renderOilSection(menuId, monthOil, curr)}
    </div>

    <div style="margin-top:16px">
      <div class="section-title" style="margin-bottom:8px">🔧 Mantenimiento</div>
      ${_renderMaintenanceSection(menuId, monthMaint, curr)}
    </div>
```

- [ ] **Step 5: Verificar sintaxis**

```bash
node --check "D:\DOCUMENTOS\GestionFinancieraV2\js\render\custom-menu.js"
```
Expected: sin salida.

- [ ] **Step 6: Commit**

```bash
cd "D:\DOCUMENTOS\GestionFinancieraV2"
git add js/render/custom-menu.js
git commit -m "feat(vehiculo): conectar boton y seccion de mantenimiento al menu"
```

---

### Task 5: Verificación manual en el navegador

**Files:** ninguno — solo verificación.

- [ ] **Step 1: Bump de versión**

```bash
grep -n "CACHE_NAME = " "D:\DOCUMENTOS\GestionFinancieraV2\cashmap_sw.js"
grep -n "APP_VERSION" "D:\DOCUMENTOS\GestionFinancieraV2\js\config.js"
```

Incrementar ambos en 1 respecto al valor actual mostrado (ej. si dice `v2-83`, cambiar a `v2-84` en ambos archivos).

- [ ] **Step 2: Commit del bump**

```bash
cd "D:\DOCUMENTOS\GestionFinancieraV2"
git add cashmap_sw.js js/config.js
git commit -m "chore(sw): bump cache tras agregar mantenimiento al menu Vehiculo"
```

- [ ] **Step 3: Verificación en el navegador**

Abrir la app (local o desplegada), forzar recarga (Ctrl+Shift+R), entrar a un menú tipo Vehículo existente (o crear uno nuevo con `menuType: 'vehicle'`).

1. Pulsar el botón "🔧 Mantenimiento" → debe abrir el modal con el select de Tipo en "Reparación/Taller" por defecto, mostrando los campos Taller y Descripción, ocultando Pieza y Marca.
2. Cambiar el select a "Repuestos/Piezas" → deben ocultarse Taller/Descripción y mostrarse Pieza/Marca.
3. Llenar un registro de Reparación (Taller="Taller Pérez", Descripción="Cambio de frenos", Costo=500, guardar) → debe cerrar el modal, mostrar toast "Mantenimiento guardado ✓", y aparecer en la sección "🔧 Mantenimiento" con ícono 🔧 y el título "Taller Pérez · Cambio de frenos".
4. Llenar un registro de Repuesto (Pieza="Batería", Marca="Bosch", Costo=1200, guardar) → debe aparecer con ícono ⚙️ y título "Batería · Bosch".
5. Confirmar que ambos registros están ordenados por fecha/hora (el más reciente arriba).
6. Editar el registro de Reparación (clic en ✏️) → confirmar que el modal se abre con los datos ya cargados y el select en "Reparación/Taller".
7. Eliminar el registro de Repuesto (abrir para editar → 🗑 Eliminar → confirmar) → confirma que desaparece de la lista.
8. Abrir la consola del navegador (DevTools) y verificar que no aparezca ningún error rojo durante todo el flujo anterior.

- [ ] **Step 4: Verificar sincronización (si el menú es compartido)**

Si el menú Vehículo usado en la prueba es compartido (`menu.shared === true`), pulsar "↺ Sync" tras guardar los registros de prueba y confirmar en el Google Sheet correspondiente que aparecen filas nuevas con `entryType=maintenance` y los campos `maintType`, `taller`/`pieza`, etc.
