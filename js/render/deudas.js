'use strict';

// ── Fuente activa de deudas ───────────────────────────────
// 'local' = deudas personales | number = id de sharedDeudasMenu
let _deudaSource = 'local';

function _getDeudas() {
  if (_deudaSource === 'local') return loadData().deudas ?? [];
  return getSharedDeudasMenu(_deudaSource)?.data ?? [];
}

function _mutateDeudas(fn) {
  const d = loadData();
  if (_deudaSource === 'local') {
    if (!d.deudas) d.deudas = [];
    fn(d.deudas);
  } else {
    const m = (d.sharedDeudasMenus ?? []).find(m => m.id === _deudaSource);
    if (m) fn(m.data);
  }
  saveData();
}

function _afterDeudaMutation() {
  if (_deudaSource === 'local') {
    syncPrivateData().catch(() => {});
  } else {
    pushSharedDeudas(_deudaSource).catch(() => {});
  }
}

// ── Helpers ───────────────────────────────────────────────
function _fmtDeuda(n, curr) {
  const formatted = new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(Math.abs(n ?? 0));
  return `${curr ?? ''}${formatted}`;
}

function deudaRemaining(d) {
  return Math.max(0, Math.round(((d.amount ?? 0) - (d.paid ?? 0)) * 100) / 100);
}

function _statusBadge(status) {
  const map = {
    pendiente: { label: '⏳ Pendiente', color: 'var(--yellow)' },
    parcial:   { label: '🔶 Parcial',   color: '#f97316' },
    pagado:    { label: '✅ Pagado',    color: 'var(--green)' }
  };
  const s = map[status] ?? { label: status, color: 'var(--text2)' };
  return `<span style="font-size:.72rem;font-weight:700;color:${s.color}">${s.label}</span>`;
}

function _progressBlock(d) {
  if (!d.amount || d.status === 'pagado') return '';
  const pct       = Math.min(100, Math.round((d.paid ?? 0) / d.amount * 100));
  const remaining = deudaRemaining(d);
  const color     = d.type === 'por_cobrar' ? 'var(--green)' : 'var(--red)';
  return `
    <div style="height:3px;background:var(--bg3);border-radius:2px;margin-top:5px;overflow:hidden">
      <div style="height:100%;width:${pct}%;background:${color};border-radius:2px;transition:width .3s"></div>
    </div>
    <div style="font-size:.7rem;color:${color};font-weight:700;margin-top:3px">${pct}%</div>
    <div style="font-size:.7rem;color:var(--text2)">Restante: ${_fmtDeuda(remaining, d.currency ?? '$')}</div>`;
}

function _fmtDeudaDate(dateStr) {
  if (!dateStr) return '';
  const tIdx = dateStr.indexOf('T');
  if (tIdx >= 0) {
    const [y, m, d] = dateStr.slice(0, tIdx).split('-');
    const time = dateStr.slice(tIdx + 1, tIdx + 6);
    return `${d}/${m}/${y}<br><span style="font-size:.65rem;opacity:.7">${time}</span>`;
  }
  return fmtDate(dateStr);
}

