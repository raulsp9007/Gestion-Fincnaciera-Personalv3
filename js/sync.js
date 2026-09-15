'use strict';

let _syncInterval = null;
let _isSyncing    = false;

// ── Start (called from startApp) ──────────────────────────
function startSync() {
  _setupVisibilityListener();
  if (getGasUrl()) {
    connectAndSync();
    _startPoll();
  }
}

function _setupVisibilityListener() {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearInterval(_syncInterval);
      _syncInterval = null;
    } else if (getGasUrl()) {
      _startPoll();
      _pullSharedConfig().catch(() => {});
      if (_hasSharedMenus()) syncAllSharedMenus();
      syncPrivateData().catch(() => {});
      syncSharedDeudas().catch(() => {});
    }
  });
}

function _startPoll() {
  clearInterval(_syncInterval);
  const ms = document.hidden ? POLL_INTERVAL_BACKGROUND : POLL_INTERVAL_VISIBLE;
  _syncInterval = setInterval(() => {
    _pullSharedConfig().catch(() => {});
    if (_hasSharedMenus()) syncAllSharedMenus();
    syncPrivateData().catch(() => {});
    syncSharedDeudas().catch(() => {});
  }, ms);
}

function _hasSharedMenus() {
  return getCustomMenus().some(m => m.shared && m.sheetName);
}

// ── Connect + pull config ─────────────────────────────────
async function connectAndSync() {
  if (!getGasUrl() || !currentUser) return;
  try {
    setSyncBadge('saving');
    await _pullSharedConfig();
    // Admin re-pushes config to keep menuType/vehicleInfo in sync for other devices
    if (currentUser.role === 'admin' && getCustomMenus().some(m => m.shared && m.sheetName)) {
      await pushSharedConfig();
    }
    await syncAllSharedMenus();
    await syncPrivateData();
    await syncSharedDeudas();
    setSyncBadge('ok');
  } catch (e) {
    setSyncBadge('error');
    console.error('[connectAndSync]', e.message, e);
    showToast('Error sync: ' + e.message, 'var(--red)');
  }
}

