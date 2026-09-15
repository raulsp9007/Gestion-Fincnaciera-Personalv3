'use strict';

// ── Per-menu state ────────────────────────────────────────
const _menuMonth    = {};
const _menuCharts   = {};
const _menuSections = {};
const _menuCols     = {};

// ── Column definitions ────────────────────────────────────
const _COL_DEFS = [
  { key: 'fecha', label: 'Fecha' },
  { key: 'monto', label: 'Monto' },
  { key: 'desc',  label: 'Descripción' },
  { key: 'tipo',  label: 'Tipo' },
  { key: 'cat',   label: 'Categoría' },
  { key: 'notas', label: 'Notas' },
];
const _COL_KEYS = _COL_DEFS.map(c => c.key);

// ── Section visibility (bar / cat / week) ─────────────────
function _getSections(menuId) {
  if (!_menuSections[menuId]) {
    try {
      const all = JSON.parse(localStorage.getItem('cashmap_v2_sections') ?? '{}');
      const def = { bar: true, cat: true, week: true, budget: true, catLimit: 8, inc: false, incLimit: 8 };
      _menuSections[menuId] = all[menuId] ? { ...def, ...all[menuId] } : def;
    } catch { _menuSections[menuId] = { bar: true, cat: true, week: true, budget: true, catLimit: 8, inc: false, incLimit: 8 }; }
  }
  return _menuSections[menuId];
}

function _saveSections(menuId) {
  try {
    const all = JSON.parse(localStorage.getItem('cashmap_v2_sections') ?? '{}');
    all[menuId] = _menuSections[menuId];
    localStorage.setItem('cashmap_v2_sections', JSON.stringify(all));
  } catch {}
}

function toggleMenuSection(menuId, key) {
  const s = _getSections(menuId);
  s[key] = !s[key];
  _saveSections(menuId);
  renderCustomMenu(menuId);
}

function setCatLimit(menuId, n) {
  const s = _getSections(menuId);
  s.catLimit = Math.max(1, Math.min(20, n || 8));
  _saveSections(menuId);
  renderCustomMenu(menuId);
}

function setIncLimit(menuId, n) {
  const s = _getSections(menuId);
  s.incLimit = Math.max(1, Math.min(20, n || 8));
  _saveSections(menuId);
  renderCustomMenu(menuId);
}

// ── Column config ─────────────────────────────────────────
function _getCols(menuId) {
  if (!_menuCols[menuId]) {
    try {
      const all   = JSON.parse(localStorage.getItem('cashmap_v2_cols') ?? '{}');
      const saved = all[menuId];
      _menuCols[menuId] = saved
        ? { visible: saved.visible, order: saved.order }
        : { visible: [..._COL_KEYS], order: [..._COL_KEYS] };
    } catch {
      _menuCols[menuId] = { visible: [..._COL_KEYS], order: [..._COL_KEYS] };
    }
  }
  return _menuCols[menuId];
}

function _saveCols(menuId) {
  try {
    const cfg = _menuCols[menuId];
    const all = JSON.parse(localStorage.getItem('cashmap_v2_cols') ?? '{}');
    all[menuId] = { visible: cfg.visible, order: cfg.order };
    localStorage.setItem('cashmap_v2_cols', JSON.stringify(all));
  } catch {}
}

function _colsToggle(menuId, key) {
  const cfg = _getCols(menuId);
  const idx = cfg.visible.indexOf(key);
  if (idx >= 0) cfg.visible.splice(idx, 1);
  else          cfg.visible.push(key);
  _saveCols(menuId);
  _renderColsPanel(menuId);
  renderCustomMenu(menuId);
}

function _colsMove(menuId, key, dir) {
  const cfg = _getCols(menuId);
  const idx = cfg.order.indexOf(key);
  const to  = idx + dir;
  if (to < 0 || to >= cfg.order.length) return;
  [cfg.order[idx], cfg.order[to]] = [cfg.order[to], cfg.order[idx]];
  _saveCols(menuId);
  _renderColsPanel(menuId);
  renderCustomMenu(menuId);
}

// ── Week helpers ──────────────────────────────────────────
const _WEEK_LABELS = ['Sem 1 (1-7)', 'Sem 2 (8-14)', 'Sem 3 (15-21)', 'Sem 4 (22+)'];

function _dayToWeek(dateStr) {
  const d = parseInt((dateStr ?? '').slice(8, 10), 10);
  if (d <= 7)  return 0;
  if (d <= 14) return 1;
  if (d <= 21) return 2;
  return 3;
}

// ── Main render ───────────────────────────────────────────
function renderCustomMenu(menuId) {
  const menu = getCustomMenu(menuId);
  if (!menu) { switchView('inicio'); return; }
  if (menu.menuType === 'vehicle' || menu.menuType === 'fuel') { renderVehicleMenu(menuId); return; }

  if (!_menuMonth[menuId]) _menuMonth[menuId] = _nowYM();
  const ym      = _menuMonth[menuId];
  const cats    = loadData().globalCats;
  const allTxs  = getMenuTxs(menuId);
  const monthTxs = allTxs.filter(t => t.date.startsWith(ym));
  const curr    = menu.currency || '€';
  const sec     = _getSections(menuId);

  // Read filter state before wiping innerHTML
  const fSearch = document.getElementById(`cmf-s-${menuId}`)?.value ?? '';
  const fType   = document.getElementById(`cmf-t-${menuId}`)?.value ?? '';
  const fCat    = document.getElementById(`cmf-c-${menuId}`)?.value ?? '';
  const fFrom   = document.getElementById(`cmf-f-${menuId}`)?.value ?? '';
  const fTo     = document.getElementById(`cmf-to-${menuId}`)?.value ?? '';

  const inc = monthTxs.filter(t => t.type === 'inc').reduce((s, t) => s + t.amount, 0);
  const exp = monthTxs.filter(t => t.type === 'exp').reduce((s, t) => s + t.amount, 0);
  const bal = inc - exp;
  const carryover = carryoverBalance(allTxs, ym);
  const totalBal   = carryover + bal;

  // 4th card
  const thisYM = _nowYM();
  let fourthCard;
  if (ym === thisYM) {
    const today   = new Date();
    const daysIn  = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const dayOf   = today.getDate();
    const projExp = dayOf > 0 ? Math.round((exp / dayOf) * daysIn * 100) / 100 : exp;
    const projNet = inc - projExp;
    fourthCard = `<div class="card ${projNet >= 0 ? '' : 'red'}">
      <div class="label">Proyección al ${daysIn}</div>
      <div class="value" style="font-size:1.15rem;color:var(--text2)">${projNet >= 0 ? '+' : ''}${_fmtCurr(Math.abs(projNet), curr)}</div>
      <div style="font-size:.72rem;color:var(--text2);margin-top:2px">gasto est. ${_fmtCurr(projExp, curr)}</div>
    </div>`;
  } else {
    fourthCard = `<div class="card blue">
      <div class="label">Registros</div>
      <div class="value" style="font-size:1.6rem">${monthTxs.length}</div>
      <div style="font-size:.72rem;color:var(--text2);margin-top:2px">de ${allTxs.length} total</div>
    </div>`;
  }

  // Hidden-section restore chips
  const hiddenChips = [
    !sec.bar    && { key: 'bar',    label: 'Ingresos vs Gastos' },
    !sec.cat    && { key: 'cat',    label: 'Gastos por categoría' },
    !sec.inc    && { key: 'inc',    label: 'Ingresos por categoría' },
    !sec.week   && { key: 'week',   label: 'Gastos por semana' },
    !sec.budget && { key: 'budget', label: 'Presupuesto mensual' },
  ].filter(Boolean);
  const hiddenBar = hiddenChips.length
    ? `<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
        ${hiddenChips.map(h =>
          `<button class="btn btn-ghost btn-sm" onclick="toggleMenuSection(${menuId},'${h.key}')">+ ${h.label}</button>`
        ).join('')}
       </div>`
    : '';

  const el = document.getElementById('view-custom');
  const _focusInfo = _captureFocusWithin(el);
  el.innerHTML = `
    <div class="menu-header">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span style="font-size:1.6rem">${esc(menu.icon ?? '📋')}</span>
        <h2 style="font-size:1.1rem;font-weight:700">${esc(menu.name)}</h2>
        ${menu.shared ? (() => {
          const others = (menu.sharedWith ?? []).filter(u => u.name !== currentUser?.name);
          const names  = others.length ? others.map(u => u.name).join(', ') : 'solo tú';
          return `<span title="Compartido con: ${esc(names)}" style="font-size:.68rem;padding:2px 8px;border-radius:99px;background:var(--acc)22;color:var(--acc);font-weight:600;cursor:default">Compartido · ${esc(names)}</span>`;
        })() : ''}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${_canWriteMenuTxs(menu) ? `
          <button class="btn btn-ghost btn-sm" onclick="openMenuImportPicker(${menuId})">📥 Importar</button>
        ` : ''}
        ${_canEditMenu(menu) ? `
          ${!menu.shared ? `
            <button class="btn btn-ghost btn-sm" onclick="openEditMenuModal(${menuId})">✏️ Editar</button>
            <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="confirmDeleteMenu(${menuId})">🗑️</button>
          ` : ''}
          <button class="btn btn-ghost btn-sm" onclick="openShareModal(${menuId})">🔗 ${menu.shared ? 'Acceso' : 'Compartir'}</button>
        ` : ''}
        <button class="btn btn-ghost btn-sm" onclick="generateMenuReport(${menuId})">📊 Reporte</button>
        ${menu.shared ? `<button class="btn btn-ghost btn-sm" onclick="openMenuHistory(${menuId})">📋 Historial</button>` : ''}
        ${menu.shared ? `<button class="btn btn-ghost btn-sm" title="Fuerza push+pull completo de todos los registros" onclick="forceFullMenuSync(${menuId})">↺ Sync</button>` : ''}
      </div>
    </div>
    ${_menuMonthTabs(menuId, ym)}
    <div class="cards">
      <div class="card green"><div class="label">Ingresos</div><div class="value">${_fmtCurr(inc, curr)}</div></div>
      <div class="card red"><div class="label">Gastos</div><div class="value">${_fmtCurr(exp, curr)}</div></div>
      <div class="card card-balance ${bal >= 0 ? 'blue' : 'red'}"><div class="label">Balance</div><div class="value">${_fmtCurr(bal, curr)}</div></div>
      ${fourthCard}
      <div class="card ${totalBal >= 0 ? 'blue' : 'red'}" title="Incluye saldo arrastrado de meses anteriores: ${_fmtCurr(carryover, curr)}">
        <div class="label">Saldo total</div>
        <div class="value">${_fmtCurr(totalBal, curr)}</div>
        <div style="font-size:.7rem;color:var(--text2);margin-top:2px">arrastrado: ${_fmtCurr(carryover, curr)}</div>
      </div>
    </div>
    ${hiddenBar}
    <div class="charts">
      ${sec.bar ? `<div class="chart-box">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <h3 style="margin:0">Ingresos vs Gastos</h3>
          <button class="btn-icon" title="Ocultar sección" onclick="toggleMenuSection(${menuId},'bar')" style="opacity:.6;font-size:.85rem">🙈</button>
        </div>
        <canvas id="cm-chart-bar-${menuId}" height="160"></canvas>
      </div>` : ''}
      ${sec.cat ? `<div class="chart-box">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <h3 style="margin:0">Gastos por categoría</h3>
          <div style="display:flex;gap:6px;align-items:center">
            <select class="btn btn-ghost btn-sm" style="padding:4px 6px;cursor:pointer" title="Categorías a mostrar"
              onchange="setCatLimit(${menuId},+this.value)">
              ${[3,4,5,6,7,8,9,10,12,15].map(n => `<option value="${n}"${n===sec.catLimit?' selected':''}>${n}</option>`).join('')}
            </select>
            <button class="btn btn-ghost btn-sm" onclick="openMenuCatColors(${menuId})">🎨 Colores</button>
            <button class="btn-icon" title="Ocultar sección" onclick="toggleMenuSection(${menuId},'cat')" style="opacity:.6;font-size:.85rem">🙈</button>
          </div>
        </div>
        <canvas id="cm-chart-cat-${menuId}" height="160"></canvas>
      </div>` : ''}
      ${sec.inc ? `<div class="chart-box">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <h3 style="margin:0">Ingresos por categoría</h3>
          <div style="display:flex;gap:6px;align-items:center">
            <select class="btn btn-ghost btn-sm" style="padding:4px 6px;cursor:pointer" title="Categorías a mostrar"
              onchange="setIncLimit(${menuId},+this.value)">
              ${[3,4,5,6,7,8,9,10,12,15].map(n => `<option value="${n}"${n===(sec.incLimit??8)?' selected':''}>${n}</option>`).join('')}
            </select>
            <button class="btn-icon" title="Ocultar sección" onclick="toggleMenuSection(${menuId},'inc')" style="opacity:.6;font-size:.85rem">🙈</button>
          </div>
        </div>
        <canvas id="cm-chart-inc-${menuId}" height="160"></canvas>
      </div>` : ''}
      ${sec.week ? `<div class="chart-box" style="grid-column:1/-1">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <h3 style="margin:0;font-size:.78rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text2)">Gastos por semana</h3>
          <button class="btn-icon" title="Ocultar sección" onclick="toggleMenuSection(${menuId},'week')" style="opacity:.6;font-size:.85rem">🙈</button>
        </div>
        <canvas id="cm-chart-week-${menuId}" height="160"></canvas>
      </div>` : ''}
    </div>
    ${_menuBudgetSection(monthTxs, cats, curr, menuId, sec)}
    ${_menuTxTable(menu, monthTxs, cats, curr, fSearch, fType, fCat, fFrom, fTo)}
  `;
  _restoreFocusWithin(_focusInfo);

  _drawMenuCharts(menuId, ym, allTxs, monthTxs, cats, curr, sec);
}

