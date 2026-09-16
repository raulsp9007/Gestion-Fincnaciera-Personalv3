'use strict';

let _currentView = 'inicio';

// ── Shared-users secondary line ───────────────────────────
function _sharedUsersLine(sharedWith) {
  if (!sharedWith?.length) return '';
  const names = sharedWith.slice(0, 3).map(u => esc(u.name)).join(' · ');
  const extra = sharedWith.length > 3 ? ` +${sharedWith.length - 3}` : '';
  return `<div style="font-size:.58rem;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px">${names}${extra}</div>`;
}

// ── Build nav ─────────────────────────────────────────────
function buildNav() {
  _buildSidebar();
  _buildBottomNav();
}

function _hideLocalDeudasTab() {
  const localEmpty = (loadData().deudas ?? []).length === 0;
  return localEmpty && getSharedDeudasMenus().length > 0;
}

function _buildSidebar() {
  const isAdmin = currentUser?.role === 'admin';

  document.getElementById('sidebar-nav').innerHTML = `
    <a class="${_currentView === 'inicio' ? 'active' : ''}" onclick="switchView('inicio')">
      <span class="ico">🏠</span> Inicio
    </a>
    ${_hideLocalDeudasTab() ? '' : `
    <a class="${_currentView === 'deudas' || _currentView.startsWith('sdeudas-') ? 'active' : ''}" onclick="switchView('deudas')">
      <span class="ico">💳</span> Deudas
    </a>`}
    <a class="${_currentView === 'menus' || _currentView.startsWith('menu-') ? 'active' : ''}" onclick="switchView('menus')">
      <span class="ico">📁</span> Menús
    </a>
    ${isAdmin ? `
    <a onclick="openAdminPanel()">
      <span class="ico">⚙️</span> Admin
    </a>` : ''}
    ${_buildGasIdentityNav()}
    <a class="nav-logout" onclick="logout()">
      <span class="ico">🚪</span> Cerrar sesión
    </a>
  `;
}

function _buildBottomNav() {
  const initial = (currentUser?.name ?? '?').charAt(0).toUpperCase();

  document.getElementById('bottom-nav').innerHTML = `
    <a class="${_currentView === 'inicio' ? 'active' : ''}" onclick="switchView('inicio')">
      <span class="bn-ico">🏠</span>
      <span>Inicio</span>
    </a>
    ${_hideLocalDeudasTab() ? '' : `
    <a class="${_currentView === 'deudas' || _currentView.startsWith('sdeudas-') ? 'active' : ''}" onclick="switchView('deudas')">
      <span class="bn-ico">🤝</span>
      <span>Deudas</span>
    </a>`}
    <a class="${_currentView === 'menus' || _currentView.startsWith('menu-') ? 'active' : ''}" onclick="switchView('menus')">
      <span class="bn-ico">📁</span>
      <span>Menús</span>
    </a>
    <a onclick="openUserMenu()">
      <span class="bn-ico">⋯</span>
      <span>Más</span>
    </a>
  `;
}

// ── Vista "Menús" — grid de todos los menús personalizados ─
function _renderMenusView() {
  const el = document.getElementById('view-menus');
  if (!el) return;
  const isAdmin  = currentUser?.role === 'admin';
  const allMenus = getCustomMenus();

  el.innerHTML = `
    <div class="menu-header">
      <h2 style="font-size:1.1rem;font-weight:700">📁 Menús</h2>
      ${isAdmin || currentUser?.role === 'editor' ? `<button class="btn btn-primary btn-sm" onclick="openNewMenuModal()">➕ Nuevo menú</button>` : ''}
    </div>
    ${allMenus.length ? `<div class="menus-grid">
      ${allMenus.map(m => `
        <button class="menu-card" onclick="switchView('menu-${m.id}')">
          <div class="menu-card-icon">${esc(m.icon ?? '📋')}</div>
          <div class="menu-card-name">${esc(m.name)}</div>
          <div class="menu-card-foot">
            <span class="menu-card-curr">${esc(m.currency ?? '')}</span>
            ${m.shared ? `<span class="menu-card-badge">Compartido</span>` : ''}
          </div>
        </button>`).join('')}
    </div>` : `<div class="empty">Sin menús aún.<br>Crea uno con "Nuevo menú".</div>`}
  `;
}

