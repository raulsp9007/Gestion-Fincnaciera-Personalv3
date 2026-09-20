'use strict';

let _currentView = 'inicio';

// ── Build nav ─────────────────────────────────────────────
function buildNav() {
  _buildSidebar();
  _buildBottomNav();
}

function _buildSidebar() {
  document.getElementById('sidebar-nav').innerHTML = `
    <a class="${_currentView === 'inicio' ? 'active' : ''}" onclick="switchView('inicio')">
      <span class="ico">🏠</span> Inicio
    </a>
    <a class="${_currentView === 'deudas' ? 'active' : ''}" onclick="switchView('deudas')">
      <span class="ico">🤝</span> Deudas
    </a>
    <a class="${_currentView === 'menus' || _currentView.startsWith('menu-') ? 'active' : ''}" onclick="switchView('menus')">
      <span class="ico">📁</span> Menús
    </a>
    <a onclick="openAdminPanel()">
      <span class="ico">⚙️</span> Admin
    </a>
  `;
}

function _buildBottomNav() {
  document.getElementById('bottom-nav').innerHTML = `
    <a class="${_currentView === 'inicio' ? 'active' : ''}" onclick="switchView('inicio')">
      <span class="bn-ico">🏠</span>
      <span>Inicio</span>
    </a>
    <a class="${_currentView === 'deudas' ? 'active' : ''}" onclick="switchView('deudas')">
      <span class="bn-ico">🤝</span>
      <span>Deudas</span>
    </a>
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
  const allMenus = getCustomMenus();

  el.innerHTML = `
    <div class="menu-header">
      <h2 style="font-size:1.1rem;font-weight:700">📁 Menús</h2>
      <button class="btn btn-primary btn-sm" onclick="openNewMenuModal()">➕ Nuevo menú</button>
    </div>
    ${allMenus.length ? `<div class="menus-grid">
      ${allMenus.map(m => `
        <button class="menu-card" onclick="switchView('menu-${m.id}')">
          <div class="menu-card-icon">${esc(m.icon ?? '📋')}</div>
          <div class="menu-card-name">${esc(m.name)}</div>
          <div class="menu-card-foot">
            <span class="menu-card-curr">${esc(m.currency ?? '')}</span>
          </div>
        </button>`).join('')}
    </div>` : `<div class="empty">Sin menús aún.<br>Crea uno con "Nuevo menú".</div>`}
  `;
}

// ── Routing ───────────────────────────────────────────────
function switchView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

  if (viewId.startsWith('menu-')) {
    document.getElementById('view-custom').classList.add('active');
    renderCustomMenu(parseInt(viewId.slice(5), 10));
  } else if (viewId === 'menus') {
    document.getElementById('view-menus')?.classList.add('active');
    _renderMenusView();
  } else {
    document.getElementById('view-' + viewId)?.classList.add('active');
    if (viewId === 'inicio') renderInicio();
    if (viewId === 'deudas') renderDeudas();
  }

  _currentView = viewId;
  document.getElementById('topbar-title').textContent = _viewTitle(viewId);
  buildNav();
}

function _viewTitle(viewId) {
  if (viewId === 'inicio') return 'Inicio';
  if (viewId === 'menus')  return '📁 Menús';
  if (viewId === 'deudas') return '🤝 Deudas';
  if (viewId.startsWith('menu-')) {
    const m = getCustomMenu(parseInt(viewId.slice(5), 10));
    return m ? `${m.icon ?? '📋'} ${m.name}` : 'Menú';
  }
  return 'CashMap';
}