// ── Budget progress in menu view ──────────────────────────
function _menuBudgetSection(monthTxs, cats, curr, menuId, sec) {
  if (sec?.budget === false) return '';
  const budgets = getBudgets();
  const entries = Object.entries(budgets);
  if (!entries.length) return '';

  const expByCat = {};
  for (const tx of monthTxs.filter(t => t.type === 'exp')) {
    expByCat[tx.category] = (expByCat[tx.category] ?? 0) + tx.amount;
  }

  const bars = entries.map(([key, { monthly }]) => {
    const cat       = cats.exp?.[key] ?? { label: key, color: '#64748b' };
    const spent     = expByCat[key] ?? 0;
    if (!spent && !monthly) return '';
    const pct       = Math.min(100, Math.round((spent / monthly) * 100));
    const col       = pct >= 100 ? 'var(--red)' : pct >= 80 ? 'var(--yellow)' : 'var(--green)';
    const excedido  = Math.round((spent - monthly) * 100) / 100;
    const remaining = Math.max(0, Math.round((monthly - spent) * 100) / 100);
    return `<div style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;font-size:.75rem;margin-bottom:4px">
        <span style="display:flex;align-items:center;gap:5px">
          <span style="width:8px;height:8px;border-radius:50%;background:${cat.color};display:inline-block;flex-shrink:0"></span>
          ${esc(cat.label)}
        </span>
        <span style="color:${col};font-weight:600">${_fmtCurr(spent, curr)} / ${_fmtCurr(monthly, curr)}</span>
      </div>
      <div style="height:5px;background:var(--bg3);border-radius:3px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:${col};border-radius:3px;transition:width .4s"></div>
      </div>
      ${excedido > 0
        ? `<div style="font-size:.68rem;color:var(--red);margin-top:2px">⚠ Excedido ${_fmtCurr(excedido, curr)}</div>`
        : remaining > 0
          ? `<div style="font-size:.68rem;color:var(--text2);margin-top:2px">${pct}% · Restante ${_fmtCurr(remaining, curr)}</div>`
          : `<div style="font-size:.68rem;color:var(--red);margin-top:2px">¡Límite alcanzado!</div>`}
    </div>`;
  }).filter(Boolean).join('');

  if (!bars) return '';
  return `<div class="chart-box" style="margin-bottom:16px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h3 style="margin:0;font-size:.78rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text2)">Presupuesto mensual</h3>
      <div style="display:flex;gap:6px;align-items:center">
        <button class="btn btn-ghost btn-sm" onclick="openBudgetsModal()">✏️ Editar</button>
        <button class="btn-icon" title="Ocultar sección" onclick="toggleMenuSection(${menuId},'budget')" style="opacity:.6;font-size:.85rem">🙈</button>
      </div>
    </div>
    ${bars}
  </div>`;
}