async function _pullSharedConfig() {
  const r   = await callGas('getConfig');
  const raw = r.config?.shared_menus;
  if (!raw) return;

  let sharedMenus;
  try { sharedMenus = JSON.parse(raw); } catch { return; }

  const d = loadData();
  let changed = false;

  const gasId    = (typeof getGasIdentity === 'function') ? getGasIdentity() : null;
  const userName = (gasId?.username ?? currentUser?.name ?? '').toLowerCase();
  const isAdmin  = currentUser?.role === 'admin';

  for (const sm of sharedMenus) {
    const access = sm.sharedWith?.find(u => (u.name ?? '').toLowerCase() === userName);
    if (!access && !isAdmin) continue;

    const existing = d.customMenus.find(m => m.sheetName === sm.sheetName);
    if (!existing) {
      const id = genId();
      d.customMenus.push({
        id, name: sm.name, icon: sm.icon ?? '📋',
        currency: sm.currency ?? '€', data: [], nextDataId: 1,
        shared: true, sheetName: sm.sheetName,
        myRole: access?.role ?? 'admin', sharedWith: sm.sharedWith ?? [],
        menuType: sm.menuType ?? 'normal',
        vehicleInfo: sm.vehicleInfo ?? null,
        lastPulledAt: null
      });
      d.navOrder.push('menu-' + id);
      changed = true;
    } else {
      // Actualizar campos de metadata que pueden cambiar
      if (sm.menuType && existing.menuType !== sm.menuType) { existing.menuType = sm.menuType; changed = true; }
      if (sm.vehicleInfo !== undefined && JSON.stringify(existing.vehicleInfo) !== JSON.stringify(sm.vehicleInfo)) {
        existing.vehicleInfo = sm.vehicleInfo;
        changed = true;
      }
    }
  }

  // Eliminar menús compartidos que ya no están en el servidor (descompartidos)
  const remoteSheets = new Set(sharedMenus.map(sm => sm.sheetName));
  const toRemove     = d.customMenus.filter(m => m.shared && m.sheetName && !remoteSheets.has(m.sheetName));
  if (toRemove.length) {
    const removeIds = new Set(toRemove.map(m => m.id));
    d.customMenus   = d.customMenus.filter(m => !removeIds.has(m.id));
    d.navOrder      = d.navOrder.filter(k => {
      const num = parseInt(k.replace('menu-', ''), 10);
      return isNaN(num) || !removeIds.has(num);
    });
    changed = true;
  }

  // ── Shared Deudas ─────────────────────────────────────
  const rawDeudas = r.config?.shared_deudas;
  if (rawDeudas) {
    let sdList;
    try { sdList = JSON.parse(rawDeudas); if (!Array.isArray(sdList)) sdList = [sdList]; }
    catch { sdList = []; }

    if (!d.sharedDeudasMenus) d.sharedDeudasMenus = [];

    for (const sd of sdList) {
      const access = sd.sharedWith?.find(u => u.name?.toLowerCase() === userName?.toLowerCase());
      if (!access && !isAdmin) continue;
      const existing = d.sharedDeudasMenus.find(m => m.sheetName === sd.sheetName);
      if (!existing) {
        const id = genId();
        d.sharedDeudasMenus.push({
          id, name: sd.name, sheetName: sd.sheetName,
          myRole: access?.role ?? 'admin', sharedWith: sd.sharedWith ?? [],
          data: [], lastPulledAt: null
        });
        d.navOrder.push('sdeudas-' + id);
        changed = true;
      }
    }

    const remoteSDSheets = new Set(sdList.map(sd => sd.sheetName));
    const toRemoveSD = d.sharedDeudasMenus.filter(m => m.sheetName && !remoteSDSheets.has(m.sheetName));
    if (toRemoveSD.length) {
      const removeIds = new Set(toRemoveSD.map(m => m.id));
      d.sharedDeudasMenus = d.sharedDeudasMenus.filter(m => !removeIds.has(m.id));
      d.navOrder = d.navOrder.filter(k => {
        const num = parseInt(k.replace('sdeudas-', ''), 10);
        return isNaN(num) || !removeIds.has(num);
      });
      changed = true;
    }
  }

  if (changed) { saveData(); buildNav(); }
}

// ── Pull all shared menus ─────────────────────────────────
async function syncAllSharedMenus() {
  if (_isSyncing) return;
  _isSyncing = true;
  try {
    for (const menu of getCustomMenus().filter(m => m.shared && m.sheetName)) {
      await _syncOneMenu(menu);
    }
  } finally {
    _isSyncing = false;
  }
}

async function _syncOneMenu(menu) {
  if (!menu.sheetName) return;
  try {
    const r = await callGas('pullRows', { sheetName: menu.sheetName, since: menu.lastPulledAt });
    if (!r.rows?.length) return;
    mergeMenuRows(menu.id, r.rows);
    setMenuLastPulled(menu.id, r.pulledAt);
    if (typeof _currentView !== 'undefined' && _currentView === 'menu-' + menu.id) {
      renderCustomMenu(menu.id);
    }
    setSyncBadge('ok');
  } catch (e) {
    console.error('[_syncOneMenu]', menu.sheetName, e.message);
    setSyncBadge('error');
  }
}

// ── Push a menu's records to GAS ──────────────────────────
async function pushMenuToGas(menuId) {
  const menu = getCustomMenu(menuId);
  if (!menu?.shared || !menu.sheetName) return;
  setSyncBadge('saving');
  const rows = menu.data.map(tx => ({ ...tx, deleted: 0, updatedBy: currentUser?.name ?? '' }));
  await callGas('pushRows', { sheetName: menu.sheetName, rows });
  setSyncBadge('ok');
}

