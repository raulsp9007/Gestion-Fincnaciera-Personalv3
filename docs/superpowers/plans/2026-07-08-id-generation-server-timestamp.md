# Rediseño de IDs y timestamps — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar la colisión de IDs entre dispositivos y el desfase de reloj en el merge, sin migrar de Google Sheets/GAS ni romper ningún `onclick` existente.

**Architecture:** Los IDs generados por el cliente pasan de `Math.max(Date.now(), contador_local)` (colisiona entre dispositivos) a un número grande semi-aleatorio (`Date.now() * 1e6 + Math.floor(Math.random() * 1e6)`) — sigue siendo un `Number` plano, cero cambios en la UI. En paralelo, `Code.gs` deja de confiar en el `updatedAt` que manda el cliente: compara el contenido entrante contra lo ya guardado, y solo si difiere (o es fila nueva) estampa `updatedAt` con la hora del servidor.

**Tech Stack:** Vanilla JS (sin build), Google Apps Script (`gas/Code.gs`), Google Sheets como almacén.

**No hay framework de tests en este proyecto** — la verificación de cada paso es manual, vía consola del navegador (DevTools) contra la app cargada en `index.html`, o pegando el snippet en el editor de Apps Script y ejecutando la función de prueba ahí. Cada tarea indica el comando/snippet exacto a correr y el resultado esperado.

---

### Task 1: Helper único `genId()` en `js/db.js`

**Files:**
- Modify: `D:\DOCUMENTOS\GestionFinancieraV2\js\db.js:1-24`

- [ ] **Step 1: Agregar el helper justo después de `saveData()`**

Abrir `js/db.js`, localizar el bloque:

```js
function saveData() {
  if (!_data) return;
  localStorage.setItem(CACHE_KEY, JSON.stringify(_data));
  if (typeof scheduleAutosave === 'function') scheduleAutosave();
}
```

Insertar inmediatamente después:

```js

// Genera un id numerico grande semi-aleatorio: Date.now() (~13 digitos)
// combinado con un componente aleatorio de 6 digitos. Colisionar requiere
// que dos dispositivos generen un registro en el MISMO milisegundo Y
// saquen el MISMO numero aleatorio de 0 a 999999 — practicamente
// imposible. Sigue siendo un Number plano: cero cambios en los onclick
// que insertan ids sin comillas en toda la app.
function genId() {
  return Date.now() * 1e6 + Math.floor(Math.random() * 1e6);
}
```

- [ ] **Step 2: Verificar en consola del navegador**

Abrir la app en el navegador, abrir DevTools → Consola, ejecutar:

```js
const a = genId(); const b = genId();
console.log(typeof a, a, b, a !== b);
```

Esperado: `"number" 1751234567890123 1751234567890456 true` (los números exactos varían, pero `typeof` debe ser `"number"` y `a !== b` debe ser `true`).

- [ ] **Step 3: Commit**

```bash
cd "D:\DOCUMENTOS\GestionFinancieraV2"
git add js/db.js
git commit -m "feat(ids): agregar helper genId() semi-aleatorio compartido"
```

---

### Task 2: Reemplazar generación de ID en `addTx`

**Files:**
- Modify: `D:\DOCUMENTOS\GestionFinancieraV2\js\db.js:116-124`

- [ ] **Step 1: Reemplazar la línea de id**

Buscar:

```js
function addTx(fields) {
  const d   = loadData();
  const txs = d.inicio;
  const id  = Math.max(Date.now(), txs.length ? Math.max(...txs.map(t => t.id)) + 1 : 1);
  const tx  = { id, ...fields, updatedAt: new Date().toISOString() };
  txs.push(tx);
  saveData();
  return tx;
}
```

Reemplazar por:

```js
function addTx(fields) {
  const d   = loadData();
  const txs = d.inicio;
  const id  = genId();
  const tx  = { id, ...fields, updatedAt: new Date().toISOString() };
  txs.push(tx);
  saveData();
  return tx;
}
```

- [ ] **Step 2: Verificar en consola del navegador**

Con la app cargada y sesión iniciada:

```js
const before = getTxs().length;
addTx({ date: '2026-07-08', amount: 1, description: 'test-genid', type: 'exp', category: 'otros_exp', notes: '' });
const txs = getTxs();
console.log(txs.length === before + 1, typeof txs[txs.length - 1].id);
```

Esperado: `true "number"`.

