'use strict';

// ── Globals — single-usuario local, sin cuenta ────────────
const currentUser = { name: 'Yo' };

// ── Utilidad ─────────────────────────────────────────────
async function hardRefreshApp() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch { /* mejor esfuerzo */ }
  location.reload(true);
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Al reconstruir un contenedor via innerHTML se pierde el foco del input
// activo (ej. campo de búsqueda) aunque conserve su `id` y `value`, porque
// el navegador crea un nodo DOM nuevo. Captura foco+cursor antes de wipe,
// restaura después con el mismo id.
function _captureFocusWithin(containerEl) {
  const active = document.activeElement;
  if (!active?.id || !containerEl.contains(active)) return null;
  return { id: active.id, start: active.selectionStart, end: active.selectionEnd };
}

function _restoreFocusWithin(info) {
  if (!info) return;
  const el = document.getElementById(info.id);
  if (!el) return;
  el.focus();
  if (info.start != null && typeof el.setSelectionRange === 'function') {
    el.setSelectionRange(info.start, info.end);
  }
}

// ── Toast ─────────────────────────────────────────────────
function showToast(msg, color = 'var(--green)', ms = 2500) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.background = color;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), ms);
}

// ── Confirm dialog ────────────────────────────────────────
let _confirmCb = null;

function showConfirm(msg, onOk, { icon = '⚠️', okLabel = 'Confirmar' } = {}) {
  document.getElementById('confirm-icon').textContent = icon;
  document.getElementById('confirm-msg').textContent  = msg;
  document.getElementById('confirm-ok-btn').textContent = okLabel;
  _confirmCb = onOk;
  document.getElementById('confirm-overlay').classList.add('open');
}

function closeConfirm() {
  document.getElementById('confirm-overlay').classList.remove('open');
  _confirmCb = null;
}

function confirmOk() {
  if (_confirmCb) _confirmCb();
  closeConfirm();
}

// ── Admin action sheet (mobile) ───────────────────────────
function openAdminSheet() {
  document.getElementById('admin-sheet').classList.add('open');
}

function closeAdminSheet() {
  document.getElementById('admin-sheet').classList.remove('open');
}

// ── Deudas filter toggle (mobile) ────────────────────────
function toggleDeudasFilters() {
  const panel = document.getElementById('deudas-filters');
  const arrow = document.getElementById('deudas-filter-arrow');
  const open  = panel.classList.toggle('open');
  if (arrow) arrow.textContent = open ? '▲' : '▼';
}

// ── User menu ─────────────────────────────────────────────
function openUserMenu() {
  if (window.innerWidth <= 767) openAdminSheet();
  else openAdminPanel();
}

// ── PWA install prompt ────────────────────────────────────
let _deferredPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _deferredPrompt = e;
  ['btn-install','admin-sheet-install'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = '';
  });
});

window.addEventListener('appinstalled', () => {
  _deferredPrompt = null;
  ['btn-install','admin-sheet-install'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  showToast('App instalada correctamente', 'var(--green)');
});

async function installPwa() {
  if (!_deferredPrompt) return;
  _deferredPrompt.prompt();
  const { outcome } = await _deferredPrompt.userChoice;
  _deferredPrompt = null;
  ['btn-install','admin-sheet-install'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

function _initIosInstallBanner() {
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isInStandalone = window.navigator.standalone === true;
  const dismissed = localStorage.getItem('cashmap_ios_banner_dismissed');
  if (!isIos || isInStandalone || dismissed) return;

  const banner = document.createElement('div');
  banner.id = 'ios-install-banner';
  banner.style.cssText = `
    position:fixed;bottom:0;left:0;right:0;z-index:9999;
    background:var(--bg2);border-top:1px solid var(--border);
    padding:12px 16px;display:flex;align-items:center;gap:10px;
    box-shadow:0 -4px 20px #0004;
  `;
  banner.innerHTML = `
    <span style="font-size:1.6rem">📲</span>
    <div style="flex:1;min-width:0">
      <div style="font-weight:600;font-size:.88rem">Instalar CashMap</div>
      <div style="font-size:.75rem;color:var(--text2)">Toca <strong>Compartir</strong> → <strong>Agregar a pantalla de inicio</strong></div>
    </div>
    <button onclick="document.getElementById('ios-install-banner').remove();localStorage.setItem('cashmap_ios_banner_dismissed','1')"
            style="flex-shrink:0;background:none;border:none;color:var(--text2);font-size:1.2rem;cursor:pointer;padding:4px">✕</button>
  `;
  document.body.appendChild(banner);
}

// ── Swipe to close modals ─────────────────────────────────
function _initSwipeClose() {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    const modal = overlay.querySelector('.modal');
    if (!modal) return;
    let startY = 0, tracking = false;
    modal.addEventListener('touchstart', e => {
      const rect = modal.getBoundingClientRect();
      const topZone = e.touches[0].clientY - rect.top < 60;
      tracking = topZone && modal.scrollTop === 0;
      startY = e.touches[0].clientY;
    }, { passive: true });
    modal.addEventListener('touchend', e => {
      if (tracking && e.changedTouches[0].clientY - startY > 80) {
        overlay.classList.remove('open');
      }
      tracking = false;
    }, { passive: true });
  });
}

// ── Keyboard shortcuts ────────────────────────────────────
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    openGlobalSearch();
  } else if (e.key === 'Escape') {
    const open = document.querySelector('.modal-overlay.open');
    if (open) open.classList.remove('open');
  }
});