// ── Push single-record save ───────────────────────────────
// Pull+merge primero (respeta tombstones remotos vía mergeMenuRows) antes de
// empujar. Sin esto, pushMenuToGas sube TODO el array local con deleted:0
// fijo — si este dispositivo aún conserva localmente una fila que otro
// dispositivo ya borró (nunca hizo pull desde entonces), la resucita en el
// servidor sin querer, en cuanto guarda cualquier cosa en el menú.
async function onMenuSaved(menuId) {
  if (!getGasUrl()) return;
  try {
    const menu = getCustomMenu(menuId);
    if (menu?.shared && menu.sheetName) {
      const r = await callGas('pullRows', { sheetName: menu.sheetName, since: menu.lastPulledAt });
      if (r.rows?.length) {
        mergeMenuRows(menuId, r.rows);
        setMenuLastPulled(menuId, r.pulledAt);
        if (typeof _currentView !== 'undefined' && _currentView === 'menu-' + menuId) {
          renderCustomMenu(menuId);
        }
      }
    }
    await pushMenuToGas(menuId);
  } catch { setSyncBadge('error'); }
}

// ── Push delete to GAS ────────────────────────────────────
async function pushDeleteToGas(menuId, txId) {
  const menu = getCustomMenu(menuId);
  if (!menu?.shared || !menu.sheetName || !getGasUrl()) return;
  try {
    await callGas('deleteRow', { sheetName: menu.sheetName, id: txId, updatedBy: currentUser?.name ?? '' });
  } catch { /* non-fatal */ }
}

// ── Push shared config to _config sheet ──────────────────
async function pushSharedConfig() {
  const sharedMenus = getCustomMenus()
    .filter(m => m.shared && m.sheetName)
    .map(m => ({ sheetName: m.sheetName, name: m.name, icon: m.icon, currency: m.currency, sharedWith: m.sharedWith ?? [], menuType: m.menuType ?? 'normal', vehicleInfo: m.vehicleInfo ?? null }));
  await callGas('setConfig', { key: 'shared_menus', value: JSON.stringify(sharedMenus) });
}

// ── Full sync de un menú compartido (pull todo + merge + push) ──
// Orden importa: pull primero evita que un push con cache local stale
// (ej. campo time vacio por bug ya corregido) sobreescriba datos buenos
// que ya estan en el servidor.
async function forceFullMenuSync(menuId) {
  const menu = getCustomMenu(menuId);
  if (!menu?.shared || !menu.sheetName || !getGasUrl()) return;
  try {
    setSyncBadge('saving');
    showToast('Sincronizando…', 'var(--text2)');
    // 1. Bajar TODOS los registros sin filtro de fecha y mergear primero
    const r = await callGas('pullRows', { sheetName: menu.sheetName });
    if (r.rows?.length) {
      mergeMenuRows(menuId, r.rows);
      setMenuLastPulled(menuId, r.pulledAt);
    }
    // 2. Subir registros locales (ahora ya actualizados con lo del servidor)
    await pushMenuToGas(menuId);
    setSyncBadge('ok');
    if (typeof renderCustomMenu === 'function') renderCustomMenu(menuId);
    showToast('Sync completo ✓');
  } catch (e) {
    setSyncBadge('error');
    showToast('Error sync: ' + e.message, 'var(--red)');
  }
}

// ── Manual sync button ────────────────────────────────────
async function forceSyncNow() {
  if (!getGasUrl()) { showToast('Configura la URL de GAS primero', 'var(--yellow)'); return; }
  try {
    await connectAndSync();
    // Re-push shared config to ensure menuType/vehicleInfo reach other devices
    if (getCustomMenus().some(m => m.shared && m.sheetName)) {
      await pushSharedConfig();
    }
    showToast('Sincronizado');
  } catch (e) {
    showToast('Error: ' + e.message, 'var(--red)');
  }
}