- [ ] **Step 3: Limpiar el registro de prueba**

```js
deleteTx(getTxs()[getTxs().length - 1].id);
console.log(getTxs().length === before);
```

Esperado: `true`.

- [ ] **Step 4: Commit**

```bash
git add js/db.js
git commit -m "fix(ids): addTx usa genId() en vez de Math.max(Date.now(), contador)"
```

---

### Task 3: Reemplazar generación de ID en `addMenuTx`

**Files:**
- Modify: `D:\DOCUMENTOS\GestionFinancieraV2\js\db.js:180-190`

- [ ] **Step 1: Reemplazar la línea de id**

Buscar:

```js
function addMenuTx(menuId, fields) {
  const d  = loadData();
  const m  = d.customMenus.find(m => m.id === menuId);
  if (!m) return null;
  const id = Math.max(Date.now(), m.nextDataId);
  m.nextDataId = id + 1;
  const tx = { id, updatedAt: new Date().toISOString(), ...fields };
  m.data.push(tx);
  saveData();
  return tx;
}
```

Reemplazar por:

```js
function addMenuTx(menuId, fields) {
  const d  = loadData();
  const m  = d.customMenus.find(m => m.id === menuId);
  if (!m) return null;
  const id = genId();
  const tx = { id, updatedAt: new Date().toISOString(), ...fields };
  m.data.push(tx);
  saveData();
  return tx;
}
```

Nota: `m.nextDataId` ya no se usa para generar este id, pero el campo se deja intacto en el resto del código (`importMenuTxs`, `mergeMenuRows`, `addCustomMenu`) — esas rutas siguen funcionando igual, generan ids secuenciales pequeños que nunca chocan con los ids grandes de `genId()`.

- [ ] **Step 2: Verificar en consola del navegador**

Con algún menú personalizado ya creado (anota su id, ej. `1`):

```js
const before = getMenuTxs(1).length;
addMenuTx(1, { date: '2026-07-08', amount: 1, description: 'test-genid', type: 'exp', category: '', notes: '' });
const txs = getMenuTxs(1);
console.log(txs.length === before + 1, typeof txs[txs.length - 1].id);
```

Esperado: `true "number"`.

- [ ] **Step 3: Limpiar el registro de prueba**

```js
deleteMenuTx(1, getMenuTxs(1)[getMenuTxs(1).length - 1].id);
console.log(getMenuTxs(1).length === before);
```

Esperado: `true`.

- [ ] **Step 4: Commit**

```bash
git add js/db.js
git commit -m "fix(ids): addMenuTx usa genId(), nextDataId queda vestigial"
```

---

### Task 4: Reemplazar generación de ID en `addCustomMenu`

**Files:**
- Modify: `D:\DOCUMENTOS\GestionFinancieraV2\js\db.js:149-158`

- [ ] **Step 1: Reemplazar la línea de id**

Buscar:

```js
function addCustomMenu(fields) {
  const d     = loadData();
  const menus = d.customMenus;
  const id    = menus.length ? Math.max(...menus.map(m => m.id)) + 1 : 1;
  const menu  = { id, data: [], nextDataId: 1, ...fields };
  menus.push(menu);
  d.navOrder.push('menu-' + id);
  saveData();
  return menu;
}
```

Reemplazar por:

```js
function addCustomMenu(fields) {
  const d     = loadData();
  const menus = d.customMenus;
  const id    = genId();
  const menu  = { id, data: [], nextDataId: 1, ...fields };
  menus.push(menu);
  d.navOrder.push('menu-' + id);
  saveData();
  return menu;
}
```

- [ ] **Step 2: Verificar en consola del navegador**

```js
const before = getCustomMenus().length;
const m = addCustomMenu({ name: 'test-genid', icon: '📋', currency: '$', shared: false });
console.log(getCustomMenus().length === before + 1, typeof m.id);
```

Esperado: `true "number"`.

- [ ] **Step 3: Limpiar el menú de prueba**

```js
deleteCustomMenu(m.id);
console.log(getCustomMenus().length === before);
```

Esperado: `true`.

- [ ] **Step 4: Commit**

```bash
git add js/db.js
git commit -m "fix(ids): addCustomMenu usa genId()"
```

---

### Task 5: Reemplazar generación de ID en `addSharedDeudasMenu`

**Files:**
- Modify: `D:\DOCUMENTOS\GestionFinancieraV2\js\db.js:291-300`