// ── Main render ───────────────────────────────────────────
function renderDeudas(sourceId) {
  if (sourceId !== undefined) _deudaSource = sourceId;

  // Al abrir una vista compartida: pull inmediato del servidor
  if (sourceId !== undefined && sourceId !== 'local' && typeof syncSharedDeudas === 'function') {
    syncSharedDeudas(sourceId).catch(() => {});
  }

  let list = [..._getDeudas()];

  const s  = (document.getElementById('d-search')?.value ?? '').toLowerCase();
  const tp = document.getElementById('d-type')?.value ?? '';
  const st = document.getElementById('d-status')?.value ?? '';

  if (s)  list = list.filter(d => d.persona.toLowerCase().includes(s) || (d.description ?? '').toLowerCase().includes(s));
  if (tp) list = list.filter(d => d.type === tp);
  if (st) list = list.filter(d => d.status === st);

  list.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

  const active = list.filter(d => d.status !== 'pagado');
  const paid   = list.filter(d => d.status === 'pagado');

  const tbody  = document.getElementById('deudas-tbody');
  const psec   = document.getElementById('deudas-pagadas-section');
  if (!tbody) return;

  document.getElementById('deudas-count').textContent = active.length + ' registro(s)';

  const emptyMsg = _deudaSource !== 'local'
    ? `Sin deudas compartidas — este pool empieza vacío.<br><small style="color:var(--text2)">Las deudas que añadas aquí se sincronizan con el servidor.</small>`
    : 'Sin deudas activas';
  tbody.innerHTML = active.length
    ? active.map(_buildDeudaRow).join('')
    : `<tr><td colspan="7" class="empty" style="padding:20px">
         ${emptyMsg}
         <button class="btn btn-primary btn-sm" style="margin-left:10px" onclick="openDeudaModal()">+ Nueva deuda</button>
       </td></tr>`;

  if (paid.length) {
    psec.style.display = '';
    document.getElementById('deudas-pagadas-count').textContent = paid.length + ' registro(s)';
    document.getElementById('deudas-pagadas-tbody').innerHTML = paid.map(_buildDeudaRow).join('');
  } else {
    psec.style.display = 'none';
  }
}

function _buildDeudaRow(d) {
  if (window.innerWidth < 768) return _buildDeudaMobileCard(d);

  const curr      = d.currency ?? '$';
  const typeLabel = d.type === 'por_cobrar' ? '💚 Me deben' : '🔴 Yo debo';
  const typeColor = d.type === 'por_cobrar' ? 'var(--green)' : 'var(--red)';
  const hasPayments = (d.payments ?? []).length > 0;

  return `<tr onclick="_dRowTap(event,${d.id})" style="cursor:pointer">
    <td style="white-space:nowrap;color:var(--text2);font-size:.8rem">${_fmtDeudaDate(d.date)}</td>
    <td style="font-weight:600">${esc(d.persona)}</td>
    <td style="font-size:.78rem;color:var(--text2);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.description ?? '')}</td>
    <td><span style="font-size:.72rem;font-weight:700;color:${typeColor};white-space:nowrap">${typeLabel}</span></td>
    <td style="min-width:100px">
      <div style="font-weight:700">${_fmtDeuda(d.amount, curr)}</div>
      ${_progressBlock(d)}
    </td>
    <td>${_statusBadge(d.status)}</td>
    <td style="white-space:nowrap;text-align:right">
      ${hasPayments ? `<button class="btn-icon" onclick="event.stopPropagation();_toggleDeudaHist(${d.id},this)" title="Ver pagos">▶</button>` : ''}
      <button class="btn-icon" onclick="event.stopPropagation();openDeudaModal(${d.id})" title="Editar">✏️</button>
      ${d.status !== 'pagado' ? `<button class="btn-icon" onclick="event.stopPropagation();openPagoModal(${d.id})" title="Registrar pago" style="color:var(--green)">💸</button>` : ''}
      <button class="btn-icon" onclick="event.stopPropagation();toggleDeudaStatus(${d.id})" title="${d.status === 'pagado' ? 'Reabrir' : 'Marcar pagado'}">${d.status === 'pagado' ? '↩️' : '✅'}</button>
    </td>
  </tr>`;
}