// ── PDF report ────────────────────────────────────────────
function generateMenuReport(menuId) {
  const menu = getCustomMenu(menuId);
  if (!menu) return;
  const ym       = _menuMonth[menuId] || _nowYM();
  const allTxs   = getMenuTxs(menuId);
  const monthTxs = allTxs.filter(t => t.date.startsWith(ym));
  const cats     = loadData().globalCats;
  const curr     = menu.currency || '€';
  const budgets  = getBudgets();

  const inc = monthTxs.filter(t => t.type === 'inc').reduce((s, t) => s + t.amount, 0);
  const exp = monthTxs.filter(t => t.type === 'exp').reduce((s, t) => s + t.amount, 0);
  const bal = inc - exp;

  const expByCat = {};
  for (const tx of monthTxs.filter(t => t.type === 'exp')) {
    expByCat[tx.category] = (expByCat[tx.category] ?? 0) + tx.amount;
  }

  const fmt = n => (n ?? 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + curr;
  const monthLabel = new Date(ym + '-01').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  const sorted = [...monthTxs].sort((a, b) =>
    (b.date + _padTime(b.time)).localeCompare(a.date + _padTime(a.time)) || (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  const catRows = Object.entries(expByCat).map(([key, amount]) => {
    const cat    = cats.exp?.[key] ?? { label: key, color: '#64748b' };
    const budget = budgets[key]?.monthly;
    const pct    = budget ? Math.min(100, Math.round(amount / budget * 100)) : null;
    return `<tr>
      <td style="padding:5px 10px">
        <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${cat.color};margin-right:6px;vertical-align:middle"></span>${esc(cat.label)}
      </td>
      <td style="padding:5px 10px;text-align:right;font-weight:600;color:#ef4444">${fmt(amount)}</td>
      <td style="padding:5px 10px;text-align:right;color:${pct != null && pct >= 100 ? '#ef4444' : '#64748b'}">${pct != null ? pct + '% de ' + fmt(budget) : '—'}</td>
    </tr>`;
  }).join('');

  const txRows = sorted.map(tx => {
    const sign  = tx.type === 'inc' ? '+' : '-';
    const color = tx.type === 'inc' ? '#22c55e' : '#ef4444';
    const cat   = (tx.type === 'inc' ? cats.inc : cats.exp)?.[tx.category] ?? { label: tx.category ?? '' };
    return `<tr>
      <td style="padding:5px 10px;color:#64748b;font-size:.8rem;white-space:nowrap">${tx.date?.slice(0,10) ?? ''}</td>
      <td style="padding:5px 10px">${esc(tx.description ?? '')}</td>
      <td style="padding:5px 10px;color:#64748b;font-size:.8rem">${esc(cat.label)}</td>
      <td style="padding:5px 10px;text-align:right;font-weight:600;color:${color};white-space:nowrap">${sign}${fmt(tx.amount)}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Reporte ${esc(menu.name)} — ${monthLabel}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,sans-serif;color:#1e293b;padding:32px;font-size:14px}
h1{font-size:1.4rem;margin-bottom:4px}
.sub{color:#64748b;font-size:.82rem;margin-bottom:24px}
.summary{display:flex;gap:14px;margin-bottom:24px;flex-wrap:wrap}
.card{flex:1;min-width:130px;padding:14px 16px;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0}
.card .lbl{font-size:.68rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}
.card .val{font-size:1.25rem;font-weight:800}
.green{color:#22c55e}.red{color:#ef4444}
h2{font-size:.75rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#64748b;margin:24px 0 8px;padding-bottom:4px;border-bottom:1px solid #e2e8f0}
table{width:100%;border-collapse:collapse}
thead th{padding:5px 10px;text-align:left;font-size:.7rem;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0}
tbody tr{border-bottom:1px solid #f1f5f9}
.footer{margin-top:32px;font-size:.7rem;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:10px}
@media print{body{padding:16px}}
</style></head><body>
<h1>${esc(menu.icon ?? '📋')} ${esc(menu.name)}</h1>
<div class="sub">Reporte de ${monthLabel} &nbsp;·&nbsp; Generado el ${new Date().toLocaleDateString('es-ES')}</div>
<div class="summary">
  <div class="card"><div class="lbl">Ingresos</div><div class="val green">${fmt(inc)}</div></div>
  <div class="card"><div class="lbl">Gastos</div><div class="val red">${fmt(exp)}</div></div>
  <div class="card"><div class="lbl">Balance</div><div class="val ${bal >= 0 ? 'green' : 'red'}">${bal >= 0 ? '+' : ''}${fmt(bal)}</div></div>
</div>
${Object.keys(expByCat).length ? `<h2>Gastos por categoría</h2>
<table><thead><tr><th>Categoría</th><th style="text-align:right">Monto</th><th style="text-align:right">Presupuesto</th></tr></thead>
<tbody>${catRows}</tbody></table>` : ''}
${sorted.length ? `<h2>Movimientos (${sorted.length})</h2>
<table><thead><tr><th>Fecha</th><th>Descripción</th><th>Categoría</th><th style="text-align:right">Monto</th></tr></thead>
<tbody>${txRows}</tbody></table>` : '<p style="margin-top:16px;color:#64748b;font-style:italic">Sin movimientos este mes.</p>'}
<div class="footer">💰 CashMap &nbsp;·&nbsp; Reporte generado automáticamente</div>
<script>window.onload=()=>window.print()<\/script>
</body></html>`;

  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) { showToast('Habilita ventanas emergentes para ver el reporte', 'var(--yellow)', 4000); return; }
  w.document.write(html);
  w.document.close();
}

// ── Menu charts ───────────────────────────────────────────
function _drawMenuCharts(menuId, ym, allTxs, monthTxs, cats, curr, sec) {
  if (!_menuCharts[menuId]) _menuCharts[menuId] = {};
  for (const key of ['bar', 'cat', 'inc', 'week']) {
    if (_menuCharts[menuId][key]) { _menuCharts[menuId][key].destroy(); _menuCharts[menuId][key] = null; }
  }
  if (typeof Chart === 'undefined') return;

  // ── Bar — monthly inc vs exp ──────────────────────────
  if (sec.bar) {
    const months = [...new Set(allTxs.map(t => t.date.slice(0, 7)))].sort();
    const barInc = months.map(m => allTxs.filter(t => t.type === 'inc' && t.date.startsWith(m)).reduce((s, t) => s + t.amount, 0));
    const barExp = months.map(m => allTxs.filter(t => t.type === 'exp' && t.date.startsWith(m)).reduce((s, t) => s + t.amount, 0));
    const ctx1   = document.getElementById(`cm-chart-bar-${menuId}`);
    if (ctx1 && months.length) {
      _menuCharts[menuId].bar = new Chart(ctx1, {
        type: 'bar',
        data: {
          labels: months.map(m => _monthLabel(m)),
          datasets: [
            { label: 'Ingresos', data: barInc, backgroundColor: '#22c55e99', borderRadius: 4 },
            { label: 'Gastos',   data: barExp, backgroundColor: '#ef444499', borderRadius: 4 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 10, padding: 8 } },
            tooltip: { callbacks: { label: c => ` ${_fmtCurr(c.raw, curr)}` } }
          },
          scales: {
            x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { display: false } },
            y: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: '#1e293b' } }
          }
        }
      });
    }
  }

  // ── Doughnut — top expense cats (mes seleccionado) ────
  if (sec.cat) {
    const catTotals = {};
    for (const t of monthTxs.filter(t => t.type === 'exp')) {
      catTotals[t.category] = (catTotals[t.category] ?? 0) + t.amount;
    }
    const sorted = Object.entries(catTotals).sort((a, b) => b[1] - a[1]).slice(0, sec.catLimit ?? 8);
    const ctx2   = document.getElementById(`cm-chart-cat-${menuId}`);
    if (ctx2 && sorted.length) {
      const expCats = cats.exp ?? {};
      _menuCharts[menuId].cat = new Chart(ctx2, {
        type: 'doughnut',
        data: {
          labels: sorted.map(([k]) => expCats[k]?.label ?? k),
          datasets: [{ data: sorted.map(([, v]) => v), backgroundColor: sorted.map(([k]) => _getCatColor(k)), borderWidth: 2, borderColor: '#1e293b' }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '60%',
          plugins: {
            legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 10 }, boxWidth: 10, padding: 8 } },
            tooltip: { callbacks: { label: c => ` ${_fmtCurr(c.raw, curr)}` } }
          },
          onClick: (evt, elements) => {
            if (!elements.length) return;
            const catKey = sorted[elements[0].index]?.[0];
            if (!catKey) return;
            const sel = document.getElementById(`cmf-c-${menuId}`);
            if (!sel) return;
            sel.value = sel.value === catKey ? '' : catKey;
            renderCustomMenu(menuId);
          },
          onHover: (evt) => { if (evt.native) evt.native.target.style.cursor = 'pointer'; }
        }
      });
    }
  }

  // ── Doughnut — top income cats (mes seleccionado) ─────
  if (sec.inc) {
    const incTotals = {};
    for (const t of monthTxs.filter(t => t.type === 'inc')) {
      incTotals[t.category] = (incTotals[t.category] ?? 0) + t.amount;
    }
    const sortedInc = Object.entries(incTotals).sort((a, b) => b[1] - a[1]).slice(0, sec.incLimit ?? 8);
    const ctx3      = document.getElementById(`cm-chart-inc-${menuId}`);
    if (ctx3 && sortedInc.length) {
      const incCats = cats.inc ?? {};
      _menuCharts[menuId].inc = new Chart(ctx3, {
        type: 'doughnut',
        data: {
          labels: sortedInc.map(([k]) => incCats[k]?.label ?? k),
          datasets: [{ data: sortedInc.map(([, v]) => v), backgroundColor: sortedInc.map(([k]) => _getCatColor(k)), borderWidth: 2, borderColor: '#1e293b' }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '60%',
          plugins: {
            legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 10 }, boxWidth: 10, padding: 8 } },
            tooltip: { callbacks: { label: c => ` ${_fmtCurr(c.raw, curr)}` } }
          },
          onClick: (evt, elements) => {
            if (!elements.length) return;
            const catKey = sortedInc[elements[0].index]?.[0];
            if (!catKey) return;
            const sel = document.getElementById(`cmf-c-${menuId}`);
            if (!sel) return;
            sel.value = sel.value === catKey ? '' : catKey;
            renderCustomMenu(menuId);
          },
          onHover: (evt) => { if (evt.native) evt.native.target.style.cursor = 'pointer'; }
        }
      });
    }
  }

  // ── Bar — weekly inc vs exp (current month only) ──────
  if (sec.week) {
    const weekInc = [0, 0, 0, 0];
    const weekExp = [0, 0, 0, 0];
    for (const t of monthTxs) {
      const w = _dayToWeek(t.date);
      if (t.type === 'inc') weekInc[w] += t.amount;
      else                  weekExp[w] += t.amount;
    }
    const ctx3 = document.getElementById(`cm-chart-week-${menuId}`);
    if (ctx3 && monthTxs.length) {
      _menuCharts[menuId].week = new Chart(ctx3, {
        type: 'bar',
        data: {
          labels: _WEEK_LABELS,
          datasets: [
            { label: 'Ingresos', data: weekInc, backgroundColor: '#22c55e99', borderRadius: 4 },
            { label: 'Gastos',   data: weekExp, backgroundColor: '#ef444499', borderRadius: 4 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 10, padding: 8 } },
            tooltip: { callbacks: { label: c => ` ${_fmtCurr(c.raw, curr)}` } }
          },
          scales: {
            x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { display: false } },
            y: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: '#1e293b' } }
          }
        }
      });
    }
  }
}

