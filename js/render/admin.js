'use strict';

// ── Panel Admin — modal principal ─────────────────────────
async function openAdminPanel() {
  renderAdminUsers();
  renderGasSection();
  // Abrir Admin es un clic real: aprovecha ese gesto para forzar el
  // permiso de la carpeta de autoguardado si ya expiró.
  if (typeof forceAutosaveFolderPermission === 'function') {
    await forceAutosaveFolderPermission();
  }
  renderAutosaveSection();
  renderSharedDeudasAdmin();
  _renderTimezoneSection();
  _renderTimeFormatSection();
  _renderAdminMenusList();
  renderAdminRecurring();
  document.getElementById('admin-modal').classList.add('open');
  switchAdminTab('usuarios');
}

function _renderAdminMenusList() {
  const el = document.getElementById('admin-menus-list');
  if (!el) return;
  const menus = loadData().customMenus ?? [];
  if (!menus.length) {
    el.innerHTML = '<div style="color:var(--text2);font-size:.78rem;margin-bottom:12px">Sin menús creados.</div>';
    return;
  }
  el.innerHTML = menus.map(m => {
    const txCount = (m.data ?? []).length;
    return `<div class="cat-row">
      <span style="font-size:1.1rem;flex-shrink:0">${esc(m.icon ?? '📋')}</span>
      <span class="cat-row-label" style="font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(m.name)}</span>
      <span style="font-size:.7rem;color:var(--text2);flex-shrink:0">${txCount} reg.</span>
      <div class="cat-row-actions">
        <button title="Eliminar menú" onclick="confirmAdminDeleteMenu(${m.id})">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

function confirmAdminDeleteMenu(menuId) {
  const menu = getCustomMenu(menuId);
  if (!menu) return;
  const txCount = (menu.data ?? []).length;
  showConfirm(
    `¿Eliminar menú "${menu.icon ?? ''} ${menu.name}"? Se borrarán ${txCount} registro(s). Esta acción no se puede deshacer.`,
    () => _doDeleteMenu(menuId),
    { icon: '🗑️', okLabel: 'Eliminar' }
  );
}

function _doDeleteMenu(menuId) {
  deleteCustomMenu(menuId);
  saveData();
  if (typeof scheduleSave === 'function') scheduleSave();
  if (typeof buildNav === 'function') buildNav();
  const currentView = document.querySelector('.view.active')?.id;
  if (currentView === 'view-custom') switchView('inicio');
  _renderAdminMenusList();
  showToast('Menú eliminado', 'var(--red)');
}

function _renderTimezoneSection() {
  const sel = document.getElementById('admin-timezone-sel');
  if (!sel) return;
  const tz = getTimezone();
  // try exact match first, fallback to closest
  const opt = sel.querySelector(`option[value="${CSS.escape(tz)}"]`);
  if (opt) sel.value = tz;
}

function saveTimezone(tz) {
  setTimezone(tz);
  showToast('Zona horaria guardada');
}

function _renderTimeFormatSection() {
  const sel = document.getElementById('admin-timeformat-sel');
  if (!sel) return;
  sel.value = getTimeFormat();
}

function saveTimeFormat(fmt) {
  setTimeFormat(fmt);
  showToast('Formato de hora guardado');
  // Re-render vista actual para reflejar el cambio inmediatamente
  const currentView = document.querySelector('.view.active')?.id;
  if (currentView === 'view-inicio' && typeof renderInicio === 'function') renderInicio();
  if (currentView === 'view-custom' && typeof _currentView !== 'undefined' && _currentView.startsWith('menu-')) {
    renderCustomMenu(parseInt(_currentView.slice(5), 10));
  }
}

function switchAdminTab(id) {
  document.querySelectorAll('.admin-tab-panel').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
  const panel = document.getElementById('admin-tab-' + id);
  if (panel) panel.style.display = '';
  // Activar botón correspondiente
  const bar = document.getElementById('admin-tab-bar');
  if (bar) {
    const idx = ['usuarios','categorias','autosave','datos','menus','recurrentes','config'].indexOf(id);
    const btns = bar.querySelectorAll('.admin-tab');
    if (btns[idx]) btns[idx].classList.add('active');
  }
}

function closeAdminPanel() {
  document.getElementById('admin-modal').classList.remove('open');
}

// ── Lista de usuarios ─────────────────────────────────────
function renderAdminUsers() {
  const users = loadUsers();
  const el    = document.getElementById('admin-users-list');

  if (!users.length) {
    el.innerHTML = '<div class="empty">Sin usuarios</div>';
    return;
  }

  el.innerHTML = users.map(u => `
    <div class="cat-row">
      <span class="cat-row-label" style="font-weight:600">${esc(u.name)}</span>
      <span class="role-chip ${u.role}">${u.role}</span>
      ${u.id !== currentUser.id ? `
        <div class="cat-row-actions">
          <button title="Editar" onclick="openEditUserForm(${u.id})">✏️</button>
          <button title="Eliminar" onclick="confirmDeleteUser(${u.id})">🗑️</button>
        </div>
      ` : '<span style="font-size:.72rem;color:var(--text2)">(tú)</span>'}
    </div>
  `).join('');
}

// ── Formulario crear usuario ──────────────────────────────
function openCreateUserForm() {
  document.getElementById('user-form-id').value        = '';
  document.getElementById('user-form-title').textContent = 'Nuevo usuario';
  document.getElementById('user-form-name').value      = '';
  document.getElementById('user-form-role').value      = 'viewer';
  document.getElementById('user-form-pin').value       = '';
  document.getElementById('user-form-pin2').value      = '';
  document.getElementById('user-form-pin-hint').textContent = 'Requerido';
  document.getElementById('user-form-error').textContent  = '';
  document.getElementById('user-form-modal').classList.add('open');
}

// ── Formulario editar usuario ─────────────────────────────
function openEditUserForm(userId) {
  const u = loadUsers().find(u => u.id === userId);
  if (!u) return;

  document.getElementById('user-form-id').value        = userId;
  document.getElementById('user-form-title').textContent = 'Editar usuario';
  document.getElementById('user-form-name').value      = u.name;
  document.getElementById('user-form-role').value      = u.role;
  document.getElementById('user-form-pin').value       = '';
  document.getElementById('user-form-pin2').value      = '';
  document.getElementById('user-form-pin-hint').textContent = 'Dejar vacío para no cambiar';
  document.getElementById('user-form-error').textContent  = '';
  document.getElementById('user-form-modal').classList.add('open');
}

function closeUserForm() {
  document.getElementById('user-form-modal').classList.remove('open');
}

// ── Guardar (crear o editar) ──────────────────────────────
async function submitUserForm() {
  const id    = document.getElementById('user-form-id').value;
  const name  = document.getElementById('user-form-name').value.trim();
  const role  = document.getElementById('user-form-role').value;
  const pin   = document.getElementById('user-form-pin').value;
  const pin2  = document.getElementById('user-form-pin2').value;
  const errEl = document.getElementById('user-form-error');
  errEl.textContent = '';

  if (!name) { errEl.textContent = 'Nombre obligatorio.'; return; }

  if (!id) {
    // Crear
    if (!/^\d{4,8}$/.test(pin)) { errEl.textContent = 'PIN debe ser 4–8 dígitos numéricos.'; return; }
    if (pin !== pin2)           { errEl.textContent = 'Los PINs no coinciden.'; return; }
    await createUser(name, pin, role);
  } else {
    // Editar
    const uid = parseInt(id, 10);
    updateUserName(uid, name);
    updateUserRole(uid, role);
    if (pin) {
      if (!/^\d{4,8}$/.test(pin)) { errEl.textContent = 'PIN debe ser 4–8 dígitos numéricos.'; return; }
      if (pin !== pin2)           { errEl.textContent = 'Los PINs no coinciden.'; return; }
      await updateUserPin(uid, pin);
    }
  }

  closeUserForm();
  renderAdminUsers();
  showToast(id ? 'Usuario actualizado' : 'Usuario creado');
}

// ── Sección GAS ───────────────────────────────────────────
function renderGasSection() {
  const url = getGasUrl();
  document.getElementById('admin-gas-url').value = url;
  _setGasStatus(url ? 'saved' : 'empty');
}

function _setGasStatus(state, msg) {
  const el = document.getElementById('admin-gas-status');
  const map = {
    empty:   { text: 'No configurada',  color: 'var(--text2)' },
    saved:   { text: 'URL guardada',    color: 'var(--yellow)' },
    testing: { text: 'Probando…',       color: 'var(--acc)' },
    ok:      { text: msg ?? 'Conectado ✓', color: 'var(--green)' },
    error:   { text: msg ?? 'Error',    color: 'var(--red)' },
  };
  const s = map[state] ?? map.empty;
  el.textContent = s.text;
  el.style.color = s.color;
}

function saveGasUrl() {
  const url = document.getElementById('admin-gas-url').value.trim();
  setGasUrl(url);
  _setGasStatus(url ? 'saved' : 'empty');
  showToast(url ? 'URL guardada' : 'URL eliminada');
}

async function testGasUrl() {
  const url = document.getElementById('admin-gas-url').value.trim();
  if (!url) { showToast('Introduce una URL primero', 'var(--yellow)'); return; }
  setGasUrl(url);
  _setGasStatus('testing');
  try {
    await testGasConnection();
    _setGasStatus('ok', 'Conectado ✓ — sincronizando…');
    // Pull config y menús compartidos inmediatamente tras conectar
    await connectAndSync();
    await _mergeAndPushUsers();
    _setGasStatus('ok', 'Conectado ✓');
    buildNav();
  } catch (e) {
    _setGasStatus('error', 'Error: ' + e.message);
  }
}

// Pull usuarios de GAS, mergear con locales (GAS gana por nombre), push resultado.
async function _mergeAndPushUsers() {
  try {
    const gasUsers   = await pullUsersFromGas(getGasUrl());
    const localUsers = loadUsers();
    const merged     = [...gasUsers];
    for (const lu of localUsers) {
      if (!merged.find(u => u.name === lu.name)) merged.push(lu);
    }
    saveUsers(merged);
  } catch {
    // Si GAS no tiene usuarios aún, solo push los locales
    await pushUsersToGas();
  }
}

async function manualPushUsers() {
  if (!getGasUrl()) { showToast('Configura la URL del servidor primero', 'var(--yellow)'); return; }
  try {
    await pushUsersToGas();
    showToast('Usuarios subidos al servidor ✓', 'var(--green)');
  } catch (e) {
    showToast('Error al subir usuarios: ' + e.message, 'var(--red)');
  }
}

// ── Deudas compartidas (admin) ────────────────────────────
function renderSharedDeudasAdmin() {
  const el = document.getElementById('admin-shared-deudas-list');
  if (!el) return;
  const list = getSharedDeudasMenus();
  if (!list.length) {
    el.innerHTML = '<div class="empty" style="font-size:.8rem;color:var(--text2)">Sin deudas compartidas configuradas</div>';
    return;
  }
  el.innerHTML = list.map(m => `
    <div class="cat-row">
      <span class="cat-row-label" style="font-weight:600">💳 ${esc(m.name)}</span>
      <span style="font-size:.7rem;color:var(--text2)">${esc(m.sheetName ?? '')}</span>
      <div class="cat-row-actions">
        <button title="Compartir/Editar" onclick="openShareDeudasModal(${m.id})">✏️</button>
        <button title="Eliminar" onclick="confirmDeleteSharedDeudas(${m.id})" style="color:var(--red)">🗑️</button>
      </div>
    </div>
  `).join('');
}

function openShareDeudasModal(editId) {
  const m = editId ? getSharedDeudasMenu(editId) : null;
  document.getElementById('sdm-id').value    = editId ?? '';
  document.getElementById('sdm-name').value  = m?.name ?? 'Deudas compartidas';
  document.getElementById('sdm-sheet').value = m?.sheetName ?? '_shared_deudas';
  document.getElementById('sdm-error').textContent = '';

  const users = loadUsers().filter(u => u.id !== currentUser.id);
  const shared = m?.sharedWith ?? [];
  document.getElementById('sdm-users').innerHTML = users.map(u => {
    const entry = shared.find(s => s.name === u.name);
    return `<label style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:.85rem">
      <input type="checkbox" value="${esc(u.name)}" ${entry ? 'checked' : ''}
             onchange="_sdmUpdateRole(this)">
      <span style="flex:1">${esc(u.name)}</span>
      <select id="sdm-role-${esc(u.name)}" style="font-size:.75rem;padding:2px 6px;border-radius:6px;background:var(--bg3);border:1px solid var(--border);color:var(--text)" ${!entry ? 'disabled' : ''}>
        <option value="viewer" ${entry?.role === 'viewer' ? 'selected' : ''}>viewer</option>
        <option value="editor" ${!entry || entry?.role === 'editor' ? 'selected' : ''}>editor</option>
        <option value="admin"  ${entry?.role === 'admin'  ? 'selected' : ''}>admin</option>
      </select>
    </label>`;
  }).join('') || '<div style="font-size:.8rem;color:var(--text2)">No hay otros usuarios</div>';

  document.getElementById('share-deudas-modal').classList.add('open');
}

function _sdmUpdateRole(checkbox) {
  const sel = document.getElementById('sdm-role-' + checkbox.value);
  if (sel) sel.disabled = !checkbox.checked;
}

function closeShareDeudasModal() {
  document.getElementById('share-deudas-modal').classList.remove('open');
}

async function saveSharedDeudasConfig() {
  const editId    = document.getElementById('sdm-id').value;
  const name      = document.getElementById('sdm-name').value.trim();
  const sheetName = document.getElementById('sdm-sheet').value.trim();
  const errEl     = document.getElementById('sdm-error');
  errEl.textContent = '';

  if (!name || !sheetName) { errEl.textContent = 'Nombre y hoja son obligatorios.'; return; }
  if (!getGasUrl()) { errEl.textContent = 'Configura la URL del servidor primero.'; return; }

  const checkboxes = document.getElementById('sdm-users').querySelectorAll('input[type=checkbox]:checked');
  const sharedWith = [...checkboxes].map(cb => ({
    name: cb.value,
    role: document.getElementById('sdm-role-' + cb.value)?.value ?? 'editor'
  }));

  errEl.style.color = 'var(--text2)';
  errEl.textContent = 'Guardando…';

  try {
    if (editId) {
      updateSharedDeudasMenu(parseInt(editId, 10), { name, sheetName, sharedWith });
    } else {
      addSharedDeudasMenu({ name, sheetName, sharedWith });
    }
    await pushSharedDeudasConfig();
    buildNav();
    renderSharedDeudasAdmin();
    closeShareDeudasModal();
    showToast('Deudas compartidas guardadas ✓');
  } catch (e) {
    errEl.style.color = 'var(--red)';
    errEl.textContent = 'Error: ' + e.message;
  }
}

function confirmDeleteSharedDeudas(id) {
  const m = getSharedDeudasMenu(id);
  if (!m) return;
  showConfirm(`¿Dejar de compartir "${m.name}"? Se eliminará de los dispositivos conectados en la próxima sincronización.`, async () => {
    deleteSharedDeudasMenu(id);
    if (getGasUrl()) await pushSharedDeudasConfig().catch(() => {});
    buildNav();
    renderSharedDeudasAdmin();
    if (typeof _currentView !== 'undefined' && _currentView === 'sdeudas-' + id) switchView('deudas');
    showToast('Deudas descompartidas', 'var(--yellow)');
  }, { icon: '💳', okLabel: 'Descompartir' });
}

// ── Exportar datos ───────────────────────────────────────
function exportData() {
  const d    = loadData();
  const json = JSON.stringify({ ...d, exportedAt: new Date().toISOString() }, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `cashmap-v2-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Exportado ✓');
}

// ── Importar datos ────────────────────────────────────────
function handleImportFile(input) {
  const file = input.files?.[0];
  if (!file) return;
  input.value = '';

  const reader = new FileReader();
  reader.onload = e => {
    let raw;
    try { raw = JSON.parse(e.target.result); }
    catch { showToast('JSON inválido', 'var(--red)'); return; }

    const txCount     = (raw.txs ?? raw.inicio ?? []).length;
    const menuCount   = (raw.customMenus ?? []).length;
    const homeTxCount = (raw.homeTxs ?? []).length;
    const deudaCount  = (raw.deudas ?? []).length;

    let msg = '¿Importar datos?';
    const lines = [];
    if (txCount)     lines.push(`${txCount} movimientos de inicio`);
    if (menuCount)   lines.push(`${menuCount} menús personalizados`);
    if (homeTxCount) lines.push(`${homeTxCount} movimientos de hogar`);
    if (deudaCount)  lines.push(`${deudaCount} deudas`);
    if (!lines.length) { showToast('Sin datos que importar', 'var(--yellow)'); return; }
    msg += '\n• ' + lines.join('\n• ');

    showConfirm(msg, () => {
      try {
        const stats = importV1Data(raw);
        buildNav();
        renderInicio();
        const toastParts = [];
        if (stats.txs)    toastParts.push(`${stats.txs} mov`);
        if (stats.menus)  toastParts.push(`${stats.menus} menús (${stats.menuTxs} reg)`);
        if (stats.deudas) toastParts.push(`${stats.deudas} deudas`);
        showToast('Importado: ' + toastParts.join(', '));
      } catch (err) {
        showToast('Error: ' + err.message, 'var(--red)');
      }
    }, { icon: '📥', okLabel: 'Importar' });
  };
  reader.readAsText(file);
}

// ── Eliminar usuario ──────────────────────────────────────
function confirmDeleteUser(userId) {
  const u = loadUsers().find(u => u.id === userId);
  if (!u) return;
  showConfirm(`¿Eliminar usuario "${u.name}"?`, () => {
    deleteUser(userId);
    renderAdminUsers();
    showToast('Usuario eliminado', 'var(--red)');
  }, { icon: '🗑️', okLabel: 'Eliminar' });
}

// ── Categorías ────────────────────────────────────────────
let _catsType = 'exp';

function openCatsModal() {
  _catsType = 'exp';
  _setCatsTypeUI();
  renderCatsList();
  closeCatForm();
  document.getElementById('cats-modal').classList.add('open');
}

function closeCatsModal() {
  document.getElementById('cats-modal').classList.remove('open');
}

function setCatsType(type) {
  _catsType = type;
  _setCatsTypeUI();
  renderCatsList();
  closeCatForm();
}

function _setCatsTypeUI() {
  document.getElementById('cats-type-exp').classList.toggle('active', _catsType === 'exp');
  document.getElementById('cats-type-inc').classList.toggle('active', _catsType === 'inc');
}

function renderCatsList() {
  const cats = loadData().globalCats[_catsType] ?? {};
  const el   = document.getElementById('cats-list');
  const entries = _sortCatEntries(Object.entries(cats));
  if (!entries.length) {
    el.innerHTML = '<div class="empty" style="padding:12px 0;font-size:.82rem">Sin categorías. Crea la primera.</div>';
    return;
  }
  el.innerHTML = entries.map(([key, cat]) => `
    <div class="cat-row">
      <span style="width:10px;height:10px;border-radius:50%;background:${cat.color};flex-shrink:0;display:inline-block"></span>
      <span class="cat-row-label">${esc(cat.label)}</span>
      <div class="cat-row-actions">
        <button onclick="openCatForm('${key}')">✏️</button>
        <button onclick="confirmDeleteCat('${key}')">🗑️</button>
      </div>
    </div>
  `).join('');
}

function openCatForm(key) {
  const cats = loadData().globalCats[_catsType] ?? {};
  const cat  = key ? cats[key] : null;
  document.getElementById('cat-form-key').value   = key ?? '';
  document.getElementById('cat-form-label').value = cat?.label ?? '';
  document.getElementById('cat-form-color').value = cat?.color ?? '#3b82f6';
  document.getElementById('cat-form-error').textContent = '';
  updateCatPreview();
  document.getElementById('cat-form').style.display = '';
  document.getElementById('cat-form-label').focus();
}

function closeCatForm() {
  document.getElementById('cat-form').style.display = 'none';
}

function updateCatPreview() {
  const color = document.getElementById('cat-form-color').value;
  const label = document.getElementById('cat-form-label').value || 'Vista previa';
  const prev  = document.getElementById('cat-form-preview');
  prev.textContent      = label;
  prev.style.background = color + '22';
  prev.style.color      = color;
}

function saveCatForm() {
  const key   = document.getElementById('cat-form-key').value.trim();
  const label = document.getElementById('cat-form-label').value.trim();
  const color = document.getElementById('cat-form-color').value;
  const errEl = document.getElementById('cat-form-error');
  errEl.textContent = '';

  if (!label) { errEl.textContent = 'Nombre obligatorio.'; return; }

  const d = loadData();
  if (!d.globalCats[_catsType]) d.globalCats[_catsType] = {};
  const cats = d.globalCats[_catsType];

  if (key) {
    cats[key] = { ...cats[key], label, color };
  } else {
    const base     = label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'cat';
    const finalKey = cats[base] ? base + '_' + Date.now() : base;
    cats[finalKey] = { label, color };
  }

  saveData();
  closeCatForm();
  renderCatsList();
  if (typeof _updateTxCatOptions === 'function') _updateTxCatOptions();
  showToast(key ? 'Categoría actualizada' : 'Categoría creada');
}

function confirmDeleteCat(key) {
  const cats = loadData().globalCats[_catsType] ?? {};
  const cat  = cats[key];
  if (!cat) return;
  showConfirm(`¿Eliminar categoría "${cat.label}"?`, () => {
    const d = loadData();
    delete d.globalCats[_catsType][key];
    saveData();
    renderCatsList();
    if (typeof _updateTxCatOptions === 'function') _updateTxCatOptions();
    showToast('Categoría eliminada', 'var(--red)');
  }, { icon: '🗑️', okLabel: 'Eliminar' });
}

function restoreDefaultCats() {
  showConfirm('¿Restaurar categorías predeterminadas? Solo añade las que falten, no borra las tuyas.', () => {
    const d = loadData();
    for (const side of ['inc', 'exp']) {
      if (!d.globalCats[side]) d.globalCats[side] = {};
      for (const [key, cat] of Object.entries(DEFAULT_CATS[side] ?? {})) {
        if (!d.globalCats[side][key]) d.globalCats[side][key] = { ...cat };
      }
    }
    saveData();
    renderCatsList();
    if (typeof _updateTxCatOptions === 'function') _updateTxCatOptions();
    showToast('Categorías predeterminadas restauradas ✓');
  }, { icon: '🏷️', okLabel: 'Restaurar' });
}

// ── Presupuestos ──────────────────────────────────────────
function openBudgetsModal() {
  _renderBudgetsList();
  document.getElementById('budgets-modal').classList.add('open');
}

function closeBudgetsModal() {
  document.getElementById('budgets-modal').classList.remove('open');
}

function _renderBudgetsList() {
  const d       = loadData();
  const cats    = d.globalCats.exp ?? {};
  const budgets = getBudgets();
  const el      = document.getElementById('budgets-list');
  const entries = _sortCatEntries(Object.entries(cats));
  if (!entries.length) {
    el.innerHTML = '<div class="empty" style="font-size:.82rem;padding:12px 0">Sin categorías de gastos</div>';
    return;
  }

  // Gasto del mes actual (todos los menús personalizados)
  const ym       = new Date().toISOString().slice(0, 7);
  const expByCat = {};
  for (const menu of (d.customMenus ?? [])) {
    for (const tx of (menu.data ?? []).filter(t => t.type === 'exp' && t.date?.startsWith(ym))) {
      expByCat[tx.category] = (expByCat[tx.category] ?? 0) + tx.amount;
    }
  }

  el.innerHTML = entries.map(([key, cat]) => {
    const monthly = budgets[key]?.monthly ?? '';
    const spent   = expByCat[key] ?? 0;
    const hasBudget = !!monthly;
    const pct       = hasBudget ? Math.min(100, Math.round((spent / monthly) * 100)) : 0;
    const col       = pct >= 100 ? 'var(--red)' : pct >= 80 ? 'var(--yellow)' : 'var(--green)';
    const excedido  = hasBudget ? Math.round((spent - monthly) * 100) / 100 : 0;
    const remaining = hasBudget ? Math.max(0, Math.round((monthly - spent) * 100) / 100) : 0;

    const progressHtml = hasBudget ? `
      <div style="margin-top:6px">
        <div style="height:4px;background:var(--bg3);border-radius:2px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${col};border-radius:2px;transition:width .3s"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:.68rem;margin-top:2px">
          <span style="color:${col};font-weight:700">${pct}%  gastado: ${fmtMoney(spent)}</span>
          ${excedido > 0
            ? `<span style="color:var(--red);font-weight:700">⚠ Excedido ${fmtMoney(excedido)}</span>`
            : remaining > 0
              ? `<span style="color:var(--text2)">Restante: ${fmtMoney(remaining)}</span>`
              : `<span style="color:var(--red);font-weight:700">¡Límite alcanzado!</span>`}
        </div>
      </div>` : (spent > 0 ? `<div style="font-size:.68rem;color:var(--text2);margin-top:4px">Gastado este mes: ${fmtMoney(spent)}</div>` : '');

    return `<div style="padding:8px 0;border-bottom:1px solid var(--border)">
      <div class="cat-row" style="gap:10px;border:none;padding:0">
        <span style="width:10px;height:10px;border-radius:50%;background:${cat.color};flex-shrink:0;display:inline-block"></span>
        <span class="cat-row-label">${esc(cat.label)}</span>
        <input type="number" id="budget-${key}" value="${monthly}" min="0" step="1"
               placeholder="Sin límite"
               style="width:100px;text-align:right;padding:5px 8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:.83rem">
        <span style="color:var(--text2);font-size:.78rem;flex-shrink:0">€/mes</span>
      </div>
      ${progressHtml}
    </div>`;
  }).join('');
}

function saveBudgetsModal() {
  const cats = loadData().globalCats.exp ?? {};
  for (const key of Object.keys(cats)) {
    const val = parseFloat(document.getElementById('budget-' + key)?.value ?? '');
    setBudget(key, isNaN(val) ? null : val);
  }
  closeBudgetsModal();
  renderInicio();
  showToast('Presupuestos guardados');
}

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
    const menu    = t.menuId == null ? null : getCustomMenu(t.menuId);
    const curr    = t.menuId == null ? '€' : (menu?.currency ?? '€');
    const amtStr  = t.menuId == null ? fmtMoney(t.amount) : _fmtCurr(t.amount, curr);
    const nextStr = t.recurringPaused
      ? '<span class="badge pendiente">⏸ Pausado</span>'
      : `Próx: ${fmtDate(t.recurringNext)}`;
    const menuArg  = t.menuId ?? 'null';
    // Mismo permiso que el resto de la app: viewer (global o por-menú
    // compartido) no puede pausar/editar/eliminar, solo ver el historial.
    const canWrite = t.menuId == null ? currentUser?.role !== 'viewer' : _canWriteMenuTxs(menu);
    return `<div class="cat-row">
      <span class="cat-row-label" style="font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.description || 'Recurrente')}</span>
      <span style="font-size:.72rem;color:var(--text2);flex-shrink:0">${esc(t.menuName)}</span>
      <span style="font-size:.72rem;flex-shrink:0">${amtStr}</span>
      <span style="font-size:.72rem;color:var(--text2);flex-shrink:0">${_RECURRING_PERIOD_LABEL[t.recurring] ?? esc(t.recurring)}</span>
      <span style="font-size:.72rem;flex-shrink:0">${nextStr}</span>
      <div class="cat-row-actions">
        ${canWrite ? (t.recurringPaused
          ? `<button title="Reanudar" onclick="_adminResumeRecurring(${menuArg},${t.id})">▶</button>`
          : `<button title="Pausar" onclick="_adminPauseRecurring(${menuArg},${t.id})">⏸</button>`) : ''}
        ${canWrite ? `<button title="Editar" onclick="adminEditRecurringTemplate(${menuArg},${t.id})">✏️</button>` : ''}
        <button title="Historial" onclick="openRecurringHistoryModal(${menuArg},${t.id})">📜</button>
        ${canWrite ? `<button title="Eliminar" onclick="adminDeleteRecurringTemplate(${menuArg},${t.id})">🗑️</button>` : ''}
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
