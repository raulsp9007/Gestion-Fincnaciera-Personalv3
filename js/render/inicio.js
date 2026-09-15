'use strict';

// ── Chart instances ───────────────────────────────────────
let _chart1 = null;
let _chart2 = null;
let _overviewCharts = {};

// ── Active month ──────────────────────────────────────────
let _inicioMonth = null;

// ── Helpers ───────────────────────────────────────────────
function fmtMoney(n) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 2
  }).format(n ?? 0);
}

function fmtDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function _monthLabel(ym) {
  const [y, m] = ym.split('-');
  return new Date(+y, +m - 1, 1)
    .toLocaleDateString('es-ES', { month: 'short', year: 'numeric' });
}

// ── Banner de recordatorios (recurrentes próximos) ────────
function _reminderWhen(dateStr) {
  const today = _nowDate();
  const diffDays = Math.round(
    (new Date(dateStr + 'T12:00:00') - new Date(today + 'T12:00:00')) / 86400000
  );
  if (diffDays <= 1) return 'mañana';
  return `en ${diffDays} días`;
}

function _reminderAmount(it) {
  if (it.menuId == null) return fmtMoney(it.amount);
  const menu = getCustomMenu(it.menuId);
  return _fmtCurr(it.amount, menu?.currency ?? '€');
}

function _maybeNotifyReminders(items) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const notified = new Set(getNotifiedReminders());
  items.filter(it => !notified.has(it.key)).forEach(it => {
    try {
      new Notification('CashMap — recordatorio', {
        body: `${it.description || 'Recurrente'}: ${_reminderWhen(it.recurringNext)}`,
        icon: './icon.svg'
      });
    } catch { /* navegador puede bloquear silenciosamente, no es fatal */ }
    markReminderNotified(it.key);
  });
}

const _RECURRING_LABEL = { semanal: 'semanal', mensual: 'mensual', anual: 'anual' };

// ── Resumen de plantillas recurrentes ─────────────────────
function _buildRecurringSummary() {
  const all = getAllRecurringTemplates();
  if (!all.length) return '';
  const active = all.filter(t => !t.recurringPaused).length;
  const paused = all.filter(t => t.recurringPaused).length;
  const activeLabel = `${active} plantilla${active === 1 ? '' : 's'} recurrente${active === 1 ? '' : 's'} activa${active === 1 ? '' : 's'}`;
  const pausedLabel = paused ? ` · ${paused} pausada${paused === 1 ? '' : 's'}` : '';
  return `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:.82rem">
    <span>🔁 ${activeLabel}${pausedLabel}</span>
    <a href="#" onclick="event.preventDefault();openAdminPanel().then(()=>switchAdminTab('recurrentes'))" style="color:var(--acc);font-weight:600;text-decoration:none;flex-shrink:0">Gestionar →</a>
  </div>`;
}

function openNewRecurringTemplateModal() {
  closeAdminPanel();
  openNewRecordModal();
  document.getElementById('tx-recurring').value = 'mensual';
}

function _buildReminderBanner() {
  const items = getUpcomingReminders();
  if (!items.length) return '';

  return items.map((it, idx) => {
    const showNotifBtn = idx === 0 && typeof Notification !== 'undefined' && Notification.permission === 'default';
    const origin = it.menuName ? ` <span style="color:var(--text2);font-weight:400">(${esc(it.menuName)})</span>` : '';
    const period = _RECURRING_LABEL[it.recurring] ?? 'periódica';

    return `<div class="reminder">
    <span class="icon">⏰</span>
    <div class="body">
      <div class="lead">Se repite <b>${_reminderWhen(it.recurringNext)}</b>: ${esc(it.description || 'Recurrente')}${origin} — ${_reminderAmount(it)}</div>
      <div class="sub">Recurrencia ${period} · próxima fecha ${fmtDate(it.recurringNext)}</div>
    </div>
    <div class="actions">
      ${showNotifBtn ? `<button class="btn-ghost-sm" onclick="requestReminderNotifications()">🔔 Activar notificaciones</button>` : ''}
      <button class="btn-x" title="Descartar" onclick="dismissReminderBanner('${it.key}')">✕</button>
    </div>
  </div>`;
  }).join('');
}