// ── Selector de fuente dentro de la vista Deudas ───────────
function _renderDeudasSourceTabs() {
  const el = document.getElementById('deudas-source-tabs');
  if (!el) return;
  const shared = getSharedDeudasMenus();
  if (!shared.length) { el.innerHTML = ''; return; }
  const isLocal = !_currentView.startsWith('sdeudas-');
  el.innerHTML = `
    ${_hideLocalDeudasTab() ? '' : `<button class="month-tab ${isLocal ? 'active' : ''}" onclick="switchView('deudas')">Local</button>`}
    ${shared.map(m => `<button class="month-tab ${_currentView === 'sdeudas-' + m.id ? 'active' : ''}" onclick="switchView('sdeudas-${m.id}')">${esc(m.name)}</button>`).join('')}
  `;
}

// ── Routing ───────────────────────────────────────────────
function switchView(viewId) {
  if (viewId === 'deudas' && _hideLocalDeudasTab()) {
    const first = getSharedDeudasMenus()[0];
    viewId = first ? 'sdeudas-' + first.id : 'inicio';
  }
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

  if (viewId.startsWith('menu-')) {
    document.getElementById('view-custom').classList.add('active');
    renderCustomMenu(parseInt(viewId.slice(5), 10));
  } else if (viewId.startsWith('sdeudas-')) {
    document.getElementById('view-deudas').classList.add('active');
    renderDeudas(parseInt(viewId.slice(8), 10));
  } else if (viewId === 'menus') {
    document.getElementById('view-menus')?.classList.add('active');
    _renderMenusView();
  } else {
    document.getElementById('view-' + viewId)?.classList.add('active');
    if (viewId === 'inicio')  renderInicio();
    if (viewId === 'deudas')  { renderDeudas('local'); }
  }

  _currentView = viewId;
  document.getElementById('topbar-title').textContent = _viewTitle(viewId);
  if (viewId === 'deudas' || viewId.startsWith('sdeudas-')) _renderDeudasSourceTabs();
  buildNav();
}

function _buildGasIdentityNav() {
  const id = (typeof getGasIdentity === 'function') ? getGasIdentity() : null;
  if (id) {
    return `
      <div style="margin:8px 0 4px;padding:8px 12px;background:var(--bg2);border-radius:10px;border:1px solid var(--border)">
        <div style="font-size:.65rem;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Servidor conectado</div>
        <div style="font-size:.78rem;font-weight:600;color:var(--green);margin-bottom:6px">🔗 ${esc(id.username)}</div>
        <a onclick="disconnectGasIdentity()" style="font-size:.7rem;color:var(--red);cursor:pointer;text-decoration:none;display:block">Desconectar</a>
      </div>`;
  }
  return `
    <a onclick="openGasConnectModal()" style="color:var(--text2);font-size:.82rem">
      <span class="ico">🔗</span> Conectar servidor
    </a>`;
}

function _viewTitle(viewId) {
  if (viewId === 'inicio')  return 'Inicio';
  if (viewId === 'menus')   return '📁 Menús';
  if (viewId === 'deudas')  return '🤝 Deudas';
  if (viewId.startsWith('sdeudas-')) {
    const m = getSharedDeudasMenu(parseInt(viewId.slice(8), 10));
    return m ? `💳 ${m.name}` : 'Deudas';
  }
  if (viewId.startsWith('menu-')) {
    const m = getCustomMenu(parseInt(viewId.slice(5), 10));
    return m ? `${m.icon ?? '📋'} ${m.name}` : 'Menú';
  }
  return 'CashMap';
}