function _buildDeudaMobileCard(d) {
  const curr      = d.currency ?? '$';
  const isCobrar  = d.type === 'por_cobrar';
  const typeLabel = isCobrar ? '💚 Me deben' : '🔴 Yo debo';
  const typeColor = isCobrar ? 'var(--green)' : 'var(--red)';
  const pct       = d.amount ? Math.min(100, Math.round((d.paid ?? 0) / d.amount * 100)) : 0;

  return `<tr onclick="_dRowTap(event,${d.id})" style="cursor:pointer">
    <td colspan="7">
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:12px 14px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:4px">
          <span style="font-weight:700;font-size:.92rem">${esc(d.persona)}</span>
          <span style="font-size:.7rem;font-weight:700;color:${typeColor};white-space:nowrap">${typeLabel}</span>
        </div>
        ${d.description ? `<div style="font-size:.78rem;color:var(--text2);margin-bottom:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.description)}</div>` : ''}
        <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:4px">
          <div style="font-size:.7rem;color:var(--text2)">${_fmtDeudaDate(d.date)}</div>
          <div style="text-align:right">
            <div style="font-weight:700;font-size:.95rem">${_fmtDeuda(d.amount, curr)}</div>
            ${_statusBadge(d.status)}
          </div>
        </div>
        ${d.amount && d.status !== 'pagado' ? `
        <div style="height:3px;background:var(--bg3);border-radius:2px;margin-top:8px">
          <div style="height:100%;width:${pct}%;background:${typeColor};border-radius:2px;transition:width .3s"></div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:3px">
          <div style="font-size:.7rem;color:${typeColor};font-weight:700">${pct}%</div>
          <div style="font-size:.7rem;color:var(--text2)">Restante: ${_fmtDeuda(deudaRemaining(d), d.currency ?? '$')}</div>
        </div>` : ''}
      </div>
    </td>
  </tr>`;
}

function _dRowTap(e, id) {
  if (e.target.closest('button')) return;
  if (window.innerWidth < 768) {
    _openDeudaActionSheet(id);
  } else {
    openDeudaModal(id);
  }
}

function _openDeudaActionSheet(id) {
  const d = _getDeudas().find(x => x.id === id);
  if (!d) return;

  document.getElementById('deuda-action-sheet')?.remove();

  const isPagado     = d.status === 'pagado';
  const hasPayments  = (d.payments ?? []).length > 0;
  const sheet = document.createElement('div');
  sheet.id    = 'deuda-action-sheet';
  sheet.style.cssText = `
    position:fixed;bottom:0;left:0;right:0;z-index:1100;
    background:var(--bg2);border-top:1px solid var(--border);
    border-radius:16px 16px 0 0;padding:16px;
    box-shadow:0 -4px 24px #0006;animation:slideUp .18s ease`;
  sheet.innerHTML = `
    <div style="width:36px;height:4px;background:var(--border);border-radius:2px;margin:0 auto 14px"></div>
    <div style="font-weight:700;margin-bottom:12px;font-size:.9rem">${esc(d.persona)}</div>
    <div style="display:flex;flex-direction:column;gap:8px">
      <button class="btn btn-ghost" style="justify-content:flex-start;gap:10px" onclick="document.getElementById('deuda-action-sheet').remove();openDeudaModal(${id})">✏️ Editar</button>
      ${!isPagado ? `<button class="btn btn-ghost" style="justify-content:flex-start;gap:10px;color:var(--green)" onclick="document.getElementById('deuda-action-sheet').remove();openPagoModal(${id})">💸 Registrar pago</button>` : ''}
      ${hasPayments ? `<button class="btn btn-ghost" style="justify-content:flex-start;gap:10px" onclick="document.getElementById('deuda-action-sheet').remove();_toggleDeudaHistSheet(${id})">▶ Ver pagos</button>` : ''}
      <button class="btn btn-ghost" style="justify-content:flex-start;gap:10px" onclick="document.getElementById('deuda-action-sheet').remove();toggleDeudaStatus(${id})">${isPagado ? '↩️ Reabrir' : '✅ Marcar pagado'}</button>
    </div>`;

  document.body.appendChild(sheet);

  const dismiss = (ev) => {
    if (!sheet.contains(ev.target)) { sheet.remove(); document.removeEventListener('pointerdown', dismiss); }
  };
  setTimeout(() => document.addEventListener('pointerdown', dismiss), 50);
}

function _toggleDeudaHistSheet(id) {
  openDeudaPagosModal(id);
}