- [ ] **Step 1: Reemplazar la línea de id**

Buscar:

```js
function addSharedDeudasMenu(fields) {
  const d = loadData();
  if (!d.sharedDeudasMenus) d.sharedDeudasMenus = [];
  const id = d.sharedDeudasMenus.length ? Math.max(...d.sharedDeudasMenus.map(m => m.id)) + 1 : 1;
  const menu = { id, data: [], lastPulledAt: null, ...fields };
  d.sharedDeudasMenus.push(menu);
  d.navOrder.push('sdeudas-' + id);
  saveData();
  return menu;
}
```

Reemplazar por:

```js
function addSharedDeudasMenu(fields) {
  const d = loadData();
  if (!d.sharedDeudasMenus) d.sharedDeudasMenus = [];
  const id = genId();
  const menu = { id, data: [], lastPulledAt: null, ...fields };
  d.sharedDeudasMenus.push(menu);
  d.navOrder.push('sdeudas-' + id);
  saveData();
  return menu;
}
```

- [ ] **Step 2: Verificar en consola del navegador**

```js
const before = getSharedDeudasMenus().length;
const m = addSharedDeudasMenu({ name: 'test-genid', sheetName: 'test' });
console.log(getSharedDeudasMenus().length === before + 1, typeof m.id);
```

Esperado: `true "number"`.

- [ ] **Step 3: Limpiar**

```js
deleteSharedDeudasMenu(m.id);
console.log(getSharedDeudasMenus().length === before);
```

Esperado: `true`.

- [ ] **Step 4: Commit**

```bash
git add js/db.js
git commit -m "fix(ids): addSharedDeudasMenu usa genId()"
```

---

### Task 6: Reemplazar generación de ID en `saveDeuda`

**Files:**
- Modify: `D:\DOCUMENTOS\GestionFinancieraV2\js\render\deudas.js:386-395`

- [ ] **Step 1: Reemplazar la línea de id**

Buscar (dentro de `saveDeuda`):

```js
  const now = new Date().toISOString();
  _mutateDeudas(arr => {
    if (id) {
      const idx = arr.findIndex(x => x.id === parseInt(id, 10));
      if (idx >= 0) arr[idx] = { ...arr[idx], date, amount, persona, description: desc, type, status, notes, currency, updatedAt: now };
    } else {
      const nextId = Math.max(Date.now(), arr.length ? Math.max(...arr.map(x => x.id)) + 1 : 1);
      arr.push({ id: nextId, date, amount, persona, description: desc, type, status, notes, currency, paid: 0, payments: [], updatedAt: now });
    }
  });
```

Reemplazar por:

```js
  const now = new Date().toISOString();
  _mutateDeudas(arr => {
    if (id) {
      const idx = arr.findIndex(x => x.id === parseInt(id, 10));
      if (idx >= 0) arr[idx] = { ...arr[idx], date, amount, persona, description: desc, type, status, notes, currency, updatedAt: now };
    } else {
      const nextId = genId();
      arr.push({ id: nextId, date, amount, persona, description: desc, type, status, notes, currency, paid: 0, payments: [], updatedAt: now });
    }
  });
```

- [ ] **Step 2: Verificar en el navegador**

Con la app abierta: ir a Deudas → "+ Nueva deuda" → llenar Persona="test-genid", Monto=1, Fecha=hoy → Guardar. Confirmar que aparece en la tabla sin error en consola. Abrir DevTools → Consola:

```js
const d = _getDeudas().find(x => x.persona === 'test-genid');
console.log(typeof d.id);
```

Esperado: `"number"`.

- [ ] **Step 3: Limpiar el registro de prueba**

En la UI: clic en el registro "test-genid" → editar → o usar el botón eliminar de esa fila. Confirmar que desaparece de la tabla.

- [ ] **Step 4: Commit**

```bash
git add js/render/deudas.js
git commit -m "fix(ids): saveDeuda usa genId()"
```

---

### Task 7: Guardia de contenido antes de timestamp de servidor en `_pushRows` (GAS)

**Files:**
- Modify: `D:\DOCUMENTOS\GestionFinancieraV2\gas\Code.gs:215-253`

- [ ] **Step 1: Reemplazar `_pushRows` completo**

Buscar:

```js
// Upsert de filas por id.
function _pushRows({ sheetName, rows }) {
  if (!sheetName)               throw new Error('sheetName requerido');
  if (!Array.isArray(rows))     throw new Error('rows debe ser array');
  if (!rows.length)             return { ok: true, upserted: 0 };

  const ss    = _getSpreadsheet();
  const sheet = _ensureSheet(ss, sheetName);

  const data    = sheet.getDataRange().getValues();
  const headers = data[0].map(String);
  const idCol   = headers.indexOf('id');

  // Construir mapa id → número de fila (1-based)
  const idMap = {};
  for (let i = 1; i < data.length; i++) {
    idMap[String(data[i][idCol])] = i + 1;
  }

  let upserted = 0;
  for (const row of rows) {
    // Usar headers reales del sheet para respetar columnas existentes y futuras
    const rowArr = headers.map(h => {
      const v = row[h];
      return (v === null || v === undefined) ? '' : v;
    });
    const key = String(row.id);

    if (idMap[key]) {
      sheet.getRange(idMap[key], 1, 1, headers.length).setValues([rowArr]);
    } else {
      sheet.appendRow(rowArr);
      idMap[key] = sheet.getLastRow();
    }
    upserted++;
  }

  return { ok: true, upserted };
}
```

Reemplazar por:

```js
// Compara dos filas (arrays alineados a `headers`) ignorando la
// columna 'updatedAt'. Devuelve true si son identicas.
function _rowsEqualIgnoringUpdatedAt(headers, rowA, rowB) {
  for (let i = 0; i < headers.length; i++) {
    if (headers[i] === 'updatedAt') continue;
    if (String(rowA[i] ?? '') !== String(rowB[i] ?? '')) return false;
  }
  return true;
}

// Upsert de filas por id. Solo estampa updatedAt del servidor cuando el
// contenido realmente cambio (o la fila es nueva) — evita que un push
// del array completo (patron actual del cliente: siempre manda todos los
// registros locales) pise el timestamp de filas sin cambios reales.
function _pushRows({ sheetName, rows }) {
  if (!sheetName)               throw new Error('sheetName requerido');
  if (!Array.isArray(rows))     throw new Error('rows debe ser array');
  if (!rows.length)             return { ok: true, upserted: 0 };

  const ss    = _getSpreadsheet();
  const sheet = _ensureSheet(ss, sheetName);

  const data    = sheet.getDataRange().getValues();
  const headers = data[0].map(String);
  const idCol   = headers.indexOf('id');
  const nowIso  = new Date().toISOString();

  // Construir mapa id → número de fila (1-based)
  const idMap = {};
  for (let i = 1; i < data.length; i++) {
    idMap[String(data[i][idCol])] = i + 1;
  }

  let upserted = 0;
  for (const row of rows) {
    const key = String(row.id);
    const existingRowNum = idMap[key];

    if (existingRowNum) {
      const existingArr = data[existingRowNum - 1];
      const incomingArr = headers.map(h => {
        const v = row[h];
        return (v === null || v === undefined) ? '' : v;
      });
      if (_rowsEqualIgnoringUpdatedAt(headers, existingArr, incomingArr)) {
        continue; // contenido identico, no tocar nada
      }
      const rowArr = headers.map((h, i) => h === 'updatedAt' ? nowIso : incomingArr[i]);
      sheet.getRange(existingRowNum, 1, 1, headers.length).setValues([rowArr]);
    } else {
      const rowArr = headers.map(h => {
        if (h === 'updatedAt') return nowIso;
        const v = row[h];
        return (v === null || v === undefined) ? '' : v;
      });
      sheet.appendRow(rowArr);
      idMap[key] = sheet.getLastRow();
    }
    upserted++;
  }

  return { ok: true, upserted };
}
```

- [ ] **Step 2: Pegar en el editor de Apps Script y probar manualmente**

En `script.google.com` → proyecto → pegar el archivo completo actualizado → guardar. En el editor, crear una función temporal de prueba y ejecutarla desde el editor (▶ Ejecutar):

