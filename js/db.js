'use strict';

// ── App data (Inicio + custom menus) ─────────────────────
let _data = null;

// Ordena entradas [key, {label,...}] alfabeticamente por label, ignorando
// emojis/simbolos al inicio (ej. "🥚Huevo" ordena junto a la H, no por
// el codepoint del emoji). Usado en todo select/lista de categorias para
// que el orden sea siempre alfabetico, sin importar el orden de insercion.
function _sortCatEntries(entries) {
  const stripLeading = label => (label ?? '').replace(/^[^\p{L}\p{N}]+/u, '');
  return [...entries].sort((a, b) =>
    stripLeading(a[1]?.label).localeCompare(stripLeading(b[1]?.label), 'es', { sensitivity: 'base' })
  );
}

// Normaliza "H:mm" -> "HH:mm" con cero a la izquierda. Registros con hora
// guardada sin padding (ej. "8:50" en vez de "08:50") rompen la comparacion
// lexicografica usada para ordenar por date+time ("8:50" > "12:30" como
// string, aunque 8:50 sea cronologicamente anterior). Usado en todos los
// comparadores de orden por fecha/hora para blindar contra ese caso.
function _padTime(t) {
  if (!t) return '00:00';
  const [h, m] = String(t).split(':');
  return String(h ?? '0').padStart(2, '0') + ':' + String(m ?? '00').padStart(2, '0');
}

function loadData() {
  if (_data) return _data;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    _data = raw ? JSON.parse(raw) : null;
  } catch { _data = null; }
  if (!_data) _data = structuredClone(DEFAULT_DATA);
  // Bootstrap categories if first run
  if (!_data.globalCats || !Object.keys(_data.globalCats.inc ?? {}).length) {
    _data.globalCats = structuredClone(DEFAULT_CATS);
  }
  return _data;
}

function saveData() {
  if (!_data) return;
  localStorage.setItem(CACHE_KEY, JSON.stringify(_data));
  if (typeof scheduleAutosave === 'function') scheduleAutosave();
}

// Genera un id numerico grande semi-aleatorio: Date.now() (~13 digitos)
// combinado con un componente aleatorio de 3 digitos. Colisionar requiere
// que dos dispositivos generen un registro en el MISMO milisegundo Y
// saquen el MISMO numero aleatorio de 0 a 999 — practicamente
// imposible. El resultado (~1.78e15) queda dentro de Number.MAX_SAFE_INTEGER
// (~9.007e15), sin perdida de precision. Sigue siendo un Number plano:
// cero cambios en los onclick que insertan ids sin comillas en toda la app.
function genId() {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

// Fecha del registro/movimiento modificado mas recientemente en
// cualquier menu local (inicio, deudas, menus personalizados).
function getLastDataModification() {
  const d = loadData();
  let latest = '';
  const scan = arr => {
    for (const t of arr ?? []) {
      if (t.updatedAt && t.updatedAt > latest) latest = t.updatedAt;
    }
  };
  scan(d.inicio);
  scan(d.deudas);
  for (const m of d.customMenus ?? []) scan(m.data);
  return latest || null;
}

// ── Timezone helpers ──────────────────────────────────────
function getTimezone() {
  return loadData().config?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
}
function setTimezone(tz) {
  const d = loadData();
  if (!d.config) d.config = {};
  d.config.timezone = tz;
  saveData();
  if (typeof scheduleSave === 'function') scheduleSave();
}

// ── Saldo arrastrado de meses anteriores ──────────────────
// Suma (inc - exp) de todas las transacciones con fecha anterior al mes dado.
function carryoverBalance(txs, ym) {
  let bal = 0;
  for (const t of txs) {
    if ((t.date ?? '') < ym + '-01') {
      bal += t.type === 'inc' ? t.amount : -t.amount;
    }
  }
  return bal;
}

// ── Time format helpers (12h / 24h) ───────────────────────
function getTimeFormat() {
  return loadData().config?.timeFormat || '24h';
}
function setTimeFormat(fmt) {
  const d = loadData();
  if (!d.config) d.config = {};
  d.config.timeFormat = fmt;
  saveData();
  if (typeof scheduleSave === 'function') scheduleSave();
}
// Convierte "HH:mm" (24h, como se guarda internamente) al formato elegido para mostrar
function fmtTime(timeStr) {
  if (!timeStr) return '';
  if (getTimeFormat() !== '12h') return timeStr;
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return timeStr;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12    = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}
function _nowDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: getTimezone() });
}
function _nowYM() {
  return _nowDate().slice(0, 7);
}
function _nowTime() {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: getTimezone(), hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(new Date());
    const h = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10) % 24;
    const m = parts.find(p => p.type === 'minute')?.value ?? '00';
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  } catch {
    const now = new Date();
    return String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  }
}