// ── Global search ─────────────────────────────────────────
let _searchTimer = null;

function openGlobalSearch() {
  const modal = document.getElementById('search-modal');
  modal.classList.add('open');
  const inp = document.getElementById('search-input');
  inp.value = '';
  document.getElementById('search-results').innerHTML =
    '<div style="color:var(--text2);font-size:.82rem;text-align:center;padding:24px">Escribe para buscar…</div>';
  setTimeout(() => inp.focus(), 80);
}

function closeGlobalSearch() {
  document.getElementById('search-modal').classList.remove('open');
}

function onGlobalSearch() {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(_runGlobalSearch, 200);
}

function _runGlobalSearch() {
  const q  = (document.getElementById('search-input').value ?? '').trim().toLowerCase();
  const el = document.getElementById('search-results');
  if (q.length < 2) {
    el.innerHTML = '<div style="color:var(--text2);font-size:.82rem;text-align:center;padding:24px">Escribe al menos 2 caracteres…</div>';
    return;
  }
  const d      = loadData();
  const groups = [];
  const fmtAmt = (n, curr) =>
    (n ?? 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + (curr ?? '');

  for (const menu of (d.customMenus ?? [])) {
    const isVehicle = menu.menuType === 'vehicle' || menu.menuType === 'fuel';
    const hits = (menu.data ?? []).filter(tx => isVehicle
      ? ((tx.station ?? '').toLowerCase().includes(q) ||
         (tx.oilBrand ?? '').toLowerCase().includes(q) ||
         (tx.notes ?? '').toLowerCase().includes(q))
      : ((tx.description ?? '').toLowerCase().includes(q) ||
         (tx.notes ?? '').toLowerCase().includes(q))
    );
    if (hits.length) groups.push({ label: `${esc(menu.icon ?? '📋')} ${esc(menu.name)}`, viewId: 'menu-' + menu.id, hits, curr: menu.currency ?? '€', type: isVehicle ? 'vehicle' : 'menu' });
  }
  const dHits = (d.deudas ?? []).filter(de =>
    (de.persona ?? '').toLowerCase().includes(q) || (de.description ?? '').toLowerCase().includes(q)
  );
  if (dHits.length) groups.push({ label: '🤝 Deudas', viewId: 'deudas', hits: dHits, curr: '$', type: 'deuda' });

  if (!groups.length) {
    el.innerHTML = '<div style="color:var(--text2);font-size:.82rem;text-align:center;padding:24px">Sin resultados</div>';
    return;
  }

  el.innerHTML = groups.map(g => `
    <div style="margin-bottom:14px">
      <div style="font-size:.68rem;font-weight:700;color:var(--text2);letter-spacing:.06em;text-transform:uppercase;margin-bottom:6px;padding:0 2px">${g.label} · ${g.hits.length} resultado(s)</div>
      ${g.hits.slice(0, 8).map(h => {
        const onclick = `closeGlobalSearch();switchView('${g.viewId}')`;
        if (g.type === 'vehicle') {
          const emoji = h.entryType === 'oil' ? '🛢️' : '⛽';
          const label = h.entryType === 'oil' ? (h.oilBrand || 'Cambio aceite') : (h.station || 'Carga');
          return `<div onclick="${onclick}" style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:var(--bg2);border-radius:8px;margin-bottom:4px;cursor:pointer;gap:8px">
            <div style="min-width:0;display:flex;align-items:center;gap:6px">
              <span>${emoji}</span>
              <div>
                <div style="font-size:.85rem;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(label)}</div>
                <div style="font-size:.7rem;color:var(--text2)">${h.date?.slice(0,10) ?? ''}</div>
              </div>
            </div>
            <span style="font-weight:700;font-size:.82rem;color:var(--red);white-space:nowrap;flex-shrink:0">${fmtAmt(h.totalCost, g.curr)}</span>
          </div>`;
        } else if (g.type === 'menu') {
          const color = h.type === 'inc' ? 'var(--green)' : 'var(--red)';
          const sign  = h.type === 'inc' ? '+' : '-';
          return `<div onclick="${onclick}" style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:var(--bg2);border-radius:8px;margin-bottom:4px;cursor:pointer;gap:8px">
            <div style="min-width:0">
              <div style="font-size:.85rem;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(h.description)}</div>
              <div style="font-size:.7rem;color:var(--text2)">${h.date?.slice(0,10) ?? ''}</div>
            </div>
            <span style="font-weight:700;font-size:.82rem;color:${color};white-space:nowrap;flex-shrink:0">${sign}${fmtAmt(h.amount, g.curr)}</span>
          </div>`;
        } else {
          return `<div onclick="${onclick}" style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:var(--bg2);border-radius:8px;margin-bottom:4px;cursor:pointer;gap:8px">
            <div style="min-width:0">
              <div style="font-size:.85rem;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(h.persona)}</div>
              <div style="font-size:.7rem;color:var(--text2)">${esc(h.description ?? '')} · ${h.date?.slice(0,10) ?? ''}</div>
            </div>
            <span style="font-weight:700;font-size:.82rem;white-space:nowrap;flex-shrink:0">${fmtAmt(h.amount, h.currency ?? '$')}</span>
          </div>`;
        }
      }).join('')}
      ${g.hits.length > 8 ? `<div style="font-size:.72rem;color:var(--text2);padding:2px 4px">+${g.hits.length - 8} más…</div>` : ''}
    </div>
  `).join('');
}

// ── Change history log ────────────────────────────────────
const _HIST_KEY = 'cashmap_v2_history';
let   _histMenuId = null;

function _logHistory({ menuId, menuName, action, desc, amount, txType }) {
  try {
    const log = JSON.parse(localStorage.getItem(_HIST_KEY) ?? '[]');
    log.unshift({ ts: new Date().toISOString(), by: currentUser.name, menuId, menuName, action, desc, amount, txType });
    if (log.length > 200) log.length = 200;
    localStorage.setItem(_HIST_KEY, JSON.stringify(log));
  } catch {}
}

function openMenuHistory(menuId) {
  _histMenuId = menuId ?? null;
  const all     = JSON.parse(localStorage.getItem(_HIST_KEY) ?? '[]');
  const entries = menuId != null ? all.filter(e => e.menuId === menuId) : all;
  const menu    = menuId != null && typeof getCustomMenu === 'function' ? getCustomMenu(menuId) : null;
  document.getElementById('history-modal-title').textContent =
    menu ? `📋 Historial — ${menu.icon ?? ''} ${menu.name}` : '📋 Historial de cambios';

  if (!entries.length) {
    document.getElementById('history-modal-list').innerHTML =
      '<div style="color:var(--text2);font-size:.82rem;text-align:center;padding:24px">Sin cambios registrados</div>';
  } else {
    document.getElementById('history-modal-list').innerHTML = entries.slice(0, 100).map(e => {
      const ico   = e.action === 'create' ? '➕' : e.action === 'edit' ? '✏️' : '🗑️';
      const color = e.txType === 'inc' ? 'var(--green)' : e.txType === 'exp' ? 'var(--red)' : 'var(--text2)';
      const dt    = new Date(e.ts).toLocaleString('es-ES', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
      return `<div style="display:flex;gap:10px;align-items:flex-start;padding:9px 0;border-bottom:1px solid var(--border)">
        <span style="font-size:.9rem;flex-shrink:0;margin-top:1px">${ico}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:.83rem;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.desc ?? '—')}</div>
          <div style="font-size:.7rem;color:var(--text2)">${dt}${e.menuName ? ' · ' + esc(e.menuName) : ''}</div>
        </div>
        ${e.amount != null ? `<span style="font-size:.8rem;font-weight:600;color:${color};white-space:nowrap;flex-shrink:0">${(e.amount ?? 0).toFixed(2)}</span>` : ''}
      </div>`;
    }).join('');
  }
  document.getElementById('history-modal').classList.add('open');
}

function clearMenuHistory() {
  try {
    if (_histMenuId != null) {
      const all = JSON.parse(localStorage.getItem(_HIST_KEY) ?? '[]');
      localStorage.setItem(_HIST_KEY, JSON.stringify(all.filter(e => e.menuId !== _histMenuId)));
    } else {
      localStorage.removeItem(_HIST_KEY);
    }
  } catch {}
  document.getElementById('history-modal').classList.remove('open');
  showToast('Historial borrado', 'var(--red)');
}

// ── App start (sin login — un solo usuario local) ─────────
async function startApp() {
  try { migrateTypes(); } catch (e) { console.error('migrateTypes:', e); }
  try { migrateTimePadding(); } catch (e) { console.error('migrateTimePadding:', e); }

  buildNav();
  switchView('inicio');

  try { processRecurringTxs(); } catch (e) { console.error('processRecurringTxs:', e); }
  renderInicio();
  startAutosave();

  _initSwipeClose();
  _initIosInstallBanner();
}

// ── Init ──────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  startApp();
});