// ── Cat color modal ───────────────────────────────────────
function openMenuCatColors(menuId) {
  const allTxs = getMenuTxs(menuId);
  const cats   = loadData().globalCats;
  const totals = {};
  for (const t of allTxs.filter(t => t.type === 'exp')) {
    totals[t.category] = (totals[t.category] ?? 0) + t.amount;
  }
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, _getSections(menuId).catLimit ?? 8);
  const curr   = getCustomMenu(menuId)?.currency ?? '€';

  const rows = sorted.map(([key, amt]) => {
    const label = (cats.inc[key] ?? cats.exp[key])?.label ?? key;
    const color = _getCatColor(key);
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
      <input type="color" value="${color}" data-key="${key}"
             oninput="_setCatColorFromPicker('${key}',this.value)"
             style="width:36px;height:36px;border:none;background:none;cursor:pointer;border-radius:6px;padding:0">
      <span style="flex:1;font-size:.88rem">${esc(label)}</span>
      <span style="font-size:.75rem;color:var(--text2)">${_fmtCurr(amt, curr)}</span>
    </div>`;
  }).join('');

  const overlay = document.getElementById('catcolors-overlay');
  if (!overlay) {
    const div = document.createElement('div');
    div.id        = 'catcolors-overlay';
    div.className = 'modal-overlay';
    div.innerHTML = `<div class="modal" style="max-width:400px">
      <h3>🎨 Colores de categorías</h3>
      <div id="catcolors-body"></div>
      <div class="modal-actions" style="margin-top:12px">
        <button class="btn btn-primary" id="catcolors-done-btn">Listo</button>
      </div>
    </div>`;
    document.body.appendChild(div);
  }
  document.getElementById('catcolors-done-btn').onclick = () => {
    document.getElementById('catcolors-overlay').classList.remove('open');
    renderCustomMenu(menuId);
  };
  document.getElementById('catcolors-body').innerHTML = rows || '<p style="color:var(--text2);font-size:.82rem;padding:12px 0">Sin gastos registrados.</p>';
  document.getElementById('catcolors-overlay').classList.add('open');
}

function _setCatColorFromPicker(catKey, color) {
  const d    = loadData();
  const side = d.globalCats.inc[catKey] ? 'inc' : d.globalCats.exp[catKey] ? 'exp' : null;
  if (!side) return;
  d.globalCats[side][catKey].color = color;
  saveData();
}

function _fmtCurr(n, curr) {
  if (!curr || curr === '€') return fmtMoney(n);
  return `${(n ?? 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${curr}`;
}

// ── Month tabs ────────────────────────────────────────────
function _menuMonthTabs(menuId, ym) {
  const tz     = getTimezone();
  const now    = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return d.toLocaleDateString('en-CA', { timeZone: tz }).slice(0, 7);
  });
  return `<div class="month-tabs">
    ${months.map(m => `
      <button class="month-tab ${m === ym ? 'active' : ''}"
              onclick="selectMenuMonth(${menuId},'${m}')">
        ${_monthLabel(m)}
      </button>`).join('')}
  </div>`;
}

function selectMenuMonth(menuId, ym) {
  _menuMonth[menuId] = ym;
  renderCustomMenu(menuId);
}

// ── Transaction table ─────────────────────────────────────
function _menuTxTable(menu, txs, cats, curr, fSearch = '', fType = '', fCat = '', fFrom = '', fTo = '') {
  const menuId = menu.id;
  const cfg    = _getCols(menuId);

  let list = [...txs];
  if (fSearch) list = list.filter(t => t.description.toLowerCase().includes(fSearch.toLowerCase()) || (t.notes ?? '').toLowerCase().includes(fSearch.toLowerCase()));
  if (fType)   list = list.filter(t => t.type === fType);
  if (fCat)    list = list.filter(t => t.category === fCat);
  if (fFrom)   list = list.filter(t => t.date >= fFrom);
  if (fTo)     list = list.filter(t => t.date <= fTo);
  const sorted = list.sort((a, b) =>
    (b.date + _padTime(b.time)).localeCompare(a.date + _padTime(a.time)) || (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  const catsHtml = [
    ..._sortCatEntries(Object.entries(cats.inc ?? {})).map(([k, v]) => `<option value="${k}" ${fCat === k ? 'selected' : ''}>${esc(v.label)}</option>`),
    ..._sortCatEntries(Object.entries(cats.exp ?? {})).map(([k, v]) => `<option value="${k}" ${fCat === k ? 'selected' : ''}>${esc(v.label)}</option>`)
  ].join('');

  const emptyMsg = sorted.length === 0 ? `
    <div class="empty">
      ${fSearch || fType || fCat || fFrom || fTo ? 'Sin resultados con estos filtros.' : 'Sin movimientos este mes.'}
      ${!fSearch && !fType && !fCat && !fFrom && !fTo && _canWriteMenuTxs(menu) ? `<br>
        <button class="btn btn-primary btn-sm" style="margin-top:14px"
                onclick="openNewRecordModal()">+ Añadir primero</button>` : ''}
    </div>` : '';

  // Ordered visible columns for header
  const visibleCols = cfg.order.filter(k => cfg.visible.includes(k));
  const thHtml = visibleCols.map(k => {
    const def = _COL_DEFS.find(c => c.key === k);
    return `<th>${def?.label ?? k}</th>`;
  }).join('') + '<th></th>';

  return `
    <div class="tbl-wrap">
      <div class="filters">
        <input type="text" id="cmf-s-${menuId}" value="${esc(fSearch)}" placeholder="🔍 Buscar..."
               oninput="renderCustomMenu(${menuId})">
        <select id="cmf-t-${menuId}" onchange="renderCustomMenu(${menuId})">
          <option value="" ${!fType ? 'selected' : ''}>Todos</option>
          <option value="inc" ${fType === 'inc' ? 'selected' : ''}>💚 Ingresos</option>
          <option value="exp" ${fType === 'exp' ? 'selected' : ''}>🔴 Gastos</option>
        </select>
        <select id="cmf-c-${menuId}" onchange="renderCustomMenu(${menuId})">
          <option value="">Todas las categorías</option>
          ${catsHtml}
        </select>
        <input type="date" id="cmf-f-${menuId}"  value="${esc(fFrom)}" title="Desde"
               oninput="renderCustomMenu(${menuId})">
        <input type="date" id="cmf-to-${menuId}" value="${esc(fTo)}"   title="Hasta"
               oninput="renderCustomMenu(${menuId})">
      </div>
      <div class="tbl-header">
        <h3>Movimientos</h3>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:.78rem;color:var(--text2)">${sorted.length} registro(s)</span>
          <button class="btn btn-ghost btn-sm" onclick="openColsPanel(${menuId})">⚙ Columnas</button>
        </div>
      </div>
      ${emptyMsg}
      ${sorted.length ? `<div class="tbl-scroll">
        <table>
          <thead><tr>${thHtml}</tr></thead>
          <tbody>
            ${sorted.map(tx => _menuTxRow(menu, tx, cats, curr, visibleCols)).join('')}
          </tbody>
        </table>
      </div>` : ''}
    </div>`;
}

function _menuTxRow(menu, tx, cats, curr, visibleCols) {
  const menuId    = menu.id;
  const catMap    = cats[tx.type] ?? {};
  const cat       = catMap[tx.category] ?? { label: tx.category ?? '—', color: '#a78bfa' };
  const sign      = tx.type === 'inc' ? '+' : '-';
  const typeLabel = tx.type === 'inc' ? 'Ingreso' : 'Gasto';

  const cellFor = key => {
    switch (key) {
      case 'fecha': return `<td style="color:var(--text2);white-space:nowrap">${fmtDate(tx.date)}${tx.time ? `<br><span style="font-size:.68rem;opacity:.7">${fmtTime(tx.time)}</span>` : ''}</td>`;
      case 'monto': return `<td class="amount ${tx.type}" style="white-space:nowrap">${sign}${_fmtCurr(tx.amount, curr)}</td>`;
      case 'desc':  return `<td style="font-weight:500">${esc(tx.description)} ${attachBadge(tx.attachments)}${tx.recurring ? `<br>${_recBadge(tx)}` : ''}</td>`;
      case 'tipo':  return `<td><span class="badge ${tx.type}">${typeLabel}</span></td>`;
      case 'cat':   return `<td><span class="cat-dot" style="background:${cat.color}"></span><span class="home-cat-badge">${esc(cat.label)}</span></td>`;
      case 'notas': return `<td>${_renderNote(tx.notes)}</td>`;
      default:      return '<td></td>';
    }
  };

  return `<tr>
    ${visibleCols.map(cellFor).join('')}
    <td style="text-align:right;white-space:nowrap">
      ${_canWriteMenuTxs(menu) ? `
        <button class="btn-icon" onclick="openEditMenuTxModal(${menuId},${tx.id})">✏️</button>
        <button class="btn-icon" onclick="confirmDeleteMenuTx(${menuId},${tx.id})">🗑️</button>
      ` : ''}
    </td>
  </tr>`;
}

// ── Columns panel ─────────────────────────────────────────
function openColsPanel(menuId) {
  let overlay = document.getElementById('cols-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id        = 'cols-overlay';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal" style="max-width:380px">
      <h3>⚙ Columnas</h3>
      <div id="cols-body"></div>
      <div class="modal-actions" style="margin-top:14px">
        <button class="btn btn-ghost" onclick="document.getElementById('cols-overlay').classList.remove('open')">Cerrar</button>
        <button class="btn btn-ghost btn-sm" onclick="_colsReset(${menuId})">↺ Restablecer</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
  }
  // Update reset button with current menuId
  overlay.querySelector('[onclick*="_colsReset"]').setAttribute('onclick', `_colsReset(${menuId})`);
  _renderColsPanel(menuId);
  overlay.classList.add('open');
}

function _renderColsPanel(menuId) {
  const overlay = document.getElementById('cols-overlay');
  if (!overlay) return;
  const cfg = _getCols(menuId);
  overlay.querySelector('h3').textContent = '⚙ Columnas';

  document.getElementById('cols-body').innerHTML = cfg.order.map((key, i) => {
    const def     = _COL_DEFS.find(c => c.key === key);
    const visible = cfg.visible.includes(key);
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
      <input type="checkbox" ${visible ? 'checked' : ''}
             onchange="_colsToggle(${menuId},'${key}')"
             style="margin:0;width:16px;height:16px;cursor:pointer;accent-color:var(--acc)">
      <span style="flex:1;font-size:.88rem">${def?.label ?? key}</span>
      <button class="btn-icon" ${i === 0 ? 'disabled style="opacity:.3"' : ''} onclick="_colsMove(${menuId},'${key}',-1)" title="Subir">↑</button>
      <button class="btn-icon" ${i === cfg.order.length - 1 ? 'disabled style="opacity:.3"' : ''} onclick="_colsMove(${menuId},'${key}',1)" title="Bajar">↓</button>
    </div>`;
  }).join('');
}

function _colsReset(menuId) {
  _menuCols[menuId] = { visible: [..._COL_KEYS], order: [..._COL_KEYS] };
  _saveCols(menuId);
  _renderColsPanel(menuId);
  renderCustomMenu(menuId);
}

// ── Menu tx modal (edit) ──────────────────────────────────
function openEditMenuTxModal(menuId, txId) {
  const tx   = getMenuTxs(menuId).find(t => t.id === txId);
  if (!tx) return;
  const menu = getCustomMenu(menuId);
  _txContext  = { src: 'custom', menuId };
  document.getElementById('tx-modal-curr').textContent  = `(${menu?.currency ?? '€'})`;
  document.getElementById('tx-id').value                = txId;
  document.getElementById('tx-modal-title').textContent = 'Editar movimiento';
  document.getElementById('tx-date').value              = tx.date;
  document.getElementById('tx-time').value              = tx.time ?? '';
  document.getElementById('tx-amount').value            = tx.amount;
  document.getElementById('tx-desc').value              = tx.description;
  document.getElementById('tx-notes').value             = tx.notes ?? '';
  document.getElementById('tx-recurring').value         = tx.recurring || '';
  document.getElementById('tx-error').textContent       = '';
  document.getElementById('tx-type').value              = tx.type;
  _updateTxCatOptions();
  document.getElementById('tx-cat').value               = tx.category;
  _updateCatColorPicker();
  initAttachModal(tx.attachments ?? []);
  document.getElementById('tx-modal').classList.add('open');
}

function confirmDeleteMenuTx(menuId, txId) {
  const tx = getMenuTxs(menuId).find(t => t.id === txId);
  if (!tx) return;
  showConfirm(`¿Eliminar "${esc(tx.description)}"?`, () => {
    const menu = getCustomMenu(menuId);
    if (typeof _logHistory === 'function') _logHistory({ menuId, menuName: menu?.name ?? '', action: 'delete', desc: tx.description, amount: tx.amount, txType: tx.type });
    deleteMenuTx(menuId, txId);
    pushDeleteToGas(menuId, txId);
    renderCustomMenu(menuId);
    showToast('Movimiento eliminado', 'var(--red)');
  }, { icon: '🗑️', okLabel: 'Eliminar' });
}

// ── Emoji picker ──────────────────────────────────────────
const _EMOJI_LIST = [
  // Finanzas
  '💰','💵','💴','💶','💷','💸','💳','🏧','💹','📈','📉','📊','🏦','🪙','💎',
  // Transporte / combustible
  '⛽','🚗','🚕','🚙','🚌','🏎','🛻','✈','🚂','🛵','🚲','⛵','🚁','🛺',
  // Hogar
  '🏠','🏡','🏢','🛒','🧹','💡','🔧','🛁','🛏','🪴','🏗','🪟','🚪',
  // Comida
  '🍕','🍔','🌮','🍜','🍣','☕','🍺','🥗','🍰','🛒','🧃','🥤',
  // Salud
  '🏥','💊','🩺','🏋','🧘','🚑','🩹','🧬','🦷','👁','🧠',
  // Trabajo
  '💼','📁','📂','📋','📌','📎','🖊','📝','💻','🖥','📱','🖨','⌨',
  // Ocio / entretenimiento
  '🎮','🎬','🎵','🎨','📚','🎲','🏖','🏔','🗺','🎯','🎁','🏆','🥇','🎭',
  // Personas / familia
  '👨‍👩‍👧','👶','🧒','👦','👧','👨','👩','🧓','👴','👵',
  // Animales
  '🐶','🐱','🐦','🐠','🐾','🌿','🌱','🌳','🌻','🌊',
  // Misc
  '⭐','❤','🔥','✨','🎉','📣','🔑','🧧','📦','🗓','🕐','🌍','🏳','🚀',
];

function _initEmojiPicker() {
  const grid = document.getElementById('emoji-grid');
  if (!grid || grid.childElementCount) return;
  grid.innerHTML = _EMOJI_LIST.map(e =>
    `<button type="button" onclick="pickEmoji('${e}')"
      style="font-size:1.4rem;width:36px;height:36px;border:none;background:transparent;
             cursor:pointer;border-radius:6px;display:flex;align-items:center;justify-content:center"
      onmouseover="this.style.background='var(--bg3)'"
      onmouseout="this.style.background='transparent'">${e}</button>`
  ).join('');
}

function toggleEmojiPicker() {
  _initEmojiPicker();
  const picker = document.getElementById('emoji-picker');
  picker.style.display = picker.style.display === 'none' ? '' : 'none';
}

function pickEmoji(e) {
  document.getElementById('menu-icon').value = e;
  document.getElementById('emoji-picker').style.display = 'none';
}

// ── Menu create/edit modal ────────────────────────────────
function openNewMenuModal() {
  document.getElementById('menu-modal-id').value          = '';
  document.getElementById('menu-modal-title').textContent = 'Nuevo menú';
  document.getElementById('menu-name').value              = '';
  document.getElementById('menu-icon').value              = '📋';
  document.getElementById('menu-currency').value          = '€';
  document.getElementById('menu-type').value              = 'normal';
  document.getElementById('menu-error').textContent       = '';
  document.getElementById('menu-modal').classList.add('open');
}

function openEditMenuModal(menuId) {
  const m = getCustomMenu(menuId);
  if (!m) return;
  document.getElementById('menu-modal-id').value          = menuId;
  document.getElementById('menu-modal-title').textContent = 'Editar menú';
  document.getElementById('menu-name').value              = m.name;
  document.getElementById('menu-type').value              = m.menuType ?? 'normal';
  document.getElementById('menu-icon').value              = m.icon ?? '📋';
  document.getElementById('menu-currency').value          = m.currency ?? '€';
  document.getElementById('menu-error').textContent       = '';
  document.getElementById('menu-modal').classList.add('open');
}

function closeMenuModal() {
  document.getElementById('menu-modal').classList.remove('open');
  const p = document.getElementById('emoji-picker');
  if (p) p.style.display = 'none';
}

const _MENU_TYPE_ICONS = { normal: '📋', deudas: '💳', vehicle: '🚗', fuel: '🚗' };

function saveMenuModal() {
  const id       = document.getElementById('menu-modal-id').value;
  const name     = document.getElementById('menu-name').value.trim();
  const menuType = document.getElementById('menu-type').value || 'normal';
  const rawIcon  = document.getElementById('menu-icon').value.trim();
  const icon     = rawIcon || _MENU_TYPE_ICONS[menuType] || '📋';
  const curr     = document.getElementById('menu-currency').value.trim() || '€';
  const err      = document.getElementById('menu-error');
  err.textContent = '';

  if (!name) { err.textContent = 'Nombre obligatorio.'; return; }

  if (id) {
    const mid = parseInt(id, 10);
    updateCustomMenu(mid, { name, icon, currency: curr, menuType });
    closeMenuModal();
    buildNav();
    renderCustomMenu(mid);
    showToast('Menú actualizado');
  } else {
    const menu = addCustomMenu({ name, icon, currency: curr, menuType });
    closeMenuModal();
    buildNav();
    switchView('menu-' + menu.id);
    showToast('Menú creado');
  }
}

// ── Menu delete ───────────────────────────────────────────
function confirmDeleteMenu(menuId) {
  const m = getCustomMenu(menuId);
  if (!m) return;
  showConfirm(`¿Eliminar menú "${m.name}" y todos sus datos?`, () => {
    deleteCustomMenu(menuId);
    buildNav();
    switchView('inicio');
    showToast('Menú eliminado', 'var(--red)');
  }, { icon: '🗑️', okLabel: 'Eliminar' });
}

// ── Import from v1 JSON into this menu ───────────────────
function openMenuImportPicker(menuId) {
  const inp = document.getElementById('menu-import-file');
  inp.dataset.menuId = menuId;
  inp.value = '';
  inp.click();
}

function handleMenuImportFile(input) {
  const menuId = parseInt(input.dataset.menuId, 10);
  const file   = input.files?.[0];
  if (!file) return;
  input.value = '';

  const reader = new FileReader();
  reader.onload = e => {
    let raw;
    try { raw = JSON.parse(e.target.result); }
    catch { showToast('JSON inválido', 'var(--red)'); return; }

    const groups = [];
    const mainTxs = raw.transactions ?? raw.txs ?? raw.inicio ?? [];
    if (mainTxs.length) groups.push({ label: `${mainTxs.length} movimientos principales`, data: mainTxs });

    const homeTxs = raw.home ?? raw.homeTxs ?? [];
    if (homeTxs.length) groups.push({ label: `${homeTxs.length} movimientos de hogar`, data: homeTxs });

    const cms = raw.customMenus;
    if (cms && !Array.isArray(cms)) {
      for (const [name, data] of Object.entries(cms)) {
        if (Array.isArray(data) && data.length) groups.push({ label: `${data.length} registros de "${name}"`, data });
      }
    } else if (Array.isArray(cms)) {
      for (const cm of cms) {
        if (cm.data?.length) groups.push({ label: `${cm.data.length} registros de "${cm.name}"`, data: cm.data });
      }
    }

    if (!groups.length) { showToast('Sin movimientos que importar', 'var(--yellow)'); return; }

    const allTxs  = groups.flatMap(g => g.data);
    const menu    = getCustomMenu(menuId);
    const catCount = Object.keys(raw.globalCats?.inc ?? {}).length
                   + Object.keys(raw.globalCats?.exp ?? {}).length;
    const catNote  = catCount ? ` + ${catCount} categorías` : '';

    showConfirm(
      `¿Importar ${allTxs.length} movimientos${catNote} al menú "${menu?.name ?? ''}"?\n• ` + groups.map(g => g.label).join('\n• '),
      () => {
        mergeImportedCats(raw);
        const count = importMenuTxs(menuId, allTxs);
        renderCustomMenu(menuId);
        showToast(`Importados ${count} movimientos${catNote} ✓`);
      },
      { icon: '📥', okLabel: 'Importar' }
    );
  };
  reader.readAsText(file);
}

// ── Role helpers ──────────────────────────────────────────
function _canEditMenu(menu) {
  const role = currentUser?.role;
  return menu.shared ? menu.myRole === 'admin' : (role === 'admin' || role === 'editor');
}

function _canWriteMenuTxs(menu) {
  return menu.shared ? menu.myRole !== 'viewer' : currentUser?.role !== 'viewer';
}

// ── Share modal ───────────────────────────────────────────
function openShareModal(menuId) {
  const menu = getCustomMenu(menuId);
  if (!menu) return;
  document.getElementById('share-modal-menu-id').value      = menuId;
  document.getElementById('share-modal-title').textContent  =
    menu.shared ? 'Gestionar acceso compartido' : 'Compartir menú';
  document.getElementById('share-sheet-name').value         = menu.sheetName ?? '';
  document.getElementById('share-error').textContent        = '';
  document.getElementById('btn-unshare').style.display      = menu.shared ? '' : 'none';
  _renderShareUsers(menu);
  document.getElementById('share-modal').classList.add('open');
}

function closeShareModal() {
  document.getElementById('share-modal').classList.remove('open');
}

async function confirmUnshareMenu() {
  const menuId = parseInt(document.getElementById('share-modal-menu-id').value, 10);
  const menu   = getCustomMenu(menuId);
  if (!menu) return;
  if (!confirm(`¿Dejar de compartir "${menu.name}"? Los datos locales se conservan pero el menú dejará de sincronizarse.`)) return;
  unshareMenu(menuId);
  try {
    if (getGasUrl()) await pushSharedConfig();
  } catch { /* non-fatal */ }
  closeShareModal();
  buildNav();
  renderCustomMenu(menuId);
  showToast('Menú dejado de compartir');
}

function _renderShareUsers(menu) {
  const users = loadUsers().filter(u => u.id !== currentUser?.id);
  const el    = document.getElementById('share-users-list');
  if (!users.length) {
    el.innerHTML = '<div class="empty" style="font-size:.82rem;padding:12px 0">Sin otros usuarios registrados</div>';
    return;
  }
  el.innerHTML = users.map(u => {
    const sw      = menu.sharedWith?.find(s => s.name === u.name);
    const checked = sw ? 'checked' : '';
    const role    = sw?.role ?? 'viewer';
    return `<div class="cat-row" style="gap:8px;align-items:center">
      <input type="checkbox" id="share-chk-${u.id}" value="${u.id}" ${checked}
             onchange="document.getElementById('share-role-${u.id}').disabled=!this.checked"
             style="margin:0;width:16px;height:16px;cursor:pointer;accent-color:var(--acc)">
      <label for="share-chk-${u.id}" style="flex:1;cursor:pointer">${esc(u.name)}</label>
      <select id="share-role-${u.id}" ${checked ? '' : 'disabled'}
              style="width:auto;padding:4px 8px;font-size:.8rem">
        <option value="viewer" ${role === 'viewer' ? 'selected' : ''}>Visitante</option>
        <option value="editor" ${role === 'editor' ? 'selected' : ''}>Editor</option>
        <option value="admin"  ${role === 'admin'  ? 'selected' : ''}>Admin</option>
      </select>
    </div>`;
  }).join('');
}

async function saveShareModal() {
  const menuId    = parseInt(document.getElementById('share-modal-menu-id').value, 10);
  const sheetName = document.getElementById('share-sheet-name').value.trim();
  const errEl     = document.getElementById('share-error');
  errEl.textContent = '';

  if (!sheetName)    { errEl.textContent = 'Nombre de hoja obligatorio.'; return; }
  if (!getGasUrl())  { errEl.textContent = 'Configura la URL de GAS en el panel Admin.'; return; }

  const users      = loadUsers().filter(u => u.id !== currentUser?.id);
  const sharedWith = users
    .filter(u => document.getElementById(`share-chk-${u.id}`)?.checked)
    .map(u => ({ name: u.name, role: document.getElementById(`share-role-${u.id}`)?.value ?? 'viewer' }));

  shareMenu(menuId, sheetName, sharedWith);

  try {
    setSyncBadge('saving');
    await pushSharedConfig();
    await pushMenuToGas(menuId); // sube filas existentes al sheet por primera vez
    setSyncBadge('ok');
    closeShareModal();
    buildNav();
    renderCustomMenu(menuId);
    showToast('Menú compartido ✓');
  } catch (e) {
    setSyncBadge('error');
    errEl.textContent = 'Error al sincronizar: ' + e.message;
  }
}

// ── VEHICLE MENU ─────────────────────────────────────────────
const _FUEL_TYPE_EMOJI = {
  regular: '🟢', premium: '🔵', diesel: '🟡', glp: '🟠', electric: '⚡'
};
const _OIL_TYPE_LABEL = {
  sintetico: '🔵 Sintético', semis: '🟢 Semi-sint.', mineral: '🟡 Mineral'
};

// Alias para migración: menús viejos tipo 'fuel' usan la misma vista
function renderFuelMenu(menuId) { renderVehicleMenu(menuId); }

function renderVehicleMenu(menuId) {
  const menu = getCustomMenu(menuId);
  if (!menu) { switchView('inicio'); return; }

  if (!_menuMonth[menuId]) _menuMonth[menuId] = _nowYM();
  const ym   = _menuMonth[menuId];
  const curr = menu.currency || '$';

  for (const key of ['veh_price', 'veh_cons', 'veh_monthly']) {
    const k = `${menuId}_${key}`;
    if (_menuCharts[k]) { _menuCharts[k].destroy(); delete _menuCharts[k]; }
  }

  const allEntries = getMenuTxs(menuId).filter(e => !e._deleted);
  // legacy 'fuel' menus: entries without entryType treated as fuel
  const allFuel  = allEntries.filter(e => !e.entryType || e.entryType === 'fuel');
  const allOil   = allEntries.filter(e => e.entryType === 'oil');
  const allMaint = allEntries.filter(e => e.entryType === 'maintenance');
  const monthFuel  = allFuel.filter(e => e.date?.startsWith(ym));
  const monthOil   = allOil.filter(e => e.date?.startsWith(ym));
  const monthMaint = allMaint.filter(e => e.date?.startsWith(ym));

  const fuelCost    = monthFuel.reduce((s, e) => s + (e.totalCost || 0), 0);
  const oilCost     = monthOil.reduce((s, e)  => s + (e.totalCost || 0), 0);
  const maintCost   = monthMaint.reduce((s, e) => s + (e.cost || 0), 0);
  const totalCost   = fuelCost + oilCost + maintCost;
  const totalLiters = monthFuel.reduce((s, e) => s + (e.liters || 0), 0);
  const avgPrice    = totalLiters > 0 ? fuelCost / totalLiters : 0;

  // Consumption from consecutive odometer fuel entries
  const odomSorted = [...allFuel]
    .filter(e => e.odometerKm > 0 && e.liters > 0)
    .sort((a, b) => (a.date + _padTime(a.time)).localeCompare(b.date + _padTime(b.time)));
  const consMap = new Map();
  for (let i = 1; i < odomSorted.length; i++) {
    const km = odomSorted[i].odometerKm - odomSorted[i - 1].odometerKm;
    if (km > 0) consMap.set(odomSorted[i].id, km / odomSorted[i].liters);
  }
  const monthWithCons = monthFuel.filter(e => consMap.has(e.id));
  const avgCons   = monthWithCons.length
    ? monthWithCons.reduce((s, e) => s + consMap.get(e.id), 0) / monthWithCons.length : 0;
  const costPerKm = avgCons > 0 ? avgPrice / avgCons : 0;

  // Last known odometer
  const lastKm = odomSorted.length ? odomSorted[odomSorted.length - 1].odometerKm : 0;
  // Next oil change alert
  const lastOil     = [...allOil].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
  const nextOilKm   = lastOil?.nextChangeKm || 0;
  const oilAlert    = nextOilKm > 0 && lastKm > 0 && lastKm >= nextOilKm - 500;

  const el = document.getElementById('view-custom');
  el.innerHTML = `
    <div class="menu-header">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span style="font-size:1.6rem">${esc(menu.icon ?? '🚗')}</span>
        <h2 style="font-size:1.1rem;font-weight:700">${esc(menu.name)}</h2>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${_canEditMenu(menu) ? `
          <button class="btn btn-ghost btn-sm" onclick="openEditMenuModal(${menuId})">✏️ Editar</button>
          <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="confirmDeleteMenu(${menuId})">🗑️</button>
        ` : ''}
        <button class="btn btn-ghost btn-sm" onclick="generateMenuReport(${menuId})">📊 Reporte</button>
      </div>
    </div>

    ${_renderVehicleInfoCard(menu, curr, menuId)}
    ${oilAlert ? `<div style="background:#ff980022;border:1px solid #ff9800;border-radius:10px;padding:10px 14px;margin-bottom:12px;font-size:.85rem;color:#ff9800">
      ⚠️ Próximo cambio de aceite: ${nextOilKm.toLocaleString()} km — odómetro actual ${lastKm.toLocaleString()} km
    </div>` : ''}

    ${_menuMonthTabs(menuId, ym)}
    <div class="cards" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr))">
      <div class="card red">
        <div class="label">Total gastado</div>
        <div class="value">${_fmtCurr(totalCost, curr)}</div>
        <div style="font-size:.7rem;color:var(--text2);margin-top:2px">combustible + aceite + mantenimiento</div>
      </div>
      <div class="card red" style="--card-accent:#ef9a9a">
        <div class="label">Combustible</div>
        <div class="value" style="font-size:1.3rem">${_fmtCurr(fuelCost, curr)}</div>
        <div style="font-size:.7rem;color:var(--text2);margin-top:2px">${totalLiters > 0 ? totalLiters.toFixed(2) + ' L' : monthFuel.length + ' cargas'}</div>
      </div>
      <div class="card" style="border-color:#ff980044">
        <div class="label">Aceite</div>
        <div class="value" style="font-size:1.3rem">${_fmtCurr(oilCost, curr)}</div>
        <div style="font-size:.7rem;color:var(--text2);margin-top:2px">${monthOil.length} cambio(s)</div>
      </div>
      <div class="card">
        <div class="label">Precio prom/L</div>
        <div class="value" style="font-size:1.3rem">${avgPrice > 0 ? _fmtCurr(avgPrice, curr) : '—'}</div>
      </div>
      <div class="card green">
        <div class="label">Consumo</div>
        <div class="value" style="font-size:1.3rem">${avgCons > 0 ? avgCons.toFixed(2) + ' km/L' : '—'}</div>
      </div>
      <div class="card">
        <div class="label">Costo / km</div>
        <div class="value" style="font-size:1.3rem">${costPerKm > 0 ? _fmtCurr(costPerKm, curr) : '—'}</div>
      </div>
    </div>

    ${_canWriteMenuTxs(menu) ? `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0">
        <button class="btn btn-primary" onclick="openFuelEntryModal(${menuId})">⛽ Registrar carga</button>
        <button class="btn btn-ghost"   onclick="openOilModal(${menuId})">🛢️ Cambio de aceite</button>
        <button class="btn btn-ghost"   onclick="openMaintenanceModal(${menuId})">🔧 Mantenimiento</button>
      </div>
    ` : ''}

    <div style="margin-top:4px">
      <div class="section-title" style="margin-bottom:8px">⛽ Combustible</div>
      ${_renderFuelHistory(menuId, monthFuel, consMap, curr)}
    </div>

    <div style="margin-top:16px">
      <div class="section-title" style="margin-bottom:8px">🛢️ Cambios de aceite</div>
      ${_renderOilSection(menuId, monthOil, curr)}
    </div>

    <div style="margin-top:16px">
      <div class="section-title" style="margin-bottom:8px">🔧 Mantenimiento</div>
      ${_renderMaintenanceSection(menuId, monthMaint, curr)}
    </div>

    <div style="display:flex;flex-direction:column;gap:16px;margin-top:20px">
      <div class="chart-box" id="veh-price-box-${menuId}">
        <h3 style="margin:0 0 8px;font-size:.95rem">📈 Precio por litro</h3>
        <canvas id="veh-chart-price-${menuId}" height="200"></canvas>
      </div>
      <div class="chart-box" id="veh-cons-box-${menuId}">
        <h3 style="margin:0 0 8px;font-size:.95rem">🚗 Consumo (km/L)</h3>
        <canvas id="veh-chart-cons-${menuId}" height="200"></canvas>
      </div>
      <div class="chart-box" id="veh-monthly-box-${menuId}">
        <h3 style="margin:0 0 8px;font-size:.95rem">📊 Gasto mensual total</h3>
        <canvas id="veh-chart-monthly-${menuId}" height="200"></canvas>
      </div>
    </div>
  `;

  requestAnimationFrame(() => _renderVehicleCharts(menuId, allFuel, allOil, odomSorted, consMap));
}

function _renderVehicleInfoCard(menu, curr, menuId) {
  const v = menu.vehicleInfo;
  if (!v || !v.make) {
    return `<div style="background:var(--bg2);border:1px dashed var(--border);border-radius:10px;padding:12px 16px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:10px">
      <span style="font-size:.85rem;color:var(--text2)">Sin datos del vehículo</span>
      ${_canEditMenu(menu) ? `<button class="btn btn-ghost btn-sm" onclick="openVehicleInfoModal(${menuId})">+ Agregar</button>` : ''}
    </div>`;
  }
  const parts = [v.make, v.model, v.year].filter(Boolean).join(' ');
  const sub   = [v.color, v.plate].filter(Boolean).join(' · ');
  const buy   = v.purchaseDate ? `Comprado ${v.purchaseDate}${v.purchasePrice ? ' · ' + _fmtCurr(v.purchasePrice, curr) : ''}${v.purchaseKm ? ' · ' + v.purchaseKm.toLocaleString() + ' km' : ''}` : '';
  return `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:12px 16px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
    <div>
      <div style="font-weight:700;font-size:.95rem">${esc(parts)}</div>
      ${sub  ? `<div style="font-size:.78rem;color:var(--text2)">${esc(sub)}</div>` : ''}
      ${buy  ? `<div style="font-size:.75rem;color:var(--text2);margin-top:2px">${esc(buy)}</div>` : ''}
    </div>
    ${_canEditMenu(menu) ? `<button class="btn btn-ghost btn-sm" onclick="openVehicleInfoModal(${menuId})" style="flex-shrink:0">✏️</button>` : ''}
  </div>`;
}

function _renderFuelHistory(menuId, entries, consMap, curr) {
  if (!entries.length) {
    return `<div style="text-align:center;color:var(--text2);padding:20px 0;font-size:.85rem">Sin cargas este mes</div>`;
  }
  const sorted = [...entries].sort((a, b) =>
    (b.date + _padTime(b.time)).localeCompare(a.date + _padTime(a.time)) || (b.updatedAt || '').localeCompare(a.updatedAt || '')
  );
  return `<div style="display:flex;flex-direction:column;gap:8px">
    ${sorted.map(e => {
      const cons  = consMap.get(e.id);
      const emoji = _FUEL_TYPE_EMOJI[e.fuelType] ?? '⛽';
      return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg2);border-radius:10px;border:1px solid var(--border)">
        <div style="font-size:1.3rem;min-width:28px;text-align:center">${emoji}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:.88rem">${esc(e.station || 'Gasolinera')}</div>
          <div style="font-size:.75rem;color:var(--text2)">${e.date}${e.time ? ' ' + fmtTime(e.time) : ''}${e.odometerKm > 0 ? ' · ' + e.odometerKm.toLocaleString() + ' km' : ''}</div>
          ${cons ? `<div style="font-size:.72rem;color:var(--green);margin-top:2px">🚗 ${cons.toFixed(2)} km/L</div>` : ''}
          ${e.notes ? `<div style="font-size:.72rem;color:var(--text2);margin-top:2px">${esc(e.notes)}</div>` : ''}
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-weight:700;color:var(--red)">${_fmtCurr(e.totalCost || 0, curr)}</div>
          <div style="font-size:.75rem;color:var(--text2)">${(e.liters ?? 0).toFixed(2)} L · ${_fmtCurr(e.pricePerLiter || 0, curr)}/L</div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="openFuelEntryModal(${menuId},${e.id})"
                style="flex-shrink:0;padding:4px 8px">✏️</button>
      </div>`;
    }).join('')}
  </div>`;
}

function _renderOilSection(menuId, entries, curr) {
  if (!entries.length) {
    return `<div style="text-align:center;color:var(--text2);padding:20px 0;font-size:.85rem">Sin cambios de aceite este mes</div>`;
  }
  const sorted = [...entries].sort((a, b) => (b.date + _padTime(b.time)).localeCompare(a.date + _padTime(a.time)) || (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return `<div style="display:flex;flex-direction:column;gap:8px">
    ${sorted.map(e => `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg2);border-radius:10px;border:1px solid var(--border)">
      <div style="font-size:1.3rem;min-width:28px;text-align:center">🛢️</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:.88rem">${esc(e.oilBrand || 'Aceite')} · ${_OIL_TYPE_LABEL[e.oilType] ?? e.oilType ?? ''}</div>
        <div style="font-size:.75rem;color:var(--text2)">${e.date}${e.odometerKm > 0 ? ' · ' + e.odometerKm.toLocaleString() + ' km' : ''}${e.liters ? ' · ' + e.liters + ' L' : ''}${e.filterChanged ? ' · 🔩 Filtro' : ''}</div>
        ${e.nextChangeKm ? `<div style="font-size:.72rem;color:var(--accent);margin-top:2px">Próx. cambio: ${e.nextChangeKm.toLocaleString()} km</div>` : ''}
        ${e.notes ? `<div style="font-size:.72rem;color:var(--text2);margin-top:2px">${esc(e.notes)}</div>` : ''}
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-weight:700;color:var(--red)">${_fmtCurr(e.totalCost || 0, curr)}</div>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="openOilModal(${menuId},${e.id})"
              style="flex-shrink:0;padding:4px 8px">✏️</button>
    </div>`).join('')}
  </div>`;
}

const _MAINT_TYPE_ICON  = { reparacion: '🔧', repuesto: '⚙️' };
const _MAINT_TYPE_LABEL = { reparacion: 'Reparación', repuesto: 'Repuesto' };

function _renderMaintenanceSection(menuId, entries, curr) {
  if (!entries.length) {
    return `<div style="text-align:center;color:var(--text2);padding:20px 0;font-size:.85rem">Sin registros de mantenimiento este mes</div>`;
  }
  const sorted = [...entries].sort((a, b) =>
    (b.date + _padTime(b.time)).localeCompare(a.date + _padTime(a.time)) || (b.updatedAt || '').localeCompare(a.updatedAt || '')
  );
  return `<div style="display:flex;flex-direction:column;gap:8px">
    ${sorted.map(e => {
      const icon  = _MAINT_TYPE_ICON[e.maintType] ?? '🔧';
      const title = e.maintType === 'repuesto'
        ? [e.pieza, e.marca].filter(Boolean).join(' · ') || 'Repuesto'
        : [e.taller, e.description].filter(Boolean).join(' · ') || _MAINT_TYPE_LABEL[e.maintType] || 'Mantenimiento';
      return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg2);border-radius:10px;border:1px solid var(--border)">
        <div style="font-size:1.3rem;min-width:28px;text-align:center">${icon}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:.88rem">${esc(title)}</div>
          <div style="font-size:.75rem;color:var(--text2)">${e.date}${e.time ? ' ' + fmtTime(e.time) : ''}${e.odometerKm > 0 ? ' · ' + e.odometerKm.toLocaleString() + ' km' : ''}</div>
          ${e.notes ? `<div style="font-size:.72rem;color:var(--text2);margin-top:2px">${esc(e.notes)}</div>` : ''}
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-weight:700;color:var(--red)">${_fmtCurr(e.cost || 0, curr)}</div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="openMaintenanceModal(${menuId},${e.id})"
                style="flex-shrink:0;padding:4px 8px">✏️</button>
      </div>`;
    }).join('')}
  </div>`;
}

function _renderVehicleCharts(menuId, allFuel, allOil, odomSorted, consMap) {
  const ascFuel = [...allFuel].sort((a, b) =>
    (a.date + _padTime(a.time)).localeCompare(b.date + _padTime(b.time))
  );

  // Precio/L
  const priceEntries = ascFuel.filter(e => e.pricePerLiter > 0).slice(-20);
  const priceCanv = document.getElementById(`veh-chart-price-${menuId}`);
  if (priceCanv) {
    if (priceEntries.length > 1) {
      _menuCharts[`${menuId}_veh_price`] = new Chart(priceCanv, {
        type: 'line',
        data: {
          labels: priceEntries.map(e => e.date),
          datasets: [{ label: 'Precio/L', data: priceEntries.map(e => e.pricePerLiter),
            borderColor: 'var(--accent)', backgroundColor: 'transparent', tension: 0.3, pointRadius: 4 }]
        },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: false } } }
      });
    } else { document.getElementById(`veh-price-box-${menuId}`).style.display = 'none'; }
  }

  // Consumo km/L
  const consEntries = odomSorted.filter(e => consMap.has(e.id));
  const consCanv = document.getElementById(`veh-chart-cons-${menuId}`);
  if (consCanv) {
    if (consEntries.length > 1) {
      _menuCharts[`${menuId}_veh_cons`] = new Chart(consCanv, {
        type: 'line',
        data: {
          labels: consEntries.map(e => e.date),
          datasets: [{ label: 'km/L', data: consEntries.map(e => consMap.get(e.id)),
            borderColor: '#4caf50', backgroundColor: 'transparent', tension: 0.3, pointRadius: 4 }]
        },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: false } } }
      });
    } else { document.getElementById(`veh-cons-box-${menuId}`).style.display = 'none'; }
  }

  // Gasto mensual (combustible + aceite)
  const monthlyMap = {};
  for (const e of [...allFuel, ...allOil]) {
    const ym = e.date?.slice(0, 7);
    if (ym) monthlyMap[ym] = (monthlyMap[ym] || 0) + (e.totalCost || 0);
  }
  const monthKeys = Object.keys(monthlyMap).sort().slice(-6);
  const monthCanv = document.getElementById(`veh-chart-monthly-${menuId}`);
  if (monthCanv) {
    if (monthKeys.length > 0) {
      _menuCharts[`${menuId}_veh_monthly`] = new Chart(monthCanv, {
        type: 'bar',
        data: {
          labels: monthKeys,
          datasets: [{ label: 'Gasto', data: monthKeys.map(k => monthlyMap[k]),
            backgroundColor: '#ef535088', borderColor: '#ef5350', borderWidth: 1, borderRadius: 6 }]
        },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
      });
    } else { document.getElementById(`veh-monthly-box-${menuId}`).style.display = 'none'; }
  }
}

