'use strict';

const AUTOSAVE_KEY = 'cashmap_v2_autosave';
const _AS_DB       = 'cashmap_v2_fs';
const _AS_STORE    = 'handles';

// ── Config ────────────────────────────────────────────────
function getAutosaveConfig() {
  try { return JSON.parse(localStorage.getItem(AUTOSAVE_KEY) || '{}'); }
  catch { return {}; }
}

function _saveAutosaveConfig(cfg) {
  localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(cfg));
}

// ── IndexedDB — persiste el directory handle entre sesiones ─
async function _getDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(_AS_DB, 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore(_AS_STORE);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

async function _saveDirHandle(handle) {
  const db = await _getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(_AS_STORE, 'readwrite');
    tx.objectStore(_AS_STORE).put(handle, 'autosave-dir');
    tx.oncomplete = resolve;
    tx.onerror    = e => reject(e.target.error);
  });
}

async function _loadDirHandle() {
  try {
    const db = await _getDb();
    return await new Promise((resolve, reject) => {
      const tx  = db.transaction(_AS_STORE, 'readonly');
      const req = tx.objectStore(_AS_STORE).get('autosave-dir');
      req.onsuccess = e => resolve(e.target.result ?? null);
      req.onerror   = e => reject(e.target.error);
    });
  } catch { return null; }
}

async function _clearDirHandle() {
  const db = await _getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(_AS_STORE, 'readwrite');
    tx.objectStore(_AS_STORE).delete('autosave-dir');
    tx.oncomplete = resolve;
    tx.onerror    = e => reject(e.target.error);
  });
}

// ── Folder selection (File System Access API) ─────────────
function hasFileSystemAccess() {
  return typeof window.showDirectoryPicker === 'function';
}

async function selectAutosaveFolder() {
  if (!hasFileSystemAccess()) {
    showToast('Tu navegador no soporta selección de carpeta. Se usará la carpeta de descargas.', 'var(--yellow)');
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await _saveDirHandle(handle);
    const cfg = getAutosaveConfig();
    cfg.folderName = handle.name;
    _saveAutosaveConfig(cfg);
    renderAutosaveSection();
    showToast(`Carpeta "${handle.name}" seleccionada ✓`);
  } catch (e) {
    if (e.name !== 'AbortError') showToast('Error al seleccionar carpeta: ' + e.message, 'var(--red)');
  }
}

// Fuerza el re-prompt de permiso readwrite sobre la carpeta ya
// seleccionada, aprovechando un gesto real (ej. clic en "Admin").
// No re-pide elegir carpeta — usa el handle ya guardado en IndexedDB.
async function forceAutosaveFolderPermission() {
  const cfg = getAutosaveConfig();
  if (!cfg.folderName) return; // no hay carpeta configurada, nada que forzar
  const handle = await _loadDirHandle();
  if (!handle) return;
  try {
    let perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') {
      perm = await handle.requestPermission({ mode: 'readwrite' });
    }
    if (perm === 'granted') {
      cfg.needsReconnect = false;
      _saveAutosaveConfig(cfg);
    }
  } catch { /* el navegador pudo bloquear el prompt, se reintenta en el proximo gesto */ }
}

async function clearAutosaveFolder() {
  await _clearDirHandle();
  const cfg = getAutosaveConfig();
  delete cfg.folderName;
  _saveAutosaveConfig(cfg);
  renderAutosaveSection();
  showToast('Carpeta eliminada — se usará la carpeta de descargas');
}

// ── Generate files list ───────────────────────────────────
function _safeName(name) {
  return (name ?? 'menu').replace(/[^a-zA-Z0-9_\-áéíóúüñÁÉÍÓÚÜÑ ]/g, '').trim().replace(/\s+/g, '_');
}

function _timestamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function _buildFiles() {
  const data = loadData();
  const ts   = _timestamp();
  const files = [];

  // Inicio
  files.push({
    name: `Inicio_${ts}.json`,
    content: { version: 2, inicio: data.inicio ?? [], globalCats: data.globalCats, budgets: data.budgets, exportedAt: new Date().toISOString() }
  });

  // Deudas
  if ((data.deudas ?? []).length) {
    files.push({
      name: `Deudas_${ts}.json`,
      content: { version: 2, deudas: data.deudas, exportedAt: new Date().toISOString() }
    });
  }

  // Custom menus
  for (const m of data.customMenus ?? []) {
    files.push({
      name: `${_safeName(m.name)}_${ts}.json`,
      content: { version: 2, menuName: m.name, icon: m.icon, currency: m.currency, data: m.data ?? [], exportedAt: new Date().toISOString() }
    });
  }

  return files;
}