```js
function _testPushRowsGuard() {
  const sheetName = 'TestPushGuard';
  const ss = _getSpreadsheet();
  const old = ss.getSheetByName(sheetName);
  if (old) ss.deleteSheet(old);

  const row1 = { id: '999001', date: '2026-07-08', time: '', amount: '10', description: 'test', type: 'exp', category: 'x', notes: '', recurring: '', recurringNext: '', updatedAt: '2020-01-01T00:00:00.000Z', updatedBy: 'test', deleted: 0 };
  const r1 = _pushRows({ sheetName, rows: [row1] });
  const sheet1 = _getSpreadsheet().getSheetByName(sheetName);
  const afterFirstPush = sheet1.getDataRange().getValues();
  const updatedAtCol = afterFirstPush[0].indexOf('updatedAt');
  const ts1 = afterFirstPush[1][updatedAtCol];

  // Segundo push con EXACTAMENTE el mismo contenido (updatedAt distinto, viejo, simulando cliente desactualizado)
  const r2 = _pushRows({ sheetName, rows: [row1] });
  const afterSecondPush = _getSpreadsheet().getSheetByName(sheetName).getDataRange().getValues();
  const ts2 = afterSecondPush[1][updatedAtCol];

  Logger.log('ts1=' + ts1 + ' ts2=' + ts2 + ' iguales=' + (ts1.getTime() === ts2.getTime()));

  // Tercer push con contenido DISTINTO
  const row3 = Object.assign({}, row1, { amount: '20' });
  const r3 = _pushRows({ sheetName, rows: [row3] });
  const afterThirdPush = _getSpreadsheet().getSheetByName(sheetName).getDataRange().getValues();
  const ts3 = afterThirdPush[1][updatedAtCol];

  Logger.log('ts3 distinto de ts2=' + (ts3.getTime() !== ts2.getTime()));

  ss.deleteSheet(_getSpreadsheet().getSheetByName(sheetName));
}
```

Ejecutar `_testPushRowsGuard`, ver **Registro de ejecución** (Ver → Registros).

Esperado: `ts1=... ts2=... iguales=true` (mismo contenido no cambia el timestamp) y `ts3 distinto de ts2=true` (contenido distinto sí lo actualiza).

- [ ] **Step 3: Borrar la función de prueba**

Eliminar `_testPushRowsGuard` del editor (era solo para verificar, no debe quedar en el proyecto).

- [ ] **Step 4: Redesplegar**

`Implementar → Gestionar implementaciones → ✏️ → Versión: Nueva versión → Implementar`.

- [ ] **Step 5: Commit**

```bash
cd "D:\DOCUMENTOS\GestionFinancieraV2"
git add gas/Code.gs
git commit -m "fix(gas): _pushRows solo estampa updatedAt de servidor si el contenido cambio"
```

---

### Task 8: Guardia de contenido antes de timestamp de servidor en `_pushJsonRows` (GAS)

**Files:**
- Modify: `D:\DOCUMENTOS\GestionFinancieraV2\gas\Code.gs:324-351`

- [ ] **Step 1: Reemplazar `_pushJsonRows` completo**

Buscar:

```js
function _pushJsonRows({ sheetName, rows }) {
  if (!sheetName)           throw new Error('sheetName requerido');
  if (!Array.isArray(rows)) throw new Error('rows debe ser array');
  if (!rows.length)         return { ok: true, upserted: 0 };

  const ss    = _getSpreadsheet();
  const sheet = _ensureJsonSheet(ss, sheetName);
  const data  = sheet.getDataRange().getValues();

  const idMap = {};
  for (let i = 1; i < data.length; i++) {
    idMap[String(data[i][0])] = i + 1;
  }

  let upserted = 0;
  for (const row of rows) {
    const key    = String(row.id);
    const rowArr = [key, row.json ?? '', row.updatedAt ?? '', row.deleted ? 1 : 0];
    if (idMap[key]) {
      sheet.getRange(idMap[key], 1, 1, 4).setValues([rowArr]);
    } else {
      sheet.appendRow(rowArr);
      idMap[key] = sheet.getLastRow();
    }
    upserted++;
  }
  return { ok: true, upserted };
}
```

Reemplazar por:

```js
// Compara dos objetos ya parseados ignorando el campo 'updatedAt'.
function _jsonEqualIgnoringUpdatedAt(objA, objB) {
  const a = Object.assign({}, objA); delete a.updatedAt;
  const b = Object.assign({}, objB); delete b.updatedAt;
  return JSON.stringify(a) === JSON.stringify(b);
}

// Upsert de filas JSON por id. Solo estampa updatedAt del servidor cuando
// el contenido (dentro del blob json, sin contar el propio updatedAt)
// realmente cambio o la fila es nueva. El updatedAt se corrige tanto en
// la columna del sheet como DENTRO del blob json (ambos se usan para
// comparar en el merge del cliente — deben quedar sincronizados).
function _pushJsonRows({ sheetName, rows }) {
  if (!sheetName)           throw new Error('sheetName requerido');
  if (!Array.isArray(rows)) throw new Error('rows debe ser array');
  if (!rows.length)         return { ok: true, upserted: 0 };

  const ss    = _getSpreadsheet();
  const sheet = _ensureJsonSheet(ss, sheetName);
  const data  = sheet.getDataRange().getValues();
  const nowIso = new Date().toISOString();

  const idMap = {};
  for (let i = 1; i < data.length; i++) {
    idMap[String(data[i][0])] = i + 1;
  }

  let upserted = 0;
  for (const row of rows) {
    const key = String(row.id);
    const existingRowNum = idMap[key];
    let incomingParsed;
    try { incomingParsed = JSON.parse(row.json ?? '{}'); } catch (e) { incomingParsed = {}; }

    if (existingRowNum) {
      const existingJson = data[existingRowNum - 1][1];
      let existingParsed;
      try { existingParsed = JSON.parse(existingJson || '{}'); } catch (e) { existingParsed = {}; }

      if (_jsonEqualIgnoringUpdatedAt(existingParsed, incomingParsed)) {
        continue; // contenido identico, no tocar nada
      }
      incomingParsed.updatedAt = nowIso;
      const rowArr = [key, JSON.stringify(incomingParsed), nowIso, row.deleted ? 1 : 0];
      sheet.getRange(existingRowNum, 1, 1, 4).setValues([rowArr]);
    } else {
      incomingParsed.updatedAt = nowIso;
      const rowArr = [key, JSON.stringify(incomingParsed), nowIso, row.deleted ? 1 : 0];
      sheet.appendRow(rowArr);
      idMap[key] = sheet.getLastRow();
    }
    upserted++;
  }
  return { ok: true, upserted };
}
```

- [ ] **Step 2: Pegar en el editor de Apps Script y probar manualmente**

Crear función temporal de prueba, ejecutar desde el editor (▶ Ejecutar):

```js
function _testPushJsonRowsGuard() {
  const sheetName = 'TestPushJsonGuard';
  const ss = _getSpreadsheet();
  const old = ss.getSheetByName(sheetName);
  if (old) ss.deleteSheet(old);

  const record1 = { id: 999001, date: '2026-07-08', amount: 10, description: 'test', type: 'exp', category: 'x', notes: '', updatedAt: '2020-01-01T00:00:00.000Z' };
  _pushJsonRows({ sheetName, rows: [{ id: '999001', json: JSON.stringify(record1), updatedAt: record1.updatedAt, deleted: 0 }] });
  const sheet1 = _getSpreadsheet().getSheetByName(sheetName);
  const afterFirst = sheet1.getDataRange().getValues();
  const ts1 = afterFirst[1][2];
  const json1 = JSON.parse(afterFirst[1][1]);

  // Mismo contenido, updatedAt viejo distinto (simulando cliente desactualizado)
  _pushJsonRows({ sheetName, rows: [{ id: '999001', json: JSON.stringify(record1), updatedAt: '1999-01-01T00:00:00.000Z', deleted: 0 }] });
  const afterSecond = _getSpreadsheet().getSheetByName(sheetName).getDataRange().getValues();
  const ts2 = afterSecond[1][2];
  const json2 = JSON.parse(afterSecond[1][1]);

  Logger.log('ts1=' + ts1 + ' ts2=' + ts2 + ' columna igual=' + (ts1.getTime() === ts2.getTime()));
  Logger.log('json.updatedAt igual=' + (json1.updatedAt === json2.updatedAt));

  // Contenido distinto
  const record3 = Object.assign({}, record1, { amount: 20 });
  _pushJsonRows({ sheetName, rows: [{ id: '999001', json: JSON.stringify(record3), updatedAt: '1999-01-01T00:00:00.000Z', deleted: 0 }] });
  const afterThird = _getSpreadsheet().getSheetByName(sheetName).getDataRange().getValues();
  const ts3 = afterThird[1][2];

  Logger.log('ts3 distinto de ts2=' + (ts3.getTime() !== ts2.getTime()));

  ss.deleteSheet(_getSpreadsheet().getSheetByName(sheetName));
}
```

Esperado en el Registro de ejecución: `columna igual=true`, `json.updatedAt igual=true` (contenido idéntico no mueve el timestamp en ningún lado), y `ts3 distinto de ts2=true` (contenido distinto sí lo actualiza).

