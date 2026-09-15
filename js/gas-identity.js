'use strict';

const GAS_ID_KEY = 'cashmap_v2_gas_identity';

// ── Identidad del servidor (independiente de la cuenta local) ─
function getGasIdentity() {
  try { return JSON.parse(localStorage.getItem(GAS_ID_KEY) || 'null'); }
  catch { return null; }
}

function _saveGasIdentity(id) {
  localStorage.setItem(GAS_ID_KEY, JSON.stringify(id));
}

// Configura la URL del GAS desde la identidad guardada.
// Llamar antes de startSync() en startApp para que el poll arranque con URL.
function applyGasIdentity() {
  const id = getGasIdentity();
  if (id?.url) setGasUrl(id.url);
}

// ── Conectar con credenciales del servidor ────────────────────
async function connectWithGasIdentity(url, username, pin) {
  // 1. Descargar lista de usuarios del servidor
  const users = await pullUsersFromGas(url);

  // 2. Buscar usuario por nombre (case-insensitive)
  const usernameLower = username.toLowerCase();
  const serverUser = users.find(u => u.name.toLowerCase() === usernameLower);
  if (!serverUser) throw new Error(`Usuario "${username}" no existe en el servidor`);

  // 3. Validar PIN
  const pinHash = await hashPin(pin);
  if (pinHash !== serverUser.pinHash) throw new Error('PIN incorrecto');

  // 4. Guardar identidad + URL del GAS
  setGasUrl(url);
  _saveGasIdentity({ url, username, pinHash });

  // 5. Sincronizar menús compartidos
  await connectAndSync();
  startSync(); // arranca polling si no estaba activo
}

// ── Desconectar del servidor ──────────────────────────────────
async function disconnectGasIdentity() {
  if (!confirm('¿Desconectarte del servidor? Los menús compartidos desaparecerán de tu sesión local. Tus datos locales no se borran.')) return;

  localStorage.removeItem(GAS_ID_KEY);
  setGasUrl('');

  // Eliminar menús compartidos del local (vinieron del servidor)
  const d = loadData();
  const sharedIds = new Set((d.customMenus ?? []).filter(m => m.shared).map(m => m.id));
  d.customMenus = (d.customMenus ?? []).filter(m => !m.shared);
  d.navOrder    = (d.navOrder ?? []).filter(k => {
    const num = parseInt(k.replace('menu-', ''), 10);
    return isNaN(num) || !sharedIds.has(num);
  });
  saveData();

  stopAutosave();
  buildNav();
  if (typeof _currentView !== 'undefined' && _currentView.startsWith('menu-')) {
    switchView('inicio');
  }
  showToast('Desconectado del servidor');
}

// ── Modal UI ──────────────────────────────────────────────────
function openGasConnectModal() {
  const id = getGasIdentity();
  document.getElementById('gc-url').value       = id?.url      ?? '';
  document.getElementById('gc-username').value  = id?.username ?? '';
  document.getElementById('gc-pin').value       = '';
  document.getElementById('gc-error').textContent = '';
  document.getElementById('gc-error').style.color = 'var(--red)';
  document.getElementById('gas-connect-modal').classList.add('open');
}

function closeGasConnectModal() {
  document.getElementById('gas-connect-modal').classList.remove('open');
}

async function submitGasConnect() {
  const url      = document.getElementById('gc-url').value.trim();
  const username = document.getElementById('gc-username').value.trim();
  const pin      = document.getElementById('gc-pin').value;
  const errEl    = document.getElementById('gc-error');
  errEl.textContent = '';

  if (!url)      { errEl.textContent = 'URL obligatoria.'; return; }
  if (!username) { errEl.textContent = 'Nombre de usuario obligatorio.'; return; }
  if (!pin)      { errEl.textContent = 'PIN obligatorio.'; return; }

  errEl.style.color = 'var(--text2)';
  errEl.textContent = 'Conectando…';

  try {
    await connectWithGasIdentity(url, username, pin);
    closeGasConnectModal();
    buildNav();
    showToast(`Conectado al servidor como ${esc(username)} ✓`);
  } catch (e) {
    errEl.style.color = 'var(--red)';
    errEl.textContent = 'Error: ' + e.message;
  }
}