// ── Transactions — Inicio ─────────────────────────────────
function getTxs() {
  return loadData().inicio;
}

function getTxsForMonth(ym) {
  return getTxs().filter(t => t.date.startsWith(ym));
}

function addTx(fields) {
  const d   = loadData();
  const txs = d.inicio;
  const id  = genId();
  const tx  = { id, ...fields, updatedAt: new Date().toISOString() };
  txs.push(tx);
  saveData();
  return tx;
}

function updateTx(id, fields) {
  const d   = loadData();
  const idx = d.inicio.findIndex(t => t.id === id);
  if (idx < 0) return;
  d.inicio[idx] = { ...d.inicio[idx], ...fields, updatedAt: new Date().toISOString() };
  saveData();
}

function deleteTx(id) {
  const d = loadData();
  d.inicio = d.inicio.filter(t => t.id !== id);
  saveData();
}

// ── Custom Menus ──────────────────────────────────────────
function getCustomMenus() {
  return loadData().customMenus ?? [];
}

function getCustomMenu(menuId) {
  return getCustomMenus().find(m => m.id === menuId) ?? null;
}

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

function updateCustomMenu(menuId, fields) {
  const d = loadData();
  const m = d.customMenus.find(m => m.id === menuId);
  if (!m) return;
  Object.assign(m, fields);
  saveData();
}

function deleteCustomMenu(menuId) {
  const d = loadData();
  d.customMenus = d.customMenus.filter(m => m.id !== menuId);
  d.navOrder    = d.navOrder.filter(k => k !== 'menu-' + menuId);
  saveData();
}

// ── Custom Menu Transactions ──────────────────────────────
function getMenuTxs(menuId) {
  return getCustomMenu(menuId)?.data ?? [];
}

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

function updateMenuTx(menuId, txId, fields) {
  const d   = loadData();
  const m   = d.customMenus.find(m => m.id === menuId);
  if (!m) return;
  const idx = m.data.findIndex(t => t.id === txId);
  if (idx < 0) return;
  m.data[idx] = { ...m.data[idx], ...fields, updatedAt: new Date().toISOString() };
  saveData();
}

function deleteMenuTx(menuId, txId) {
  const d = loadData();
  const m = d.customMenus.find(m => m.id === menuId);
  if (!m) return;
  m.data = m.data.filter(t => t.id !== txId);
  saveData();
}

// ── Share helpers ─────────────────────────────────────────
function shareMenu(menuId, sheetName, sharedWith) {
  const d = loadData();
  const m = d.customMenus.find(m => m.id === menuId);
  if (!m) return;
  Object.assign(m, { shared: true, sheetName, sharedWith, myRole: m.myRole ?? 'admin' });
  saveData();
}

function unshareMenu(menuId) {
  const d = loadData();
  const m = d.customMenus.find(m => m.id === menuId);
  if (!m) return;
  Object.assign(m, { shared: false, sheetName: null, sharedWith: [] });
  saveData();
}

function setMenuLastPulled(menuId, ts) {
  const d = loadData();
  const m = d.customMenus.find(m => m.id === menuId);
  if (!m) return;
  m.lastPulledAt = ts;
  saveData();
}

// LWW merge — remote rows with newer updatedAt win
function mergeMenuRows(menuId, remoteRows) {
  const d = loadData();
  const m = d.customMenus.find(m => m.id === menuId);
  if (!m) return;

  const map = new Map(m.data.map(r => [String(r.id), { ...r }]));

  for (const remote of remoteRows) {
    const key      = String(remote.id);
    const local    = map.get(key);
    const remoteTs = remote.updatedAt ? new Date(remote.updatedAt).getTime() : 0;
    const localTs  = local?.updatedAt ? new Date(local.updatedAt).getTime() : 0;

    if (!local) {
      if (!Number(remote.deleted)) map.set(key, _gasRowToTx(remote));
    } else if (remoteTs >= localTs) {
      // En empate gana el servidor: permite que datos re-normalizados en
      // GAS (ej. campo time corregido) lleguen aunque updatedAt no cambió
      if (Number(remote.deleted)) map.delete(key);
      else map.set(key, _gasRowToTx(remote));
    }
  }

  m.data = [...map.values()];
  const maxId = m.data.reduce((mx, t) => Math.max(mx, t.id), 0);
  if (m.nextDataId <= maxId) m.nextDataId = maxId + 1;
  saveData();
}