// ── Fuel entry modal ──────────────────────────────────────────
function openFuelEntryModal(menuId, entryId = null) {
  document.getElementById('fuel-menu-id').value           = menuId;
  document.getElementById('fuel-entry-id').value          = entryId ?? '';
  document.getElementById('fuel-del-btn').style.display   = entryId != null ? '' : 'none';
  document.getElementById('fuel-modal-title').textContent = entryId != null ? '⛽ Editar carga' : '⛽ Registrar carga';

  if (entryId != null) {
    const e = getMenuTxs(menuId).find(t => t.id === entryId);
    if (!e) return;
    document.getElementById('fuel-date').value             = e.date ?? '';
    document.getElementById('fuel-time').value             = e.time ?? '';
    document.getElementById('fuel-liters').value           = e.liters ?? '';
    document.getElementById('fuel-price-per-liter').value  = e.pricePerLiter ?? '';
    document.getElementById('fuel-total').value            = e.totalCost ? e.totalCost.toFixed(2) : '';
    document.getElementById('fuel-odometer').value         = e.odometerKm > 0 ? e.odometerKm : '';
    document.getElementById('fuel-type-sel').value         = e.fuelType ?? 'regular';
    document.getElementById('fuel-station').value          = e.station ?? '';
    document.getElementById('fuel-notes').value            = e.notes ?? '';
  } else {
    document.getElementById('fuel-date').value             = _nowDate();
    document.getElementById('fuel-time').value             = _nowTime();
    document.getElementById('fuel-liters').value           = '';
    document.getElementById('fuel-price-per-liter').value  = '';
    document.getElementById('fuel-total').value            = '';
    document.getElementById('fuel-odometer').value         = '';
    document.getElementById('fuel-type-sel').value         = 'regular';
    document.getElementById('fuel-station').value          = '';
    document.getElementById('fuel-notes').value            = '';
  }
  document.getElementById('fuel-modal').classList.add('open');
}

