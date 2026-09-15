'use strict';

const ATTACH_DB_NAME    = 'cashmap_v2_files';
const ATTACH_DB_VERSION = 1;
const ATTACH_STORE_NAME = 'attachments';

// Pending state for the open modal session
let _pendingAttachments = [];

// ── IndexedDB ─────────────────────────────────────────────
function _openAttachDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(ATTACH_DB_NAME, ATTACH_DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(ATTACH_STORE_NAME)) {
        db.createObjectStore(ATTACH_STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

async function _saveBlob(id, name, type, blob) {
  const db = await _openAttachDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ATTACH_STORE_NAME, 'readwrite');
    tx.objectStore(ATTACH_STORE_NAME).put({ id, name, type, blob });
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror    = e => { db.close(); reject(e.target.error); };
  });
}

async function _getBlob(id) {
  const db = await _openAttachDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(ATTACH_STORE_NAME, 'readonly');
    const req = tx.objectStore(ATTACH_STORE_NAME).get(id);
    req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
    req.onerror   = e => { db.close(); reject(e.target.error); };
  });
}

async function _deleteBlob(id) {
  const db = await _openAttachDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ATTACH_STORE_NAME, 'readwrite');
    tx.objectStore(ATTACH_STORE_NAME).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror    = e => { db.close(); reject(e.target.error); };
  });
}

// ── Modal state ───────────────────────────────────────────
function initAttachModal(existingAttachments) {
  _pendingAttachments = (existingAttachments ?? []).map(a => ({ ...a, _isNew: false }));
  _renderAttachList();
}

function _renderAttachList() {
  const el = document.getElementById('tx-attach-list');
  if (!el) return;
  if (!_pendingAttachments.length) {
    el.innerHTML = '<div style="color:var(--text2);font-size:.78rem;padding:4px 0">Sin adjuntos</div>';
    return;
  }
  el.innerHTML = _pendingAttachments.map(a => {
    const icon  = _attachIcon(a.type);
    const badge = a.storage === 'local' ? '🗂️ Local' : '🔗 Enlace';
    const size  = a.size ? ' · ' + _fmtSize(a.size) : '';
    return `<div class="attach-row">
      <span style="font-size:1.05rem;flex-shrink:0">${icon}</span>
      <span class="attach-name" title="${esc(a.name)}">${esc(a.name)}</span>
      <span class="attach-badge">${badge}${size}</span>
      <button class="btn-icon" title="Abrir / Descargar" onclick="openAttach('${a.id}')">⬇️</button>
      <button class="btn-icon" style="color:var(--red)" title="Eliminar" onclick="removeAttach('${a.id}')">✕</button>
    </div>`;
  }).join('');
}

function _attachIcon(type) {
  if (!type) return '📄';
  if (type.startsWith('image/'))                                        return '🖼️';
  if (type === 'application/pdf')                                       return '📑';
  if (type.includes('spreadsheet') || type.includes('excel'))          return '📊';
  if (type.includes('word')        || type.includes('document'))       return '📝';
  if (type.startsWith('video/'))                                        return '🎬';
  if (type.startsWith('audio/'))                                        return '🎵';
  return '📄';
}

function _fmtSize(bytes) {
  if (bytes < 1024)          return bytes + ' B';
  if (bytes < 1024 * 1024)  return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ── Add local file (from file input) ─────────────────────
function handleAttachFile(input) {
  const files = Array.from(input.files ?? []);
  input.value = '';
  if (!files.length) return;
  const MAX = 10 * 1024 * 1024; // 10 MB per file
  for (const file of files) {
    if (file.size > MAX) {
      showToast(`"${file.name}" supera 10 MB`, 'var(--yellow)');
      continue;
    }
    const id = 'att_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    _pendingAttachments.push({
      id, localId: id,
      name:    file.name,
      size:    file.size,
      type:    file.type || 'application/octet-stream',
      storage: 'local',
      _blob:   file,
      _isNew:  true
    });
  }
  _renderAttachList();
}

// ── Add external link ─────────────────────────────────────
function addAttachLink() {
  const url = prompt('URL del archivo (Google Drive, Dropbox, etc.):');
  if (!url?.trim()) return;
  const defaultName = url.split('/').pop()?.split('?')[0] || 'enlace';
  const name = prompt('Nombre del archivo:', defaultName);
  if (name === null) return;
  const id = 'lnk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  _pendingAttachments.push({
    id,
    name:    (name || defaultName).trim(),
    storage: 'link',
    url:     url.trim(),
    _isNew:  true
  });
  _renderAttachList();
}

// ── Open / download ───────────────────────────────────────
async function openAttach(id) {
  const att = _pendingAttachments.find(a => a.id === id);
  if (!att) return;
  if (att.storage === 'link') {
    window.open(att.url, '_blank', 'noopener');
    return;
  }
  const blob = att._blob ?? (await _getBlob(att.localId))?.blob;
  if (!blob) { showToast('Archivo no encontrado en este dispositivo', 'var(--red)'); return; }
  const objUrl = URL.createObjectURL(blob);
  const a      = document.createElement('a');
  a.href       = objUrl;
  a.download   = att.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
}

// ── Remove from pending ───────────────────────────────────
function removeAttach(id) {
  const idx = _pendingAttachments.findIndex(a => a.id === id);
  if (idx < 0) return;
  const att = _pendingAttachments[idx];
  // If it was already saved to IndexedDB (existing, not new), delete it
  if (!att._isNew && att.storage === 'local' && att.localId) {
    _deleteBlob(att.localId).catch(() => {});
  }
  _pendingAttachments.splice(idx, 1);
  _renderAttachList();
}

// ── Commit on save ────────────────────────────────────────
async function saveAllAttachments() {
  for (const att of _pendingAttachments) {
    if (att._isNew && att.storage === 'local' && att._blob) {
      await _saveBlob(att.localId, att.name, att.type, att._blob);
    }
  }
  // Return clean metadata (no private _blob/_isNew fields)
  return _pendingAttachments.map(({ _blob, _isNew, ...meta }) => meta);
}

// ── Discard on cancel ─────────────────────────────────────
function discardNewAttachments() {
  // New local blobs were never committed to IndexedDB — nothing to clean
  _pendingAttachments = [];
}

// ── Count badge helper (used in row renders) ──────────────
function attachBadge(attachments) {
  if (!attachments?.length) return '';
  return `<span style="font-size:.65rem;padding:1px 6px;border-radius:99px;background:var(--acc)22;color:var(--acc);font-weight:700;flex-shrink:0;cursor:pointer" title="${attachments.length} adjunto(s)">📎 ${attachments.length}</span>`;
}