function openDeudaPagosModal(deudaId) {
  const d = _getDeudas().find(x => x.id === deudaId);
  if (!d) return;

  document.getElementById('deuda-pagos-overlay')?.remove();

  const curr     = d.currency ?? '$';
  const sign     = d.type === 'por_cobrar' ? '+' : '-';
  const color    = d.type === 'por_cobrar' ? 'var(--green)' : 'var(--red)';
  const payments = (d.payments ?? []).slice().reverse();
  const isPagado = d.status === 'pagado';

  const rows = payments.length
    ? payments.map((p, i) => `
        <div style="display:flex;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);align-items:flex-start;font-size:.82rem">
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;color:${color}">${sign}${_fmtDeuda(p.amount, curr)}</div>
            <div style="color:var(--text2);font-size:.72rem">${(p.datetime ?? p.date ?? '').replace('T', ' ')}</div>
            ${p.notes ? `<div style="color:var(--text2);font-size:.72rem;margin-top:2px">${esc(p.notes)}</div>` : ''}
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button class="btn-icon" title="Editar" onclick="document.getElementById('deuda-pagos-overlay').remove();openPagoModal(${deudaId});editPagoItem(${deudaId},${payments.length - 1 - i})">✏️</button>
            <button class="btn-icon" title="Eliminar" style="color:var(--red)" onclick="document.getElementById('deuda-pagos-overlay').remove();deletePagoItem(${deudaId},${payments.length - 1 - i})">🗑</button>
          </div>
        </div>`).join('')
    : `<div style="color:var(--text2);font-size:.82rem;padding:16px 0;text-align:center">Sin pagos registrados</div>`;

  const overlay = document.createElement('div');
  overlay.id        = 'deuda-pagos-overlay';
  overlay.className = 'modal-overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:440px;width:95vw">
      <h3 style="margin-bottom:4px">💸 Pagos — ${esc(d.persona)}</h3>
      <div style="font-size:.75rem;color:var(--text2);margin-bottom:16px">${esc(d.description ?? '')} · ${_fmtDeuda(d.amount, curr)}</div>
      <div style="max-height:55vh;overflow-y:auto">${rows}</div>
      <div class="modal-actions" style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border)">
        ${!isPagado ? `<button class="btn btn-primary btn-sm" onclick="document.getElementById('deuda-pagos-overlay').remove();openPagoModal(${deudaId})">+ Registrar pago</button>` : ''}
        <button class="btn btn-ghost" onclick="document.getElementById('deuda-pagos-overlay').remove()">Cerrar</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

// ── Toggle historial inline ───────────────────────────────
function _toggleDeudaHist(deudaId, btn) {
  const existing = document.getElementById(`dhist-${deudaId}`);
  if (existing) { existing.remove(); btn.textContent = '▶'; return; }

  btn.textContent = '▼';
  const d        = _getDeudas().find(x => x.id === deudaId);
  if (!d) return;
  const curr     = d.currency ?? '$';
  const sign     = d.type === 'por_cobrar' ? '+' : '-';
  const color    = d.type === 'por_cobrar' ? 'var(--green)' : 'var(--red)';
  const payments = (d.payments ?? []).slice().reverse();

  btn.closest('tr').insertAdjacentHTML('afterend', `<tr id="dhist-${deudaId}" style="background:var(--bg3)">
    <td colspan="7" style="padding:10px 16px">
      <div style="font-size:.72rem;color:var(--text2);font-weight:700;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">Historial de pagos</div>
      ${payments.length
        ? payments.map(p => `
          <div style="display:flex;gap:12px;padding:4px 0;border-bottom:1px solid var(--border);font-size:.78rem;align-items:center">
            <span style="color:var(--text2);min-width:120px">${(p.datetime ?? p.date ?? '').replace('T', ' ')}</span>
            <span style="font-weight:700;color:${color}">${sign}${_fmtDeuda(p.amount, curr)}</span>
            <span style="color:var(--text2)">${esc(p.notes || '')}</span>
          </div>`).join('')
        : '<div style="font-size:.78rem;color:var(--text2)">Sin pagos registrados</div>'
      }
    </td>
  </tr>`);
}

// ── CRUD — Deuda modal ────────────────────────────────────
let _editingDeudaId = null;