function closeFuelModal() {
  document.getElementById('fuel-modal').classList.remove('open');
}

function updateFuelTotal() {
  const liters = parseFloat(document.getElementById('fuel-liters').value) || 0;
  const price  = parseFloat(document.getElementById('fuel-price-per-liter').value) || 0;
  document.getElementById('fuel-total').value = liters > 0 && price > 0
    ? (liters * price).toFixed(2) : '';
}

function saveFuelEntry() {
  const menuId  = parseInt(document.getElementById('fuel-menu-id').value, 10);
  const entryId = document.getElementById('fuel-entry-id').value;
  const liters  = parseFloat(document.getElementById('fuel-liters').value);
  const ppl     = parseFloat(document.getElementById('fuel-price-per-liter').value);

  if (!liters || !ppl) { showToast('Ingresa litros y precio/litro', 'error'); return; }

  const fields = {
    entryType:     'fuel',
    date:          document.getElementById('fuel-date').value || _nowDate(),
    time:          document.getElementById('fuel-time').value || '',
    liters,
    pricePerLiter: ppl,
    totalCost:     parseFloat((liters * ppl).toFixed(4)),
    odometerKm:    parseInt(document.getElementById('fuel-odometer').value, 10) || 0,
    fuelType:      document.getElementById('fuel-type-sel').value || 'regular',
    station:       document.getElementById('fuel-station').value.trim(),
    notes:         document.getElementById('fuel-notes').value.trim(),
  };

  if (entryId) updateMenuTx(menuId, parseInt(entryId, 10), fields);
  else         addMenuTx(menuId, fields);

  closeFuelModal();
  renderVehicleMenu(menuId);
  onMenuSaved(menuId).catch(() => {});
  showToast('Carga guardada ✓');
}