// ── Shared Deudas sync ────────────────────────────────────
// Pull completo (sin delta): el servidor es la fuente de verdad.
// Reemplaza menu.data en local con lo que devuelve el servidor.
async function syncSharedDeudas(menuId) {
  const menus = menuId
    ? [getSharedDeudasMenu(menuId)].filter(Boolean)
    : getSharedDeudasMenus();
  if (!menus.length || !getGasUrl()) return;
  for (const menu of menus) {
    if (!menu.sheetName) continue;
    try {
      const r = await callGas('pullJsonRows', { sheetName: menu.sheetName });
      if (!r.rows) continue;
      const d = loadData();
      const m = (d.sharedDeudasMenus ?? []).find(m => m.id === menu.id);
      if (!m) continue;
      // Reemplazar completamente — servidor manda la verdad
      m.data = r.rows
        .filter(row => !row.deleted)
        .map(row => row.parsed)
        .filter(Boolean);
      saveData();
      if (typeof _currentView !== 'undefined' && _currentView === 'sdeudas-' + menu.id) {
        renderDeudas();  // sin arg — _deudaSource ya está seteado, evita re-trigger de sync
      }
    } catch { /* non-fatal */ }
  }
}

// Push de un registro (add/edit): sube la fila al servidor, luego re-pull.
async function pushSharedDeudas(menuId) {
  const menu = getSharedDeudasMenu(menuId);
  if (!menu?.sheetName || !getGasUrl()) return;
  setSyncBadge('saving');
  const rows = menu.data.map(r => ({
    id:        String(r.id),
    json:      JSON.stringify(r),
    updatedAt: r.updatedAt ?? new Date().toISOString(),
    deleted:   0
  }));
  if (rows.length) await callGas('pushJsonRows', { sheetName: menu.sheetName, rows });
  await syncSharedDeudas(menuId);
  setSyncBadge('ok');
}

// Push de eliminación: marca la fila como deleted en servidor ANTES de borrarla localmente.
async function pushSharedDeudasDelete(menuId, deuda) {
  const menu = getSharedDeudasMenu(menuId);
  if (!menu?.sheetName || !getGasUrl()) return;
  setSyncBadge('saving');
  await callGas('pushJsonRows', {
    sheetName: menu.sheetName,
    rows: [{
      id:        String(deuda.id),
      json:      JSON.stringify(deuda),
      updatedAt: new Date().toISOString(),
      deleted:   1
    }]
  });
  setSyncBadge('ok');
}

async function pushSharedDeudasConfig() {
  const list = getSharedDeudasMenus()
    .filter(m => m.sheetName)
    .map(m => ({ sheetName: m.sheetName, name: m.name, sharedWith: m.sharedWith ?? [] }));
  await callGas('setConfig', { key: 'shared_deudas', value: JSON.stringify(list) });
}

// ── Private data sync (inicio + deudas por usuario) ──────
let _privateSyncing = false;

async function syncPrivateData() {
  const gasId = (typeof getGasIdentity === 'function') ? getGasIdentity() : null;
  if (!gasId?.username || !getGasUrl() || _privateSyncing) return;
  _privateSyncing = true;
  try {
    const u = gasId.username;
    await _syncPrivateSheet(`_inicio_${u}`, 'inicio');
    await _syncPrivateSheet(`_deudas_${u}`, 'deudas');
  } finally {
    _privateSyncing = false;
  }
}