- [ ] **Step 3: Borrar la función de prueba**

Eliminar `_testPushJsonRowsGuard` del editor.

- [ ] **Step 4: Redesplegar**

`Implementar → Gestionar implementaciones → ✏️ → Versión: Nueva versión → Implementar`.

- [ ] **Step 5: Commit**

```bash
cd "D:\DOCUMENTOS\GestionFinancieraV2"
git add gas/Code.gs
git commit -m "fix(gas): _pushJsonRows solo estampa updatedAt de servidor si el contenido cambio"
```

---

### Task 9: Bump de versión de la app y verificación multi-dispositivo

**Files:**
- Modify: `D:\DOCUMENTOS\GestionFinancieraV2\cashmap_sw.js:3`
- Modify: `D:\DOCUMENTOS\GestionFinancieraV2\js\config.js:4`

- [ ] **Step 1: Revisar el número de versión actual**

```bash
grep -n "CACHE_NAME = " "D:\DOCUMENTOS\GestionFinancieraV2\cashmap_sw.js"
grep -n "APP_VERSION" "D:\DOCUMENTOS\GestionFinancieraV2\js\config.js"
```

- [ ] **Step 2: Incrementar ambos en 1 respecto al valor actual**

En `cashmap_sw.js`, cambiar `const CACHE_NAME = 'cashmap-v2-N';` a `'cashmap-v2-N+1'`.
En `js/config.js`, cambiar `const APP_VERSION  = 'v2-N';` a `'v2-N+1'`.

- [ ] **Step 3: Commit**

```bash
git add cashmap_sw.js js/config.js
git commit -m "chore(sw): bump cache tras rediseno de IDs y timestamps"
git push
```

- [ ] **Step 4: Verificación manual multi-dispositivo (checklist final)**

En PC: forzar recarga (Ctrl+Shift+R). En móvil: cerrar y reabrir la PWA (o recargar). En ambos, verificar en pantalla de login que "Versión app" muestre el nuevo número.

- [ ] **Step 5: Prueba de no-colisión — crear en ambos dispositivos casi simultáneamente**

Con ambos dispositivos abiertos y sincronizados al mismo menú compartido: crear un registro nuevo en PC y otro distinto en móvil dentro de la misma ventana de ~1 minuto, antes de que ninguno haga sync manual. Esperar el sync automático (o pulsar "↺ Sync" en ambos). Confirmar que **ambos registros aparecen** en ambos dispositivos, sin que ninguno sobreescriba al otro (antes de este fix, esto era exactamente el escenario de colisión).

- [ ] **Step 6: Prueba de timestamp estable — push repetido sin cambios**

En PC, con el menú compartido abierto: pulsar "↺ Sync" dos veces seguidas sin editar nada entre medio. En el Google Sheet del menú, columna `updatedAt` de los registros existentes: confirmar que **no cambia** entre el primer y el segundo sync (antes de este fix, cada sync completo re-estampaba todos los timestamps).

- [ ] **Step 7: Regresión — ocurrencias recurrentes siguen deduplicando**

`processRecurringTxs` no se tocó en este plan, pero ahora las plantillas recurrentes (creadas vía `addTx`/`addMenuTx`) tienen ids grandes (`genId()`) en vez de secuenciales pequeños. Confirmar que `_recurringOccurrenceId` sigue funcionando igual con esos ids grandes como `templateId`.

En consola del navegador, con la app cargada:

```js
const id1 = _recurringOccurrenceId(genId(), '2026-07-08');
const id2 = _recurringOccurrenceId(id1 /* reusa como templateId de prueba */, '2026-07-08');
console.log(typeof id1, id1 < 0, id1 === _recurringOccurrenceId(id1, '2026-07-08'));
```

Esperado: `"number" true true` — el hash sigue siendo determinista (mismo templateId+fecha produce siempre el mismo id) sin importar que el templateId ahora sea un número grande de `genId()`.

Además, crear manualmente una transacción recurrente ("mensual") con fecha de hoy en Inicio, recargar la página (dispara `processRecurringTxs` en el arranque), y confirmar en consola que no se creó ninguna copia todavía (la primera ocurrencia solo se genera cuando `recurringNext <= hoy`, que no es el caso el mismo día de creación) — esto solo confirma que no hay error de consola al procesar plantillas con ids grandes.