function confirmDeleteFuelEntry() {
  const menuId  = parseInt(document.getElementById('fuel-menu-id').value, 10);
  const entryId = parseInt(document.getElementById('fuel-entry-id').value, 10);
  showConfirm('¿Eliminar este registro de carga?', () => {
    deleteMenuTx(menuId, entryId);
    pushDeleteToGas(menuId, entryId);
    closeFuelModal();
    renderVehicleMenu(menuId);
    showToast('Registro eliminado');
  }, { icon: '🗑️', okLabel: 'Eliminar' });
}

// ── Oil change modal ──────────────────────────────────────────
function openOilModal(menuId, entryId = null) {
  document.getElementById('oil-menu-id').value          = menuId;
  document.getElementById('oil-entry-id').value         = entryId ?? '';
  document.getElementById('oil-del-btn').style.display  = entryId != null ? '' : 'none';
  document.getElementById('oil-modal-title').textContent = entryId != null ? '🛢️ Editar cambio de aceite' : '🛢️ Registrar cambio de aceite';

  if (entryId != null) {
    const e = getMenuTxs(menuId).find(t => t.id === entryId);
    if (!e) return;
    document.getElementById('oil-date').value           = e.date ?? '';
    document.getElementById('oil-odometer').value       = e.odometerKm > 0 ? e.odometerKm : '';
    document.getElementById('oil-brand').value          = e.oilBrand ?? '';
    document.getElementById('oil-type-sel').value       = e.oilType ?? 'sintetico';
    document.getElementById('oil-liters').value         = e.liters ?? '';
    document.getElementById('oil-total-cost').value     = e.totalCost ?? '';
    document.getElementById('oil-filter-changed').checked = !!e.filterChanged;
    document.getElementById('oil-next-km').value        = e.nextChangeKm > 0 ? e.nextChangeKm : '';
    document.getElementById('oil-notes').value          = e.notes ?? '';
  } else {
    document.getElementById('oil-date').value           = _nowDate();
    document.getElementById('oil-odometer').value       = '';
    document.getElementById('oil-brand').value          = '';
    document.getElementById('oil-type-sel').value       = 'sintetico';
    document.getElementById('oil-liters').value         = '';
    document.getElementById('oil-total-cost').value     = '';
    document.getElementById('oil-filter-changed').checked = false;
    document.getElementById('oil-next-km').value        = '';
    document.getElementById('oil-notes').value          = '';
  }
  document.getElementById('oil-modal').classList.add('open');
}