function dismissReminderBanner(key) {
  dismissReminders([key]);
  renderInicio();
}

function requestReminderNotifications() {
  Notification.requestPermission().then(() => renderInicio());
}

function _ym() {
  return _nowYM();
}

// ── Main render — Vista General ───────────────────────────
function renderInicio() {
  if (!_inicioMonth) _inicioMonth = _ym();

  Object.values(_overviewCharts).forEach(c => c?.destroy());
  _overviewCharts = {};
  if (_chart1) { _chart1.destroy(); _chart1 = null; }
  if (_chart2) { _chart2.destroy(); _chart2 = null; }

  const el    = document.getElementById('view-inicio');
  const d     = loadData();
  const menus = d.customMenus ?? [];
  const cats  = d.globalCats;

  const now    = new Date();
  const updStr = now.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) + ' ' +
                 now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  el.innerHTML = `
    <div class="overview-topbar">
      <span class="section-label">📊 VISTA GENERAL</span>
      <span class="overview-updated">Actualizado: ${updStr}</span>
    </div>
    ${_buildRecurringSummary()}
    ${_buildReminderBanner()}
    ${_buildMonthTabs()}
    ${menus.length
      ? `<div class="overview-grid">${menus.map(m => _buildOverviewCard(m, cats)).join('')}</div>`
      : `<div class="empty" style="margin-top:40px">Sin menús activos.<br>Crea uno desde el menú lateral.</div>`
    }
  `;

  for (const menu of menus) {
    _drawOverviewCharts(menu, cats);
  }

  _maybeNotifyReminders(getUpcomingReminders());
}

function _fmtNum(n) {
  return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0);
}

function _buildOverviewCard(menu, cats) {
  const txs = (menu.data ?? []).filter(t => (t.date ?? '').startsWith(_inicioMonth));
  const inc  = txs.filter(t => t.type === 'inc').reduce((s, t) => s + t.amount, 0);
  const exp  = txs.filter(t => t.type === 'exp').reduce((s, t) => s + t.amount, 0);
  const bal  = inc - exp;
  const curr = menu.currency ?? '';
  const carryover = carryoverBalance(menu.data ?? [], _inicioMonth);
  const totalBal   = carryover + bal;

  return `
    <div class="overview-card" onclick="switchView('menu-${menu.id}')" style="cursor:pointer">
      <div class="ovc-header">
        <span class="ovc-icon">${menu.icon ?? '📋'}</span>
        <span class="ovc-name">${esc(menu.name)}</span>
        <span class="ovc-curr-badge">${esc(curr)}</span>
      </div>
      <div class="ovc-stats">
        <div class="ovc-stat">
          <div class="ovc-stat-label">Ingresos</div>
          <div class="ovc-stat-value" style="color:var(--green)">${curr}${_fmtNum(inc)}</div>
        </div>
        <div class="ovc-stat">
          <div class="ovc-stat-label">Gastos</div>
          <div class="ovc-stat-value" style="color:var(--red)">${curr}${_fmtNum(exp)}</div>
        </div>
        <div class="ovc-stat ovc-stat-balance">
          <div class="ovc-stat-label">Balance</div>
          <div class="ovc-stat-value" style="color:${bal >= 0 ? 'var(--green)' : 'var(--red)'}">
            ${bal >= 0 ? '+' : ''}${curr}${_fmtNum(Math.abs(bal))}
          </div>
        </div>
      </div>
      ${carryover !== 0 ? `<div style="font-size:.72rem;color:var(--text2);margin:-6px 0 8px" title="Saldo arrastrado: ${curr}${_fmtNum(carryover)}">
        Saldo total: <strong style="color:${totalBal >= 0 ? 'var(--green)' : 'var(--red)'}">${curr}${_fmtNum(totalBal)}</strong>
        (arrastrado: ${curr}${_fmtNum(carryover)})
      </div>` : ''}
      <div class="ovc-charts">
        <div class="ovc-chart-col">
          <div class="ovc-chart-label">♥ Ingresos por cat.</div>
          <div style="height:130px;position:relative" id="ovc-inc-wrap-${menu.id}">
            <canvas id="ovc-inc-${menu.id}"></canvas>
          </div>
        </div>
        <div class="ovc-chart-col">
          <div class="ovc-chart-label">● Gastos por cat.</div>
          <div style="height:130px;position:relative" id="ovc-exp-wrap-${menu.id}">
            <canvas id="ovc-exp-${menu.id}"></canvas>
          </div>
        </div>
      </div>
    </div>
  `;
}

