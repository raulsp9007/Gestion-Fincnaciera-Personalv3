'use strict';

// ── PIN hashing (Web Crypto — nunca viaja en texto plano) ─
async function hashPin(pin) {
  const data = new TextEncoder().encode(pin);
  const buf  = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

// ── Users ─────────────────────────────────────────────────
function loadUsers() {
  try { return JSON.parse(localStorage.getItem(USERS_KEY) || '[]'); } catch { return []; }
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  // Sincronizar al servidor si hay URL configurada (gas.js cargado después)
  if (typeof pushUsersToGas === 'function' && typeof getGasUrl === 'function' && getGasUrl()) {
    pushUsersToGas();
  }
}

function _nextUserId() {
  const users = loadUsers();
  return users.length ? Math.max(...users.map(u => u.id)) + 1 : 1;
}

async function createUser(name, pin, role) {
  const users   = loadUsers();
  const pinHash = await hashPin(pin);
  const user    = { id: _nextUserId(), name: name.trim(), pinHash, role };
  users.push(user);
  saveUsers(users);
  return user;
}

function updateUserName(userId, name) {
  const users = loadUsers();
  const u = users.find(u => u.id === userId);
  if (!u) return;
  u.name = name.trim();
  saveUsers(users);
}

function updateUserRole(userId, role) {
  const users = loadUsers();
  const u = users.find(u => u.id === userId);
  if (!u) return;
  u.role = role;
  saveUsers(users);
  // Actualizar currentUser si es el mismo
  if (currentUser && currentUser.id === userId) {
    currentUser.role = role;
    saveSession(currentUser);
  }
}

async function updateUserPin(userId, newPin) {
  const users = loadUsers();
  const u = users.find(u => u.id === userId);
  if (!u) return;
  u.pinHash = await hashPin(newPin);
  saveUsers(users);
}

function deleteUser(userId) {
  saveUsers(loadUsers().filter(u => u.id !== userId));
}

async function validateLogin(userId, pin) {
  const users = loadUsers();
  const u = users.find(u => u.id === userId);
  if (!u) return null;
  const pinHash = await hashPin(pin);
  return pinHash === u.pinHash ? u : null;
}

// ── Session ───────────────────────────────────────────────
function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}

function saveSession(user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    id: user.id, name: user.name, role: user.role,
    loginAt: new Date().toISOString()
  }));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}