// ── Write to folder or download ───────────────────────────
function _downloadFile(name, content) {
  const blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// allowPrompt=true solo cuando hay gesto real del usuario (botón clic).
// requestPermission() sin gesto es rechazado en silencio por el navegador —
// llamarlo desde un timer en segundo plano no sirve y no debe intentarse.
async function _writeToFolder(handle, name, content, allowPrompt) {
  let perm = await handle.queryPermission({ mode: 'readwrite' });
  if (perm !== 'granted' && allowPrompt) {
    perm = await handle.requestPermission({ mode: 'readwrite' });
  }
  if (perm !== 'granted') throw new Error('PERMISSION_NOT_GRANTED');
  const fileHandle = await handle.getFileHandle(name, { create: true });
  const writable   = await fileHandle.createWritable();
  await writable.write(JSON.stringify(content, null, 2));
  await writable.close();
}

// ── Run autosave ──────────────────────────────────────────
// manual=true (botón "Guardar ahora"): hay gesto real, puede pedir permiso
// y caer a descargas si hace falta. manual=false (timer/debounce en 2do
// plano): sin gesto, nunca pide permiso ni fuerza descargas — si el
// permiso no está ya concedido, se salta el ciclo y marca para reconectar.
async function runAutosave(manual = false) {
  // Automático (timer de respaldo o debounce): si no hay cambios desde
  // el ultimo guardado exitoso, no hay nada que escribir — salir.
  if (!manual && !_autosaveDirty) return;

  const files  = _buildFiles();
  const handle = await _loadDirHandle();

  if (handle) {
    try {
      for (const f of files) await _writeToFolder(handle, f.name, f.content, manual);
      _autosaveDirty = false;
    } catch (e) {
      if (!manual) {
        // Sin gesto: no forzar descargas, solo marcar que hace falta reconectar
        // (_autosaveDirty sigue true — se reintentará en el proximo trigger)
        const cfg = getAutosaveConfig();
        cfg.needsReconnect = true;
        _saveAutosaveConfig(cfg);
        return;
      }
      // Manual: sí cae a descargas como último recurso
      for (const f of files) {
        _downloadFile(f.name, f.content);
        await new Promise(r => setTimeout(r, 150));
      }
      _autosaveDirty = false;
    }
  } else if (manual) {
    // Fallback: descargas individuales (solo con gesto real)
    for (const f of files) {
      _downloadFile(f.name, f.content);
      await new Promise(r => setTimeout(r, 150));
    }
    _autosaveDirty = false;
  } else {
    return; // sin carpeta y sin gesto: no forzar descargas en segundo plano
  }

  const cfg          = getAutosaveConfig();
  cfg.lastSave        = new Date().toISOString();
  cfg.needsReconnect  = false;
  _saveAutosaveConfig(cfg);
  if (manual) {
    renderAutosaveSection();
    showToast(`Autoguardado: ${files.length} archivo(s) ✓`);
  }
}

// ── Timer ─────────────────────────────────────────────────
let _autosaveTimer = null;

function startAutosave() {
  clearInterval(_autosaveTimer);
  _autosaveTimer = null;
  const cfg = getAutosaveConfig();
  if (!cfg.enabled || !cfg.intervalMs) return;
  _autosaveTimer = setInterval(() => runAutosave(false), cfg.intervalMs);
}

function stopAutosave() {
  clearInterval(_autosaveTimer);
  _autosaveTimer = null;
  clearTimeout(_autosaveDebounceTimer);
  _autosaveDebounceTimer = null;
}

// ── Trigger por cambio real (casi inmediato) ──────────────
// El setInterval de arriba depende de dejar la pestaña abierta todo
// el intervalo (Chrome suspende timers en pestañas en 2do plano/cerradas).
// Este trigger corre justo después de cada cambio real (saveData()),
// mientras la app está realmente en uso — mucho más confiable.
// 1s en vez de 0 solo para agrupar guardados simultáneos del mismo tick.
const _AUTOSAVE_DEBOUNCE_MS = 1_000;
let _autosaveDebounceTimer = null;
let _autosaveDirty = false; // true si hay cambios sin escribir en la carpeta local

function scheduleAutosave() {
  const cfg = getAutosaveConfig();
  if (!cfg.enabled) return;
  _autosaveDirty = true;
  clearTimeout(_autosaveDebounceTimer);
  _autosaveDebounceTimer = setTimeout(() => runAutosave(false), _AUTOSAVE_DEBOUNCE_MS);
}

// ── Admin UI ──────────────────────────────────────────────
const _INTERVALS = [
  { label: '5 minutos',  ms: 5   * 60 * 1000 },
  { label: '15 minutos', ms: 15  * 60 * 1000 },
  { label: '30 minutos', ms: 30  * 60 * 1000 },
  { label: '1 hora',     ms: 60  * 60 * 1000 },
  { label: '6 horas',    ms: 6   * 60 * 60 * 1000 },
  { label: '24 horas',   ms: 24  * 60 * 60 * 1000 },
];

function renderAutosaveSection() {
  const el = document.getElementById('autosave-section');
  if (!el) return;
  const cfg      = getAutosaveConfig();
  const lastSave = cfg.lastSave ? new Date(cfg.lastSave).toLocaleString('es-ES') : 'Nunca';
  const folder   = cfg.folderName ?? (hasFileSystemAccess() ? 'No seleccionada (usará Descargas)' : 'Carpeta de Descargas');
  const intOpts  = _INTERVALS.map(i =>
    `<option value="${i.ms}" ${cfg.intervalMs === i.ms ? 'selected' : ''}>${i.label}</option>`
  ).join('');

  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
      <label class="toggle-label" style="display:flex;align-items:center;gap:8px;cursor:pointer">
        <input type="checkbox" id="as-enabled" ${cfg.enabled ? 'checked' : ''}
               onchange="toggleAutosave(this.checked)"
               style="width:16px;height:16px;accent-color:var(--acc)">
        <span style="font-weight:600">Autoguardado activado</span>
      </label>
    </div>
    <div style="display:grid;gap:8px">
      <div class="form-row">
        <label>Intervalo</label>
        <select id="as-interval" onchange="setAutosaveInterval(+this.value)" ${cfg.enabled ? '' : 'disabled'}>
          ${intOpts}
        </select>
      </div>
      <div class="form-row">
        <label>Carpeta</label>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <span style="font-size:.78rem;color:var(--text2);flex:1">${esc(folder)}</span>
          ${hasFileSystemAccess() ? `
            <button class="btn btn-ghost btn-sm" onclick="selectAutosaveFolder()">📁 Seleccionar</button>
            ${cfg.folderName ? `<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="clearAutosaveFolder()">✕</button>` : ''}
          ` : ''}
        </div>
      </div>
      <div style="font-size:.72rem;color:var(--text2)">Último autoguardado: <strong>${lastSave}</strong></div>
      ${cfg.needsReconnect ? `
        <div style="font-size:.72rem;color:var(--yellow);background:var(--yellow)15;border-radius:6px;padding:8px">
          ⚠️ El permiso de la carpeta expiró. El autoguardado en segundo plano está pausado hasta que reconectes.
        </div>` : ''}
      <div style="display:flex;gap:8px;margin-top:4px">
        <button class="btn btn-ghost btn-sm" onclick="runAutosave(true)">💾 Guardar ahora${cfg.needsReconnect ? ' / Reconectar' : ''}</button>
      </div>
      <p style="font-size:.7rem;color:var(--text2);margin:4px 0 0">
        Genera un JSON por cada menú nombrado: <em>NombreMenu_YYYY-MM-DD_HHmm.json</em>
        ${hasFileSystemAccess() ? '' : '<br>⚠️ Tu navegador no soporta selección de carpeta — los archivos se descargarán a la carpeta de Descargas.'}
      </p>
    </div>
  `;
}

function toggleAutosave(enabled) {
  const cfg = getAutosaveConfig();
  if (enabled && !cfg.intervalMs) cfg.intervalMs = 60 * 60 * 1000; // default 1h
  cfg.enabled = enabled;
  _saveAutosaveConfig(cfg);
  enabled ? startAutosave() : stopAutosave();
  renderAutosaveSection();
}

function setAutosaveInterval(ms) {
  const cfg = getAutosaveConfig();
  cfg.intervalMs = ms;
  _saveAutosaveConfig(cfg);
  if (cfg.enabled) startAutosave(); // reinicia timer con nuevo intervalo
}