function _drawOverviewCharts(menu, cats) {
  if (typeof Chart === 'undefined') return;
  const txs  = (menu.data ?? []).filter(t => (t.date ?? '').startsWith(_inicioMonth));
  const curr = menu.currency ?? '';

  const makeDonut = (canvasId, wrapId, type, catMap) => {
    const totals = {};
    for (const t of txs.filter(t => t.type === type)) {
      totals[t.category] = (totals[t.category] ?? 0) + t.amount;
    }
    const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    if (!sorted.length) {
      const wrap = document.getElementById(wrapId);
      if (wrap) wrap.innerHTML = `<div class="ovc-empty-chart">Sin ${type === 'inc' ? 'ingresos' : 'gastos'}</div>`;
      return null;
    }
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;
    return new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels:   sorted.map(([k]) => catMap[k]?.label ?? k),
        datasets: [{
          data:            sorted.map(([, v]) => v),
          backgroundColor: sorted.map(([k]) => catMap[k]?.color ?? '#64748b'),
          borderWidth: 0, hoverOffset: 4
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '60%',
        plugins: {
          legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 10 }, boxWidth: 8, padding: 5 } },
          tooltip: { callbacks: { label: c => ` ${curr}${_fmtNum(c.raw)}` } }
        }
      }
    });
  };

  const ic = makeDonut(`ovc-inc-${menu.id}`, `ovc-inc-wrap-${menu.id}`, 'inc', cats.inc ?? {});
  const ec = makeDonut(`ovc-exp-${menu.id}`, `ovc-exp-wrap-${menu.id}`, 'exp', cats.exp ?? {});
  if (ic) _overviewCharts[`inc_${menu.id}`] = ic;
  if (ec) _overviewCharts[`exp_${menu.id}`] = ec;
}

// ── Month tabs ────────────────────────────────────────────
function _buildMonthTabs() {
  const months = [];
  const tz  = getTimezone();
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d   = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d.toLocaleDateString('en-CA', { timeZone: tz }).slice(0, 7));
  }
  return `<div class="month-tabs">
    ${months.map(ym => `
      <button class="month-tab ${ym === _inicioMonth ? 'active' : ''}"
              onclick="selectInicioMonth('${ym}')">
        ${_monthLabel(ym)}
      </button>
    `).join('')}
  </div>`;
}

function selectInicioMonth(ym) {
  _inicioMonth = ym;
  renderInicio();
}

// ── Recurring badge (v1 style) ────────────────────────────
function _recBadge(tx) {
  if (!tx.recurring) return '';
  const lbl = { semanal: 'Semanal', mensual: 'Mensual', anual: 'Anual' }[tx.recurring] || tx.recurring;
  let nextStr = '';
  if (tx.recurringNext) {
    const d = new Date(tx.recurringNext + 'T00:00:00');
    nextStr = ' · ' + d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  }
  const title = `Recurrencia: ${lbl}${tx.recurringNext ? ' — Próxima: ' + tx.recurringNext : ''}`;
  return `<span class="rec-badge" title="${esc(title)}">🔄 ${lbl}${nextStr}</span>`;
}

// ── Expandable note (v1 style) ────────────────────────────
function _renderNote(note) {
  if (!note || !note.trim()) return '<span style="color:var(--text2);font-size:.78rem">—</span>';
  if (note.length <= 40) return `<span style="color:var(--text2);font-size:.78rem">${esc(note)}</span>`;
  const uid = 'n' + Math.random().toString(36).slice(2, 8);
  return `<span id="${uid}t" style="color:var(--text2);font-size:.78rem;cursor:pointer"
    onclick="this.style.display='none';document.getElementById('${uid}f').style.display='inline'"
    >${esc(note.slice(0, 40))}…</span><span id="${uid}f"
    style="display:none;color:var(--text2);font-size:.78rem;cursor:pointer"
    onclick="this.style.display='none';document.getElementById('${uid}t').style.display='inline'"
    >${esc(note)}</span>`;
}