function _gasRowToTx(row) {
  const tx = {
    id:          parseInt(row.id, 10),
    date:        String(row.date || '').slice(0, 10),
    amount:      parseFloat(row.amount) || 0,
    description: String(row.description || ''),
    type:        String(row.type || 'exp'),
    category:    String(row.category || ''),
    notes:       String(row.notes || ''),
    updatedAt:   String(row.updatedAt || '')
  };
  if (row.time)          tx.time          = String(row.time);
  if (row.recurring)     tx.recurring     = String(row.recurring);
  if (row.recurringNext) tx.recurringNext = String(row.recurringNext);
  return tx;
}

// ── Shared Deudas Menus ───────────────────────────────────
function getSharedDeudasMenus() {
  return loadData().sharedDeudasMenus ?? [];
}

function getSharedDeudasMenu(id) {
  return getSharedDeudasMenus().find(m => m.id === id) ?? null;
}

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

function updateSharedDeudasMenu(id, fields) {
  const d = loadData();
  const m = (d.sharedDeudasMenus ?? []).find(m => m.id === id);
  if (!m) return;
  Object.assign(m, fields);
  saveData();
}

function deleteSharedDeudasMenu(id) {
  const d = loadData();
  d.sharedDeudasMenus = (d.sharedDeudasMenus ?? []).filter(m => m.id !== id);
  d.navOrder = d.navOrder.filter(k => k !== 'sdeudas-' + id);
  saveData();
}

// ── Import from v1 / backup JSON ──────────────────────────
function importV1Data(raw) {
  const isV1 = Array.isArray(raw.txs);
  const isV2 = raw.version === 2 || Array.isArray(raw.inicio);
  if (!isV1 && !isV2) throw new Error('Formato no reconocido');

  const d = loadData();
  const stats = { txs: 0, menus: 0, menuTxs: 0 };

  // ── Transacciones principales ─────────────────────────
  const srcTxs = isV1 ? (raw.txs ?? []) : (raw.inicio ?? []);
  let nextTxId = d.inicio.length ? Math.max(...d.inicio.map(t => t.id)) + 1 : 1;
  for (const tx of srcTxs) {
    d.inicio.push({
      id:          nextTxId++,
      date:        String(tx.date || '').slice(0, 10),
      amount:      Number(tx.amount) || 0,
      description: String(tx.description || ''),
      type:        _normType(tx.type),
      category:    String(tx.category || ''),
      notes:       String(tx.notes || '')
    });
    stats.txs++;
  }

  // ── Categorías — merge sin sobreescribir ──────────────
  if (raw.globalCats) {
    for (const type of ['inc', 'exp']) {
      if (!d.globalCats[type]) d.globalCats[type] = {};
      for (const [key, cat] of Object.entries(raw.globalCats[type] ?? {})) {
        if (!d.globalCats[type][key]) d.globalCats[type][key] = cat;
      }
    }
  }

  // ── Presupuestos — merge sin sobreescribir ────────────
  if (raw.budgets) {
    for (const [key, val] of Object.entries(raw.budgets)) {
      if (!d.budgets[key]) d.budgets[key] = val;
    }
  }

  // ── Menús personalizados ──────────────────────────────
  let nextMenuId = d.customMenus.length ? Math.max(...d.customMenus.map(m => m.id)) + 1 : 1;
  for (const menu of (raw.customMenus ?? [])) {
    const newMenuId = nextMenuId++;
    let nextDataId  = 1;
    const data = (menu.data ?? []).map(tx => ({
      id:          nextDataId++,
      date:        String(tx.date || '').slice(0, 10),
      amount:      Number(tx.amount) || 0,
      description: String(tx.description || ''),
      type:        _normType(tx.type),
      category:    String(tx.category || ''),
      notes:       String(tx.notes || ''),
      updatedAt:   tx.updatedAt ?? new Date().toISOString()
    }));
    d.customMenus.push({
      id: newMenuId, name: menu.name, icon: menu.icon ?? '📋',
      currency: menu.currency ?? '€', data, nextDataId, shared: false
    });
    d.navOrder.push('menu-' + newMenuId);
    stats.menus++;
    stats.menuTxs += data.length;
  }

  // ── Deudas (v1) ──────────────────────────────────────
  if (raw.deudas?.length) {
    if (!d.deudas) d.deudas = [];
    let nextDeudaId = d.deudas.length ? Math.max(...d.deudas.map(x => x.id)) + 1 : 1;
    for (const dv1 of raw.deudas) {
      d.deudas.push({
        id:          nextDeudaId++,
        date:        String(dv1.date || '').slice(0, 10),
        amount:      Number(dv1.amount) || 0,
        persona:     String(dv1.persona || ''),
        description: String(dv1.description || ''),
        type:        dv1.type === 'por_pagar' ? 'por_pagar' : 'por_cobrar',
        status:      dv1.status ?? 'pendiente',
        notes:       String(dv1.notes || ''),
        currency:    String(dv1.currency || '$'),
        paid:        Number(dv1.paid) || 0,
        payments:    (dv1.payments ?? []).map(p => ({
          datetime: p.datetime ?? p.date ?? '',
          amount:   Number(p.amount) || 0,
          notes:    String(p.notes || '')
        })),
        updatedAt:   dv1.updatedAt ?? new Date().toISOString()
      });
      stats.deudas = (stats.deudas ?? 0) + 1;
    }
  }

  // ── homeTxs (v1) → menú "Hogar (importado)" ──────────
  if (isV1 && raw.homeTxs?.length) {
    const newMenuId = nextMenuId++;
    let nextDataId  = 1;
    const data = raw.homeTxs.map(tx => ({
      id:          nextDataId++,
      date:        String(tx.date || '').slice(0, 10),
      amount:      Number(tx.amount) || 0,
      description: String(tx.description || ''),
      type:        _normType(tx.type),
      category:    String(tx.category || ''),
      notes:       String(tx.notes || ''),
      updatedAt:   new Date().toISOString()
    }));
    d.customMenus.push({
      id: newMenuId, name: 'Hogar (importado)', icon: '🏠',
      currency: '€', data, nextDataId, shared: false
    });
    d.navOrder.push('menu-' + newMenuId);
    stats.menus++;
    stats.menuTxs += data.length;
  }

  saveData();
  return stats;
}