function closeOilModal() {
  document.getElementById('oil-modal').classList.remove('open');
}

function saveOilEntry() {
  const menuId  = parseInt(document.getElementById('oil-menu-id').value, 10);
  const entryId = document.getElementById('oil-entry-id').value;
  const cost    = parseFloat(document.getElementById('oil-total-cost').value);

  if (!cost) { showToast('Ingresa el precio total', 'error'); return; }

  const fields = {
    entryType:     'oil',
    date:          document.getElementById('oil-date').value || _nowDate(),
    odometerKm:    parseInt(document.getElementById('oil-odometer').value, 10) || 0,
    oilBrand:      document.getElementById('oil-brand').value.trim(),
    oilType:       document.getElementById('oil-type-sel').value || 'sintetico',
    liters:        parseFloat(document.getElementById('oil-liters').value) || 0,
    totalCost:     cost,
    filterChanged: document.getElementById('oil-filter-changed').checked,
    nextChangeKm:  parseInt(document.getElementById('oil-next-km').value, 10) || 0,
    notes:         document.getElementById('oil-notes').value.trim(),
  };

  if (entryId) updateMenuTx(menuId, parseInt(entryId, 10), fields);
  else         addMenuTx(menuId, fields);

  closeOilModal();
  renderVehicleMenu(menuId);
  onMenuSaved(menuId).catch(() => {});
  showToast('Cambio de aceite guardado ✓');
}

function confirmDeleteOilEntry() {
  const menuId  = parseInt(document.getElementById('oil-menu-id').value, 10);
  const entryId = parseInt(document.getElementById('oil-entry-id').value, 10);
  showConfirm('¿Eliminar este cambio de aceite?', () => {
    deleteMenuTx(menuId, entryId);
    pushDeleteToGas(menuId, entryId);
    closeOilModal();
    renderVehicleMenu(menuId);
    showToast('Registro eliminado');
  }, { icon: '🗑️', okLabel: 'Eliminar' });
}

// ── Maintenance modal (Reparación/Taller + Repuestos/Piezas) ──
function _updateMaintTypeFields() {
  const type = document.getElementById('maint-type-sel').value;
  const isReparacion = type === 'reparacion';
  document.getElementById('maint-taller-row').style.display      = isReparacion ? '' : 'none';
  document.getElementById('maint-description-row').style.display = isReparacion ? '' : 'none';
  document.getElementById('maint-pieza-row').style.display        = isReparacion ? 'none' : '';
  document.getElementById('maint-marca-row').style.display        = isReparacion ? 'none' : '';
}

function openMaintenanceModal(menuId, entryId = null) {
  document.getElementById('maint-menu-id').value          = menuId;
  document.getElementById('maint-entry-id').value         = entryId ?? '';
  document.getElementById('maint-del-btn').style.display  = entryId != null ? '' : 'none';
  document.getElementById('maintenance-modal-title').textContent = entryId != null ? '🔧 Editar mantenimiento' : '🔧 Registrar mantenimiento';

  if (entryId != null) {
    const e = getMenuTxs(menuId).find(t => t.id === entryId);
    if (!e) return;
    document.getElementById('maint-type-sel').value    = e.maintType ?? 'reparacion';
    document.getElementById('maint-date').value        = e.date ?? '';
    document.getElementById('maint-time').value        = e.time ?? '';
    document.getElementById('maint-taller').value      = e.taller ?? '';
    document.getElementById('maint-description').value = e.description ?? '';
    document.getElementById('maint-pieza').value       = e.pieza ?? '';
    document.getElementById('maint-marca').value       = e.marca ?? '';
    document.getElementById('maint-cost').value        = e.cost ?? '';
    document.getElementById('maint-odometer').value    = e.odometerKm > 0 ? e.odometerKm : '';
    document.getElementById('maint-notes').value       = e.notes ?? '';
  } else {
    document.getElementById('maint-type-sel').value    = 'reparacion';
    document.getElementById('maint-date').value        = _nowDate();
    document.getElementById('maint-time').value        = _nowTime();
    document.getElementById('maint-taller').value      = '';
    document.getElementById('maint-description').value = '';
    document.getElementById('maint-pieza').value       = '';
    document.getElementById('maint-marca').value       = '';
    document.getElementById('maint-cost').value        = '';
    document.getElementById('maint-odometer').value    = '';
    document.getElementById('maint-notes').value       = '';
  }
  _updateMaintTypeFields();
  document.getElementById('maintenance-modal').classList.add('open');
}

function closeMaintenanceModal() {
  document.getElementById('maintenance-modal').classList.remove('open');
}

function saveMaintEntry() {
  const menuId  = parseInt(document.getElementById('maint-menu-id').value, 10);
  const entryId = document.getElementById('maint-entry-id').value;
  const cost    = parseFloat(document.getElementById('maint-cost').value);
  const maintType = document.getElementById('maint-type-sel').value;

  if (!cost) { showToast('Ingresa el costo', 'error'); return; }

  const fields = {
    entryType:   'maintenance',
    maintType,
    date:        document.getElementById('maint-date').value || _nowDate(),
    time:        document.getElementById('maint-time').value || '',
    cost,
    odometerKm:  parseInt(document.getElementById('maint-odometer').value, 10) || 0,
    notes:       document.getElementById('maint-notes').value.trim(),
    taller:      maintType === 'reparacion' ? document.getElementById('maint-taller').value.trim() : '',
    description: maintType === 'reparacion' ? document.getElementById('maint-description').value.trim() : '',
    pieza:       maintType === 'repuesto' ? document.getElementById('maint-pieza').value.trim() : '',
    marca:       maintType === 'repuesto' ? document.getElementById('maint-marca').value.trim() : '',
  };

  if (entryId) updateMenuTx(menuId, parseInt(entryId, 10), fields);
  else         addMenuTx(menuId, fields);

  closeMaintenanceModal();
  renderVehicleMenu(menuId);
  onMenuSaved(menuId).catch(() => {});
  showToast('Mantenimiento guardado ✓');
}

function confirmDeleteMaintEntry() {
  const menuId  = parseInt(document.getElementById('maint-menu-id').value, 10);
  const entryId = parseInt(document.getElementById('maint-entry-id').value, 10);
  showConfirm('¿Eliminar este registro de mantenimiento?', () => {
    deleteMenuTx(menuId, entryId);
    pushDeleteToGas(menuId, entryId);
    closeMaintenanceModal();
    renderVehicleMenu(menuId);
    showToast('Registro eliminado');
  }, { icon: '🗑️', okLabel: 'Eliminar' });
}

// ── Vehicle info modal ────────────────────────────────────────
function openVehicleInfoModal(menuId) {
  const menu = getCustomMenu(menuId);
  if (!menu) return;
  const v = menu.vehicleInfo ?? {};
  document.getElementById('vim-menu-id').value        = menuId;
  document.getElementById('vim-make').value           = v.make ?? '';
  document.getElementById('vim-model').value          = v.model ?? '';
  document.getElementById('vim-year').value           = v.year ?? '';
  document.getElementById('vim-color').value          = v.color ?? '';
  document.getElementById('vim-plate').value          = v.plate ?? '';
  document.getElementById('vim-purchase-date').value  = v.purchaseDate ?? '';
  document.getElementById('vim-purchase-price').value = v.purchasePrice ?? '';
  document.getElementById('vim-purchase-km').value    = v.purchaseKm ?? '';
  document.getElementById('vehicle-info-modal').classList.add('open');
}

function closeVehicleInfoModal() {
  document.getElementById('vehicle-info-modal').classList.remove('open');
}

function saveVehicleInfo() {
  const menuId = parseInt(document.getElementById('vim-menu-id').value, 10);
  const vehicleInfo = {
    make:          document.getElementById('vim-make').value.trim(),
    model:         document.getElementById('vim-model').value.trim(),
    year:          parseInt(document.getElementById('vim-year').value, 10) || null,
    color:         document.getElementById('vim-color').value.trim(),
    plate:         document.getElementById('vim-plate').value.trim(),
    purchaseDate:  document.getElementById('vim-purchase-date').value,
    purchasePrice: parseFloat(document.getElementById('vim-purchase-price').value) || 0,
    purchaseKm:    parseInt(document.getElementById('vim-purchase-km').value, 10) || 0,
  };
  updateCustomMenu(menuId, { vehicleInfo });
  onMenuSaved(menuId).catch(() => {});
  const updatedMenu = getCustomMenu(menuId);
  if (updatedMenu?.shared && typeof pushSharedConfig === 'function') pushSharedConfig().catch(() => {});
  closeVehicleInfoModal();
  renderVehicleMenu(menuId);
  showToast('Datos del vehículo guardados ✓');
}