// ── Transaction table ─────────────────────────────────────
function _buildTxTable(txs, cats) {
  const sorted = [...txs].sort((a, b) =>
    (b.date + _padTime(b.time)).localeCompare(a.date + _padTime(a.time)));

  if (!sorted.length) return `
    <div class="tbl-wrap">
      <div class="empty">
        Sin movimientos este mes.<br>
        <button class="btn btn-primary btn-sm" style="margin-top:14px"
                onclick="openNewRecordModal()">+ Añadir primero</button>
      </div>
    </div>`;

  return `
    <div class="tbl-wrap">
      <div class="tbl-header">
        <h3>Movimientos</h3>
      </div>
      <div class="tbl-scroll">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Monto</th>
              <th>Descripción</th>
              <th>Tipo</th>
              <th>Categoría</th>
              <th>Notas</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${sorted.map(tx => _buildTxRow(tx, cats)).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function _buildTxRow(tx, cats) {
  const catMap    = cats[tx.type] ?? {};
  const cat       = catMap[tx.category] ?? { label: tx.category ?? '—', color: '#a78bfa' };
  const typeLabel = tx.type === 'inc' ? 'Ingreso' : 'Gasto';
  const sign      = tx.type === 'inc' ? '+' : '-';

  return `<tr>
    <td style="color:var(--text2);white-space:nowrap">${fmtDate(tx.date)}${tx.time ? `<br><span style="font-size:.68rem;opacity:.7">${fmtTime(tx.time)}</span>` : ''}</td>
    <td class="amount ${tx.type}" style="white-space:nowrap">
      ${sign}${fmtMoney(tx.amount)}${_recBadge(tx)}
    </td>
    <td style="font-weight:500">${esc(tx.description)} ${attachBadge(tx.attachments)}</td>
    <td><span class="badge ${tx.type}">${typeLabel}</span></td>
    <td>
      <span class="cat-dot" style="background:${cat.color}"></span>
      <span class="home-cat-badge">${esc(cat.label)}</span>
    </td>
    <td>${_renderNote(tx.notes)}</td>
    <td style="text-align:right;white-space:nowrap">
      <button class="btn-icon" title="Editar"   onclick="openEditTxModal(${tx.id})">✏️</button>
      <button class="btn-icon" title="Eliminar" onclick="confirmDeleteTx(${tx.id})">🗑️</button>
    </td>
  </tr>`;
}


// ── Tx modal — shared state ───────────────────────────────
let _txContext = { src: 'inicio', menuId: null }; // shared with custom-menu.js

// ── Category color helpers ────────────────────────────────
function _getCatColor(catKey) {
  const cats = loadData().globalCats;
  return cats.inc[catKey]?.color ?? cats.exp[catKey]?.color ?? '#64748b';
}

function _updateCatColorPicker() {
  const inp = document.getElementById('tx-cat-color');
  if (!inp) return;
  const catKey = document.getElementById('tx-cat').value;
  inp.value = _getCatColor(catKey);
}

function _saveCatColor() {
  const catKey = document.getElementById('tx-cat').value;
  const color  = document.getElementById('tx-cat-color').value;
  if (!catKey || !color) return;
  const d    = loadData();
  const side = d.globalCats.inc[catKey] ? 'inc' : 'exp';
  if (d.globalCats[side]?.[catKey]) {
    d.globalCats[side][catKey].color = color;
    saveData();
    showToast('Color guardado');
  }
}

// ── Modal open / close ────────────────────────────────────
function openNewRecordModal() {
  if (typeof _currentView !== 'undefined' && _currentView.startsWith('menu-')) {
    _txContext = { src: 'custom', menuId: parseInt(_currentView.slice(5), 10) };
  } else {
    _txContext = { src: 'inicio', menuId: null };
  }
  const curr = _txContext.menuId ? (getCustomMenu(_txContext.menuId)?.currency ?? '€') : '€';
  document.getElementById('tx-modal-curr').textContent = `(${curr})`;
  document.getElementById('tx-id').value              = '';
  document.getElementById('tx-modal-title').textContent = 'Nuevo movimiento';
  document.getElementById('tx-date').value            = _nowDate();
  document.getElementById('tx-time').value            = _nowTime();
  document.getElementById('tx-amount').value          = '';
  document.getElementById('tx-desc').value            = '';
  document.getElementById('tx-notes').value           = '';
  document.getElementById('tx-recurring').value       = '';
  document.getElementById('tx-error').textContent     = '';
  document.getElementById('tx-type').value            = 'exp';
  _updateTxCatOptions();
  _updateCatColorPicker();
  initAttachModal([]);
  document.getElementById('tx-modal').classList.add('open');
}

function openEditTxModal(txId) {
  _txContext = { src: 'inicio', menuId: null };
  const tx   = getTxs().find(t => t.id === txId);
  if (!tx) return;
  document.getElementById('tx-modal-curr').textContent = '(€)';
  document.getElementById('tx-id').value              = txId;
  document.getElementById('tx-modal-title').textContent = 'Editar movimiento';
  document.getElementById('tx-date').value            = tx.date;
  document.getElementById('tx-time').value            = tx.time ?? '';
  document.getElementById('tx-amount').value          = tx.amount;
  document.getElementById('tx-desc').value            = tx.description;
  document.getElementById('tx-notes').value           = tx.notes ?? '';
  document.getElementById('tx-recurring').value       = tx.recurring || '';
  document.getElementById('tx-error').textContent     = '';
  document.getElementById('tx-type').value            = tx.type;  // 1. set type
  _updateTxCatOptions();                                           // 2. populate cats
  document.getElementById('tx-cat').value             = tx.category; // 3. restore cat
  _updateCatColorPicker();
  initAttachModal(tx.attachments ?? []);
  document.getElementById('tx-modal').classList.add('open');
}

function onTxTypeChange() {
  _updateTxCatOptions();
  _updateCatColorPicker();
}

function _updateTxCatOptions() {
  const type = document.getElementById('tx-type')?.value ?? 'exp';
  const cats = loadData().globalCats[type] ?? {};
  document.getElementById('tx-cat').innerHTML =
    _sortCatEntries(Object.entries(cats)).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('');
}

function closeTxModal() {
  discardNewAttachments();
  document.getElementById('tx-modal').classList.remove('open');
}

async function saveTx() {
  const id     = document.getElementById('tx-id').value;
  const date   = document.getElementById('tx-date').value;
  const amount = parseFloat(document.getElementById('tx-amount').value);
  const type   = document.getElementById('tx-type').value;
  const cat    = document.getElementById('tx-cat').value;
  const desc   = document.getElementById('tx-desc').value.trim();
  const notes  = document.getElementById('tx-notes').value.trim();
  const errEl  = document.getElementById('tx-error');
  errEl.textContent = '';

  if (!date)                 { errEl.textContent = 'Fecha obligatoria.'; return; }
  if (!amount || amount <= 0){ errEl.textContent = 'Importe debe ser mayor que 0.'; return; }
  if (!desc)                 { errEl.textContent = 'Descripción obligatoria.'; return; }

  let attachments = [];
  try {
    attachments = await saveAllAttachments();
  } catch (e) {
    errEl.textContent = 'Error al guardar adjuntos: ' + e.message;
    return;
  }

  const recurring     = document.getElementById('tx-recurring').value || false;
  const recurringNext = recurring ? nextOccurrence(date, recurring) : undefined;
  const time   = document.getElementById('tx-time').value || '';
  const fields = { date, time, amount, description: desc, type, category: cat, notes,
                   recurring, recurringNext, attachments };

  // Guard contra plantillas recurrentes duplicadas: crear un movimiento NUEVO
  // con recurrencia marcada, cuando ya existe otra plantilla activa con la
  // misma descripción en el mismo origen, es la causa más común de plantillas
  // duplicadas (alguien re-crea a mano un pago que ya se repite solo).
  if (!id && recurring) {
    const menuId = _txContext.src === 'custom' ? _txContext.menuId : null;
    const dup = getAllRecurringTemplates().find(t =>
      t.menuId === menuId && !t.recurringPaused &&
      (t.description || '').trim().toLowerCase() === desc.trim().toLowerCase()
    );
    if (dup) {
      showConfirm(
        `Ya existe una plantilla recurrente activa para "${esc(desc)}" (próxima: ${fmtDate(dup.recurringNext)}). ¿Crear otra de todas formas?`,
        () => _finishSaveTx(id, fields),
        { icon: '⚠️', okLabel: 'Crear otra' }
      );
      return;
    }
  }
  _finishSaveTx(id, fields);
}

function _finishSaveTx(id, fields) {
  if (_txContext.src === 'custom') {
    const mid = _txContext.menuId;
    const menu = getCustomMenu(mid);
    if (typeof _logHistory === 'function') _logHistory({ menuId: mid, menuName: menu?.name ?? '', action: id ? 'edit' : 'create', desc: fields.description, amount: fields.amount, txType: fields.type });
    if (id) updateMenuTx(mid, parseInt(id, 10), fields);
    else    addMenuTx(mid, fields);
    document.getElementById('tx-modal').classList.remove('open');
    renderCustomMenu(mid);
    onMenuSaved(mid);
  } else {
    if (id) updateTx(parseInt(id, 10), fields);
    else    addTx(fields);
    document.getElementById('tx-modal').classList.remove('open');
    renderInicio();
    syncPrivateData().catch(() => {});
  }
  showToast(id ? 'Movimiento actualizado' : 'Movimiento guardado');
}

// ── Budget progress bars ──────────────────────────────────
function _buildBudgetBars(txs) {
  const budgets = getBudgets();
  const entries = Object.entries(budgets);
  if (!entries.length) return '';

  const cats     = loadData().globalCats.exp ?? {};
  const expByCat = {};
  for (const tx of txs.filter(t => t.type === 'exp')) {
    expByCat[tx.category] = (expByCat[tx.category] ?? 0) + tx.amount;
  }

  const bars = entries.map(([key, { monthly }]) => {
    const cat       = cats[key] ?? { label: key, color: '#64748b' };
    const spent     = expByCat[key] ?? 0;
    const excedido  = Math.round((spent - monthly) * 100) / 100;
    const remaining = Math.max(0, Math.round((monthly - spent) * 100) / 100);
    const pct       = Math.min(100, Math.round((spent / monthly) * 100));
    const col       = pct >= 100 ? 'var(--red)' : pct >= 80 ? 'var(--yellow)' : 'var(--green)';
    return `<div style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;font-size:.75rem;margin-bottom:4px">
        <span style="display:flex;align-items:center;gap:6px">
          <span style="width:8px;height:8px;border-radius:50%;background:${cat.color};display:inline-block;flex-shrink:0"></span>
          ${esc(cat.label)}
        </span>
        <span style="color:${col};font-weight:600">${fmtMoney(spent)} / ${fmtMoney(monthly)}</span>
      </div>
      <div style="height:6px;background:var(--bg3);border-radius:3px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:${col};border-radius:3px;transition:width .4s"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:.7rem;margin-top:3px">
        <span style="color:${col};font-weight:700">${pct}%</span>
        ${excedido > 0
          ? `<span style="color:var(--red);font-weight:700">⚠ Excedido ${fmtMoney(excedido)}</span>`
          : remaining > 0
            ? `<span style="color:var(--text2)">Restante: ${fmtMoney(remaining)}</span>`
            : `<span style="color:var(--red);font-weight:700">¡Límite alcanzado!</span>`}
      </div>
    </div>`;
  }).join('');

  return `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:18px;margin-bottom:24px">
    <h3 style="font-size:.85rem;font-weight:600;margin-bottom:14px;color:var(--text2)">Presupuestos del mes</h3>
    ${bars}
  </div>`;
}

function confirmDeleteTx(txId) {
  const tx = getTxs().find(t => t.id === txId);
  if (!tx) return;
  showConfirm(`¿Eliminar "${esc(tx.description)}"?`, () => {
    markDeletedForSync('inicio', txId);
    deleteTx(txId);
    renderInicio();
    syncPrivateData().catch(() => {});
    showToast('Movimiento eliminado', 'var(--red)');
  }, { icon: '🗑️', okLabel: 'Eliminar' });
}
