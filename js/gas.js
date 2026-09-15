'use strict';

// ── GAS URL ───────────────────────────────────────────────
function getGasUrl() {
  return localStorage.getItem(GAS_URL_KEY) ?? '';
}

function setGasUrl(url) {
  const trimmed = (url ?? '').trim();
  if (trimmed) localStorage.setItem(GAS_URL_KEY, trimmed);
  else         localStorage.removeItem(GAS_URL_KEY);
}

// ── HTTP client ───────────────────────────────────────────
// Content-Type: text/plain avoids CORS preflight — GAS doPost reads body as string.
async function callGas(action, payload = {}) {
  const url = getGasUrl();
  if (!url) throw new Error('URL de GAS no configurada');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000); // 20s timeout

  try {
    const resp = await fetch(url, {
      method:   'POST',
      redirect: 'follow',
      headers:  { 'Content-Type': 'text/plain;charset=utf-8' },
      body:     JSON.stringify({ action, payload }),
      signal:   controller.signal
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error ?? 'Error desconocido del servidor');
    return data;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Timeout: el servidor tardó demasiado');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ── Sync de usuarios via GAS ──────────────────────────────

// Sube el listado completo de usuarios (con pinHash) al servidor.
// Fire-and-forget: llamar desde saveUsers sin bloquear.
async function pushUsersToGas() {
  if (!getGasUrl()) return;
  const users = loadUsers();
  try { await callGas('setUsers', { users }); } catch { /* no-op — fallo silencioso */ }
}

// Descarga usuarios desde el servidor usando la URL dada.
// No modifica la URL almacenada; el caller decide si guardarla.
async function pullUsersFromGas(url) {
  if (!url) throw new Error('URL requerida');
  const resp = await fetch(url, {
    method:   'POST',
    redirect: 'follow',
    headers:  { 'Content-Type': 'text/plain;charset=utf-8' },
    body:     JSON.stringify({ action: 'getUsers', payload: {} })
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  if (!data.ok) throw new Error(data.error ?? 'Error del servidor');
  if (!data.users?.length) throw new Error('El servidor no tiene usuarios registrados');
  return data.users;
}

// ── Test connection (GET para evitar CORS redirect con POST) ─
async function testGasConnection() {
  const url = getGasUrl();
  if (!url) throw new Error('URL de GAS no configurada');
  const resp = await fetch(url + '?action=ping', { method: 'GET', redirect: 'follow' });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  if (!data.ok) throw new Error(data.error ?? 'Error desconocido');
  return data;
}