// ── Normalizar tipo v1→v2 ────────────────────────────────
function _normType(t) {
  if (t === 'income')  return 'inc';
  if (t === 'expense') return 'exp';
  return (t === 'inc' || t === 'exp') ? t : 'exp';
}

// Migración única: corrige income/expense guardados en localStorage
function migrateTypes() {
  const d = loadData();
  let changed = false;
  for (const tx of d.inicio) {
    const fixed = _normType(tx.type);
    if (fixed !== tx.type) { tx.type = fixed; changed = true; }
  }
  for (const m of d.customMenus) {
    for (const tx of m.data) {
      // Registros de vehículo (combustible/aceite/mantenimiento) no tienen
      // `type` a propósito — su monto vive en totalCost/cost, no en amount.
      // Forzarles type:'exp' aquí los hace contar como gasto sin poder leer
      // su monto real, produciendo NaN en las tarjetas de Vista General.
      if (tx.entryType) continue;
      const fixed = _normType(tx.type);
      if (fixed !== tx.type) { tx.type = fixed; changed = true; }
    }
  }
  if (changed) saveData();
}

// Corrige registros con time guardado sin cero a la izquierda (ej. "8:50"
// en vez de "08:50") -- dato historico de una fuente/version anterior que
// rompia el orden cronologico por comparacion de texto.
function migrateTimePadding() {
  const d = loadData();
  let changed = false;
  let inicioChanged = false;
  const affectedMenuIds = [];
  const fix = tx => {
    if (tx.time) {
      const padded = _padTime(tx.time);
      if (padded !== tx.time) { tx.time = padded; return true; }
    }
    return false;
  };
  for (const tx of d.inicio) if (fix(tx)) { changed = true; inicioChanged = true; }
  for (const m of d.customMenus) {
    let menuChanged = false;
    for (const tx of m.data) if (fix(tx)) { changed = true; menuChanged = true; }
    if (menuChanged) affectedMenuIds.push(m.id);
  }
  if (changed) saveData();
  return { inicioChanged, affectedMenuIds };
}

// ── Recurrencia ───────────────────────────────────────────
function nextOccurrence(dateStr, period) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T12:00:00');
  if (isNaN(d.getTime())) return null;
  if (period === 'semanal')      d.setDate(d.getDate() + 7);
  else if (period === 'mensual') d.setMonth(d.getMonth() + 1);
  else if (period === 'anual')   d.setFullYear(d.getFullYear() + 1);
  else return null;
  return d.toISOString().slice(0, 10);
}