function openDeudaModal(id) {
  _editingDeudaId = id ?? null;
  const delBtn    = document.getElementById('deuda-del-btn');

  if (id) {
    const d = _getDeudas().find(x => x.id === id);
    if (!d) return;
    document.getElementById('deuda-modal-title').textContent = 'Editar deuda';
    document.getElementById('deuda-id').value          = d.id;
    document.getElementById('deuda-date').value        = (d.date ?? '').slice(0, 16);
    document.getElementById('deuda-amount').value      = d.amount;
    document.getElementById('deuda-persona').value     = d.persona ?? '';
    document.getElementById('deuda-desc').value        = d.description ?? '';
    document.getElementById('deuda-type').value        = d.type ?? 'por_cobrar';
    document.getElementById('deuda-status').value      = d.status ?? 'pendiente';
    document.getElementById('deuda-notes').value       = d.notes ?? '';
    _setDeudaCurrSel(d.currency ?? '$');
    delBtn.style.display = 'inline-flex';
  } else {
    document.getElementById('deuda-modal-title').textContent = 'Nueva deuda';
    document.getElementById('deuda-id').value          = '';
    const _now = new Date(); document.getElementById('deuda-date').value = new Date(_now - _now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    document.getElementById('deuda-amount').value      = '';
    document.getElementById('deuda-persona').value     = '';
    document.getElementById('deuda-desc').value        = '';
    document.getElementById('deuda-type').value        = 'por_cobrar';
    document.getElementById('deuda-status').value      = 'pendiente';
    document.getElementById('deuda-notes').value       = '';
    _setDeudaCurrSel('$');
    delBtn.style.display = 'none';
  }
  document.getElementById('deuda-modal').classList.add('open');
}

function closeDeudaModal() {
  document.getElementById('deuda-modal').classList.remove('open');
  _editingDeudaId = null;
}

function _setDeudaCurrSel(curr) {
  const sel = document.getElementById('deuda-curr-sel');
  const inp = document.getElementById('deuda-curr-inp');
  if (['$', 'Zelle', 'CUP'].includes(curr)) {
    sel.value = curr;
    inp.style.display = 'none';
  } else {
    sel.value = 'custom';
    inp.value = curr;
    inp.style.display = '';
  }
}

function updateDeudaCurrField(val) {
  document.getElementById('deuda-curr-inp').style.display = val === 'custom' ? '' : 'none';
}

function saveDeuda() {
  const id       = document.getElementById('deuda-id').value;
  const date     = document.getElementById('deuda-date').value;
  const amount   = parseFloat(document.getElementById('deuda-amount').value);
  const persona  = document.getElementById('deuda-persona').value.trim();
  const desc     = document.getElementById('deuda-desc').value.trim();
  const type     = document.getElementById('deuda-type').value;
  const status   = document.getElementById('deuda-status').value;
  const notes    = document.getElementById('deuda-notes').value.trim();
  const currSel  = document.getElementById('deuda-curr-sel').value;
  const currency = currSel === 'custom'
    ? (document.getElementById('deuda-curr-inp').value.trim() || '$')
    : currSel;

  if (!date || isNaN(amount) || amount <= 0 || !persona) {
    showToast('Completa fecha, monto y persona', 'var(--red)'); return;
  }

  const now = new Date().toISOString();
  _mutateDeudas(arr => {
    if (id) {
      const idx = arr.findIndex(x => x.id === parseInt(id, 10));
      if (idx >= 0) arr[idx] = { ...arr[idx], date, amount, persona, description: desc, type, status, notes, currency, updatedAt: now };
    } else {
      const nextId = genId();
      arr.push({ id: nextId, date, amount, persona, description: desc, type, status, notes, currency, paid: 0, payments: [], updatedAt: now });
    }
  });

  closeDeudaModal();
  renderDeudas();
  _afterDeudaMutation();
  showToast(id ? 'Deuda actualizada' : 'Deuda creada');
}

function confirmDeleteDeuda() {
  if (!_editingDeudaId) return;
  const id = _editingDeudaId;
  showConfirm('¿Eliminar esta deuda y todos sus pagos?', async () => {
    if (_deudaSource === 'local') {
      markDeletedForSync('deudas', id);
    } else {
      // Marcar como deleted en servidor ANTES de borrar localmente
      const deuda = _getDeudas().find(x => x.id === id);
      if (deuda) await pushSharedDeudasDelete(_deudaSource, deuda).catch(() => {});
    }
    _mutateDeudas(arr => {
      const idx = arr.findIndex(x => x.id === id);
      if (idx >= 0) arr.splice(idx, 1);
    });
    closeDeudaModal();
    renderDeudas();
    _afterDeudaMutation();
    showToast('Deuda eliminada', 'var(--red)');
  }, { icon: '💳', okLabel: 'Eliminar' });
}

function toggleDeudaStatus(id) {
  _mutateDeudas(arr => {
    const deuda = arr.find(x => x.id === id);
    if (!deuda) return;
    deuda.status    = deuda.status === 'pagado' ? 'pendiente' : 'pagado';
    deuda.updatedAt = new Date().toISOString();
  });
  renderDeudas();
  _afterDeudaMutation();
}

// ── recalcDeudaPaid ───────────────────────────────────────
function _recalcDeudaPaid(d) {
  d.paid = Math.round((d.payments ?? []).reduce((s, p) => s + p.amount, 0) * 100) / 100;
  const total     = Math.round((d.amount ?? 0) * 100) / 100;
  const wasActive = d.status !== 'pagado';
  if (d.paid <= 0) {
    d.status = 'pendiente';
  } else if (d.paid >= total) {
    d.status = 'pagado';
    d.paid   = total;
    if (wasActive) setTimeout(() => showToast('✅ ¡Deuda con ' + d.persona + ' saldada!', 'var(--green)'), 200);
  } else {
    d.status = 'parcial';
  }
}

// ── PAGO MODAL ────────────────────────────────────────────
function openPagoModal(deudaId) {
  const d = _getDeudas().find(x => x.id === deudaId);
  if (!d) return;

  const curr      = d.currency ?? '$';
  const paid      = d.paid ?? 0;
  const remaining = deudaRemaining(d);
  const typeLabel = d.type === 'por_cobrar' ? 'Préstamo dado' : 'Préstamo recibido';
  const saldada   = remaining <= 0;

  document.getElementById('pago-modal-title').textContent = '💸 Deuda — ' + d.persona;
  document.getElementById('pago-deuda-id').value          = deudaId;

  document.getElementById('pago-ctx').innerHTML = `
    <div class="pago-ctx-item"><div class="lbl">Persona</div><div class="val">${esc(d.persona)}</div></div>
    <div class="pago-ctx-item"><div class="lbl">Tipo</div><div class="val">${typeLabel}</div></div>
    <div class="pago-ctx-item"><div class="lbl">Total deuda</div><div class="val">${_fmtDeuda(d.amount, curr)}</div></div>
    <div class="pago-ctx-item"><div class="lbl">Total abonado</div><div class="val" style="color:var(--green)">${_fmtDeuda(paid, curr)}</div></div>
    ${d.description ? `<div class="pago-ctx-item" style="grid-column:1/-1"><div class="lbl">Descripción</div><div class="val" style="font-size:.82rem">${esc(d.description)}</div></div>` : ''}
    <div class="pago-ctx-item" style="grid-column:1/-1">
      ${saldada
        ? `<div style="color:var(--green);font-weight:700;font-size:.88rem">✅ Deuda saldada completamente</div>`
        : `<div class="lbl">Restante</div><div class="val" style="color:var(--yellow);font-size:1.1rem">${_fmtDeuda(remaining, curr)}</div>`
      }
    </div>
  `;

  document.getElementById('pago-edit-idx').value = '-1';
  cancelEditPago(true);

  const payments = d.payments ?? [];
  const wrap     = document.getElementById('pago-history-wrap');
  if (payments.length) { wrap.style.display = ''; renderPagoHistory(deudaId); }
  else                 { wrap.style.display = 'none'; }

  const formEl  = document.getElementById('pago-form-section');
  const saveBtn = document.getElementById('pago-save-btn');
  if (formEl)  formEl.style.display  = saldada ? 'none' : '';
  if (saveBtn) saveBtn.style.display = saldada ? 'none' : '';

  if (!saldada) {
    const now     = new Date();
    const localDT = new Date(now - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    document.getElementById('pago-datetime').value = localDT;
    document.getElementById('pago-amount').value   = remaining.toFixed(2);
    document.getElementById('pago-notes').value    = '';
  }

  document.getElementById('pago-modal').classList.add('open');
}

function closePagoModal() {
  document.getElementById('pago-modal').classList.remove('open');
}

function savePago() {
  const deudaId = parseInt(document.getElementById('pago-deuda-id').value, 10);
  const editIdx = parseInt(document.getElementById('pago-edit-idx').value, 10);
  const datetime = document.getElementById('pago-datetime').value;
  const amount   = parseFloat(document.getElementById('pago-amount').value);
  const notes    = document.getElementById('pago-notes').value.trim();

  if (!datetime || isNaN(amount) || amount <= 0) {
    showToast('Completa fecha y monto', 'var(--red)'); return;
  }

  _mutateDeudas(arr => {
    const d = arr.find(x => x.id === deudaId);
    if (!d) return;
    if (!d.payments) d.payments = [];
    if (editIdx >= 0 && editIdx < d.payments.length) {
      d.payments[editIdx] = { datetime, amount, notes };
    } else {
      d.payments.push({ datetime, amount, notes });
    }
    _recalcDeudaPaid(d);
    d.updatedAt = new Date().toISOString();
  });

  closePagoModal();
  renderDeudas();
  _afterDeudaMutation();
  showToast(editIdx >= 0 ? 'Pago actualizado' : 'Pago registrado', 'var(--green)');
}

function renderPagoHistory(deudaId) {
  const d = _getDeudas().find(x => x.id === deudaId);
  if (!d) return;

  const curr    = d.currency ?? '$';
  const sign    = d.type === 'por_cobrar' ? '+' : '-';
  const color   = d.type === 'por_cobrar' ? 'var(--green)' : 'var(--red)';
  const indexed = (d.payments ?? []).map((p, i) => ({ ...p, _idx: i })).reverse();

  document.getElementById('pago-history-list').innerHTML = indexed.map(p => `
    <div class="ph-item" id="ph-item-${p._idx}">
      <div class="ph-left">
        <div class="ph-dt">${(p.datetime ?? p.date ?? '').replace('T', ' ')}</div>
        <div class="ph-note">${esc(p.notes || 'Sin nota')}</div>
      </div>
      <div class="ph-amount" style="font-weight:700;color:${color}">${sign}${_fmtDeuda(p.amount, curr)}</div>
      <div class="ph-actions">
        <button class="btn-icon" onclick="editPagoItem(${deudaId},${p._idx})" title="Editar" style="font-size:.85rem">✏️</button>
        <button class="btn-icon" onclick="deletePagoItem(${deudaId},${p._idx})" title="Eliminar" style="font-size:.85rem;color:var(--red)">🗑</button>
      </div>
    </div>
  `).join('');
}

function editPagoItem(deudaId, pIdx) {
  const d = _getDeudas().find(x => x.id === deudaId);
  if (!d || !d.payments[pIdx]) return;
  const p = d.payments[pIdx];

  document.querySelectorAll('.ph-item').forEach(el => el.classList.remove('editing-highlight'));
  document.getElementById('ph-item-' + pIdx)?.classList.add('editing-highlight');

  document.getElementById('pago-edit-idx').value         = pIdx;
  document.getElementById('pago-datetime').value         = p.datetime || '';
  document.getElementById('pago-amount').value           = p.amount;
  document.getElementById('pago-notes').value            = p.notes || '';
  document.getElementById('pago-form-title').textContent = '✏️ Editando pago';
  document.getElementById('pago-save-btn').textContent   = 'Actualizar pago';
  document.getElementById('pago-cancel-edit-btn').style.display = '';
  document.getElementById('pago-form-section').style.display    = '';
  document.getElementById('pago-save-btn').style.display        = '';
  document.getElementById('pago-form-section').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function cancelEditPago(silent) {
  document.getElementById('pago-edit-idx').value         = '-1';
  document.getElementById('pago-form-title').textContent = 'Nuevo pago';
  document.getElementById('pago-save-btn').textContent   = 'Registrar pago';
  document.getElementById('pago-cancel-edit-btn').style.display = 'none';
  document.querySelectorAll('.ph-item').forEach(el => el.classList.remove('editing-highlight'));

  if (!silent) {
    const deudaId = parseInt(document.getElementById('pago-deuda-id').value, 10);
    const d       = _getDeudas().find(x => x.id === deudaId);
    if (d) {
      const remaining = deudaRemaining(d);
      const now       = new Date();
      const localDT   = new Date(now - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      document.getElementById('pago-datetime').value = localDT;
      document.getElementById('pago-amount').value   = remaining > 0 ? remaining.toFixed(2) : '';
      document.getElementById('pago-notes').value    = '';
    }
  }
}

function deletePagoItem(deudaId, pIdx) {
  const d = _getDeudas().find(x => x.id === deudaId);
  if (!d || !d.payments[pIdx]) return;
  const p = d.payments[pIdx];
  showConfirm(`¿Eliminar pago de ${_fmtDeuda(p.amount, d.currency ?? '$')}?`, () => {
    _mutateDeudas(arr => {
      const deuda = arr.find(x => x.id === deudaId);
      if (!deuda) return;
      deuda.payments.splice(pIdx, 1);
      _recalcDeudaPaid(deuda);
      deuda.updatedAt = new Date().toISOString();
    });
    const editIdx = parseInt(document.getElementById('pago-edit-idx').value, 10);
    if (editIdx === pIdx) cancelEditPago(true);
    openPagoModal(deudaId);
    renderDeudas();
    _afterDeudaMutation();
    showToast('Pago eliminado', 'var(--red)');
  }, { icon: '💸', okLabel: 'Eliminar pago' });
}

// ── Import deudas desde JSON ──────────────────────────────
function openDeudasImportPicker() {
  const inp = document.getElementById('deudas-import-file');
  inp.value = '';
  inp.click();
}

function exportDeudasLocal() {
  const deudas = loadData().deudas ?? [];
  const json   = JSON.stringify({ deudas, exportedAt: new Date().toISOString() }, null, 2);
  const blob   = new Blob([json], { type: 'application/json' });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement('a');
  a.href       = url;
  a.download   = `deudas-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Deudas exportadas ✓');
}

function handleDeudasImportFile(input) {
  const file = input.files?.[0];
  if (!file) return;
  input.value = '';

  const reader = new FileReader();
  reader.onload = e => {
    let raw;
    try { raw = JSON.parse(e.target.result); }
    catch { showToast('JSON inválido', 'var(--red)'); return; }

    const src = raw.deudas ?? [];
    if (!src.length) { showToast('Sin deudas en el archivo', 'var(--yellow)'); return; }

    showConfirm(
      `¿Importar ${src.length} deuda(s) desde "${file.name}"?\nSe agregarán a las existentes sin eliminar nada.`,
      () => {
        _mutateDeudas(arr => {
          let nextId = arr.length ? Math.max(...arr.map(x => x.id)) + 1 : 1;
          for (const dv of src) {
            arr.push({
              id:          nextId++,
              date:        String(dv.date || '').slice(0, 10),
              amount:      Number(dv.amount) || 0,
              persona:     String(dv.persona || ''),
              description: String(dv.description || ''),
              type:        dv.type === 'por_pagar' ? 'por_pagar' : 'por_cobrar',
              status:      dv.status ?? 'pendiente',
              notes:       String(dv.notes || ''),
              currency:    String(dv.currency || '$'),
              paid:        Number(dv.paid) || 0,
              payments:    (dv.payments ?? []).map(p => ({
                datetime: p.datetime ?? p.date ?? '',
                amount:   Number(p.amount) || 0,
                notes:    String(p.notes || '')
              })),
              updatedAt: dv.updatedAt ?? new Date().toISOString()
            });
          }
        });
        renderDeudas();
        _afterDeudaMutation();
        showToast(`Importadas ${src.length} deuda(s) ✓`);
      },
      { icon: '📥', okLabel: 'Importar' }
    );
  };
  reader.readAsText(file);
}