async function _syncPrivateSheet(sheetName, dataKey) {
  const d     = loadData();
  const local = d[dataKey] ?? [];

  // 1. Enviar tombstones pendientes
  const tombstones = _getPrivateTombstones()[dataKey] ?? [];
  for (const id of [...tombstones]) {
    try {
      await callGas('deleteJsonRow', { sheetName, id: String(id) });
      _clearPrivateTombstone(dataKey, id);
    } catch { /* non-fatal */ }
  }

  // 2. Subir registros locales
  if (local.length) {
    const rows = local.map(r => ({
      id:        String(r.id),
      json:      JSON.stringify(r),
      updatedAt: r.updatedAt ?? new Date().toISOString(),
      deleted:   0
    }));
    await callGas('pushJsonRows', { sheetName, rows });
  }

  // 3. Bajar registros remotos
  const r = await callGas('pullJsonRows', { sheetName });
  if (!r.rows?.length) return;

  // 4. Merge LWW — remote gana si updatedAt es mayor
  const changed = _mergePrivateRows(d, dataKey, local, r.rows);
  if (changed) {
    saveData();
    if (dataKey === 'inicio' && typeof renderInicio === 'function') {
      if (typeof processRecurringTxs === 'function') {
        const affectedMenus = processRecurringTxs();
        if (affectedMenus?.length) affectedMenus.forEach(id => onMenuSaved(id).catch(() => {}));
      }
      renderInicio();
    }
    if (dataKey === 'deudas' && typeof renderDeudas === 'function') renderDeudas();
  }
}

function _mergeSharedDeudasRows(menu, remoteRows) {
  const map = new Map(menu.data.map(r => [String(r.id), r]));
  let changed = false;
  for (const row of remoteRows) {
    const remId = String(row.id);
    if (row.deleted) { if (map.has(remId)) { map.delete(remId); changed = true; } continue; }
    if (!row.parsed) continue;
    const existing = map.get(remId);
    if (!existing) { map.set(remId, row.parsed); changed = true; }
    else if ((row.updatedAt ?? '') > (existing.updatedAt ?? '')) { map.set(remId, row.parsed); changed = true; }
  }
  if (changed) menu.data = [...map.values()];
  return changed;
}

function _mergePrivateRows(data, dataKey, local, remoteRows) {
  const map = new Map(local.map(r => [String(r.id), r]));
  let changed = false;

  for (const row of remoteRows) {
    const remId = String(row.id);
    if (row.deleted) {
      if (map.has(remId)) { map.delete(remId); changed = true; }
      continue;
    }
    if (!row.parsed) continue;

    const existing = map.get(remId);
    if (!existing) {
      map.set(remId, row.parsed);
      changed = true;
    } else {
      const remTs = row.updatedAt ?? '';
      const locTs = existing.updatedAt ?? '';
      if (remTs > locTs) { map.set(remId, row.parsed); changed = true; }
    }
  }

  if (changed) data[dataKey] = [...map.values()];
  return changed;
}

// ── Tombstones locales (registros eliminados pendientes de subir) ─
const _TOMB_KEY = 'cashmap_v2_tombstones';

function _getPrivateTombstones() {
  try { return JSON.parse(localStorage.getItem(_TOMB_KEY) || '{}'); } catch { return {}; }
}

function markDeletedForSync(dataKey, id) {
  const t = _getPrivateTombstones();
  if (!t[dataKey]) t[dataKey] = [];
  if (!t[dataKey].includes(id)) t[dataKey].push(id);
  localStorage.setItem(_TOMB_KEY, JSON.stringify(t));
}

function _clearPrivateTombstone(dataKey, id) {
  const t = _getPrivateTombstones();
  if (t[dataKey]) t[dataKey] = t[dataKey].filter(x => x !== id);
  localStorage.setItem(_TOMB_KEY, JSON.stringify(t));
}

// ── Sync badge ────────────────────────────────────────────
function setSyncBadge(state) {
  const badge = document.getElementById('sync-badge');
  const lbl   = document.getElementById('sync-lbl');
  if (!badge || !lbl) return;
  const map = {
    local:  { cls: 'local',  txt: 'Local' },
    saving: { cls: 'saving', txt: 'Guardando…' },
    ok:     { cls: 'ok',     txt: 'Sincronizado' },
    error:  { cls: 'error',  txt: 'Error sync' },
  };
  const s = map[state] ?? map.local;
  badge.className = s.cls;
  lbl.textContent = s.txt;
}