// Hash determinístico string→entero (DJB2). Usado para IDs de ocurrencias
// recurrentes: mismo templateId+fecha siempre produce el mismo id, sin
// importar en qué dispositivo se genere — evita duplicados al sincronizar.
function _djb2(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

// Negativo y con prefijo fijo: nunca colisiona con ids reales (positivos,
// secuenciales o basados en Date.now()).
function _recurringOccurrenceId(templateId, due) {
  return -Math.abs(_djb2(`recur_${templateId}_${due}`)) - 1;
}

function processRecurringTxs() {
  const d     = loadData();
  const today = new Date().toISOString().slice(0, 10);
  const now   = new Date().toISOString();
  let changed = false;

  // Inicio txs
  d.inicio.filter(t => t.recurring && t.recurringNext).forEach(t => {
    while (t.recurringNext && t.recurringNext <= today) {
      const due = t.recurringNext;
      const occId = _recurringOccurrenceId(t.id, due);
      if (!d.inicio.some(x => x.id === occId)) {
        const { recurringNext: _rn, ...base } = t;
        d.inicio.push({ ...base, id: occId, date: due, updatedAt: now, templateId: t.id });
        changed = true;
      }
      t.recurringNext = nextOccurrence(due, t.recurring);
    }
  });

  // Custom menu txs
  const affectedMenuIds = [];
  for (const m of d.customMenus) {
    let menuChanged = false;
    m.data.filter(t => t.recurring && t.recurringNext).forEach(t => {
      while (t.recurringNext && t.recurringNext <= today) {
        const due = t.recurringNext;
        const occId = _recurringOccurrenceId(`${m.id}_${t.id}`, due);
        if (!m.data.some(x => x.id === occId)) {
          const { recurringNext: _rn, ...base } = t;
          m.data.push({ ...base, id: occId, date: due, updatedAt: now, templateId: t.id });
          changed = true;
          menuChanged = true;
        }
        t.recurringNext = nextOccurrence(due, t.recurring);
      }
    });
    if (menuChanged) affectedMenuIds.push(m.id);
  }

  if (changed) saveData();
  return affectedMenuIds;
}

// ── Gestión de plantillas recurrentes ─────────────────────
// Una plantilla real tiene recurring+recurringNext (o está pausada) Y no
// tiene templateId — las ocurrencias que processRecurringTxs() materializa
// heredan `recurring` de la plantilla (solo se les quita recurringNext) y
// llevan templateId apuntando a su origen, así que sin este filtro cada
// ocurrencia histórica ya generada se contaba como "plantilla duplicada".
function _isRecurringTemplate(t) {
  return !!t.recurring && t.templateId == null && (!!t.recurringNext || !!t.recurringPaused);
}

function getAllRecurringTemplates() {
  const d = loadData();
  const items = [];

  d.inicio.filter(_isRecurringTemplate).forEach(t => {
    items.push({ ...t, menuId: null, menuName: 'Inicio' });
  });

  d.customMenus.forEach(m => {
    (m.data ?? []).filter(t => !t._deleted && _isRecurringTemplate(t)).forEach(t => {
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
      recurring: tx.recurring,
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

// ── Import transactions into a specific menu ──────────────
function importMenuTxs(menuId, rawTxs) {
  const d = loadData();
  const m = d.customMenus.find(m => m.id === menuId);
  if (!m) return 0;
  let count  = 0;
  for (const tx of rawTxs) {
    const date = String(tx.date || '').slice(0, 10);
    if (!date) continue;
    m.data.push({
      id:          genId(),
      date,
      amount:      Number(tx.amount) || 0,
      description: String(tx.description || ''),
      type:        _normType(tx.type),
      category:    String(tx.category || ''),
      notes:       String(tx.notes || ''),
      updatedAt:   new Date().toISOString()
    });
    count++;
  }
  saveData();
  return count;
}

// ── Merge globalCats from external JSON ───────────────────
function mergeImportedCats(raw) {
  if (!raw.globalCats) return;
  const d = loadData();
  for (const side of ['inc', 'exp']) {
    if (!d.globalCats[side]) d.globalCats[side] = {};
    for (const [key, cat] of Object.entries(raw.globalCats[side] ?? {})) {
      if (!d.globalCats[side][key]) d.globalCats[side][key] = cat;
    }
  }
  saveData();
}

// ── Presupuestos ──────────────────────────────────────────
function getBudgets() {
  return loadData().budgets ?? {};
}

function setBudget(catKey, monthly) {
  const d = loadData();
  if (!d.budgets) d.budgets = {};
  if (!monthly || monthly <= 0) delete d.budgets[catKey];
  else d.budgets[catKey] = { monthly };
  saveData();
}
