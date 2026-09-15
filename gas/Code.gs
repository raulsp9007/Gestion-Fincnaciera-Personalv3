// ── CashMap v2 — Google Apps Script backend ───────────────
// INSTRUCCIONES DE DESPLIEGUE:
//
// OPCIÓN A (recomendada): desde el Google Sheet
//   1. Abre el Google Sheet → Extensiones → Apps Script
//   2. Pega este código en Code.gs → Guardar
//   3. Implementar → Nueva implementación → App web
//      Ejecutar como: Yo | Quién tiene acceso: Cualquier usuario
//   4. Autoriza los permisos cuando los pida
//   5. Copia la URL → CashMap Admin → URL del servidor
//
// OPCIÓN B: script independiente (script.google.com)
//   1. Pega el código
//   2. Ve a Configuración del proyecto → Propiedades del script
//   3. Agrega: SPREADSHEET_ID = <ID del Google Sheet>
//      (el ID está en la URL del Sheet: /d/ESTE_ID/edit)
//   4. Implementa igual que opción A

// ── Punto de entrada GET (ping / diagnóstico) ─────────────
const _CODE_VERSION = 'v2-68-normalizecell';

function doGet(e) {
  const action = (e?.parameter?.action ?? 'ping');
  if (action === 'ping') return _json({ ok: true, pong: true, method: 'GET', version: _CODE_VERSION });
  return _json({ ok: false, error: 'Solo ping está disponible por GET' });
}

// ── Punto de entrada POST ─────────────────────────────────
function doPost(e) {
  try {
    const body    = JSON.parse(e.postData.contents);
    const action  = body.action;
    const payload = body.payload ?? {};

    let result;
    switch (action) {
      case 'ping':      result = { ok: true, pong: true };    break;
      case 'getConfig': result = _getConfig(payload);          break;
      case 'setConfig': result = _setConfig(payload);          break;
      case 'getUsers':  result = _getUsers();                  break;
      case 'setUsers':  result = _setUsers(payload);           break;
      case 'pullRows':     result = _pullRows(payload);        break;
      case 'pushRows':     result = _pushRows(payload);        break;
      case 'deleteRow':    result = _deleteRow(payload);       break;
      case 'pullJsonRows': result = _pullJsonRows(payload);    break;
      case 'pushJsonRows': result = _pushJsonRows(payload);    break;
      case 'deleteJsonRow':result = _deleteJsonRow(payload);   break;
      default:          throw new Error('Acción desconocida: ' + action);
    }

    return _json(result);
  } catch (err) {
    return _json({ ok: false, error: err.message });
  }
}

// ── Spreadsheet helper ────────────────────────────────────
function _getSpreadsheet() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('Configura SPREADSHEET_ID en Propiedades del script o usa Extensiones → Apps Script desde el Sheet');
  return SpreadsheetApp.openById(id);
}

// ── Usuarios sincronizados ───────────────────────────────
// Se guardan como JSON en _config key "users".
// Contiene el array completo de usuarios (con pinHash, nunca el PIN en texto).
function _getUsers() {
  const cfg  = _getConfig();
  const raw  = cfg.config?.users;
  if (!raw) return { ok: true, users: [] };
  try { return { ok: true, users: JSON.parse(raw) }; }
  catch { return { ok: true, users: [] }; }
}

function _setUsers({ users }) {
  if (!Array.isArray(users)) throw new Error('users debe ser array');
  return _setConfig({ key: 'users', value: JSON.stringify(users) });
}

// ── Sheet _config (clave/valor global) ───────────────────
const CONFIG_SHEET = '_config';

function _getConfig() {
  const ss    = _getSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG_SHEET);
  if (!sheet) return { ok: true, config: {} };

  const data   = sheet.getDataRange().getValues();
  const config = {};
  for (const row of data) {
    const key = String(row[0] ?? '').trim();
    if (key && key !== 'key') config[key] = String(row[1] ?? '');
  }
  return { ok: true, config };
}

function _setConfig({ key, value }) {
  if (!key) throw new Error('key requerido');
  const ss  = _getSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG_SHEET);
    sheet.appendRow(['key', 'value']);
  }

  const data     = sheet.getDataRange().getValues();
  const matchRows = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === key) matchRows.push(i + 1); // 1-based
  }

  if (matchRows.length === 0) {
    sheet.appendRow([key, value]);
  } else {
    // Actualiza la primera coincidencia; elimina duplicados de abajo hacia arriba
    sheet.getRange(matchRows[0], 2).setValue(value);
    for (let i = matchRows.length - 1; i >= 1; i--) {
      sheet.deleteRow(matchRows[i]);
    }
  }
  return { ok: true };
}

// ── Sheets de datos de menú ───────────────────────────────
const DATA_HEADERS = [
  'id', 'date', 'time', 'amount', 'description',
  'type', 'category', 'notes',
  'recurring', 'recurringNext',
  'updatedAt', 'updatedBy', 'deleted'
];

// Columnas que deben forzarse a texto plano para que Sheets no las
// autoconvierta en objetos Date/hora (bug clásico al escribir "23:09" o fechas).
const _TEXT_COLUMNS = ['date', 'time', 'recurringNext'];

function _ensureSheet(ss, sheetName) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(DATA_HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, DATA_HEADERS.length)
         .setBackground('#1e293b')
         .setFontColor('#94a3b8')
         .setFontWeight('bold');
    _forceTextColumns(sheet, DATA_HEADERS);
  } else {
    // Migración: añadir columnas faltantes al final del sheet
    const lastCol  = sheet.getLastColumn();
    const existing = lastCol > 0
      ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String)
      : [];
    let col = existing.length + 1;
    for (const h of DATA_HEADERS) {
      if (!existing.includes(h)) {
        sheet.getRange(1, col).setValue(h);
        col++;
      }
    }
    const headersAfter = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
    _forceTextColumns(sheet, headersAfter);
  }
  return sheet;
}

function _forceTextColumns(sheet, headers) {
  const maxRows = Math.max(sheet.getMaxRows(), 1000);
  headers.forEach((h, idx) => {
    if (_TEXT_COLUMNS.includes(h)) {
      sheet.getRange(1, idx + 1, maxRows, 1).setNumberFormat('@');
    }
  });
}

// Devuelve filas modificadas después de `since` (ISO string).
// Sin `since` devuelve todas las filas no eliminadas.
function _pullRows({ sheetName, since }) {
  if (!sheetName) throw new Error('sheetName requerido');
  const ss    = _getSpreadsheet();
  let sheet   = ss.getSheetByName(sheetName);
  if (!sheet) return { ok: true, rows: [], pulledAt: new Date().toISOString() };
  sheet = _ensureSheet(ss, sheetName); // migra columnas faltantes si aplica

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return { ok: true, rows: [], pulledAt: new Date().toISOString() };

  const headers = data[0].map(String);
  const sinceTs = since ? new Date(since).getTime() : 0;
  const rows    = [];

  const tz = ss.getSpreadsheetTimeZone();
  for (let i = 1; i < data.length; i++) {
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = _normalizeCell(headers[j], data[i][j], tz);
    }
    const rowTs = row.updatedAt ? new Date(row.updatedAt).getTime() : 0;
    if (!since || rowTs > sinceTs) rows.push(row);
  }

  return { ok: true, rows, pulledAt: new Date().toISOString() };
}

// Sheets a veces autoconvierte celdas de texto tipo "23:09" o "2026-06-30"
// en objetos Date (bug de auto-formato). Normaliza de vuelta a string plano.
function _normalizeCell(header, value, tz) {
  if (!(value instanceof Date)) return value;
  if (header === 'time') return Utilities.formatDate(value, tz, 'HH:mm');
  if (header === 'date' || header === 'recurringNext') return Utilities.formatDate(value, tz, 'yyyy-MM-dd');
  return value.toISOString();
}

// Compara dos filas (arrays alineados a `headers`) ignorando la
// columna 'updatedAt'. Devuelve true si son identicas.
function _rowsEqualIgnoringUpdatedAt(headers, rowA, rowB, tz) {
  for (let i = 0; i < headers.length; i++) {
    if (headers[i] === 'updatedAt') continue;
    const a = _normalizeCell(headers[i], rowA[i], tz);
    const b = _normalizeCell(headers[i], rowB[i], tz);
    if (String(a ?? '') !== String(b ?? '')) return false;
  }
  return true;
}

// Upsert de filas por id. Solo estampa updatedAt del servidor cuando el
// contenido realmente cambio (o la fila es nueva) — evita que un push
// del array completo (patron actual del cliente: siempre manda todos los
// registros locales) pise el timestamp de filas sin cambios reales.
function _pushRows({ sheetName, rows }) {
  if (!sheetName)               throw new Error('sheetName requerido');
  if (!Array.isArray(rows))     throw new Error('rows debe ser array');
  if (!rows.length)             return { ok: true, upserted: 0 };

  const ss    = _getSpreadsheet();
  const sheet = _ensureSheet(ss, sheetName);

  const data    = sheet.getDataRange().getValues();
  const headers = data[0].map(String);
  const idCol   = headers.indexOf('id');
  const nowIso  = new Date().toISOString();
  const tz      = ss.getSpreadsheetTimeZone();

  // Construir mapa id → número de fila (1-based)
  const idMap = {};
  for (let i = 1; i < data.length; i++) {
    idMap[String(data[i][idCol])] = i + 1;
  }

  let upserted = 0;
  for (const row of rows) {
    const key = String(row.id);
    const existingRowNum = idMap[key];

    if (existingRowNum) {
      const existingArr = data[existingRowNum - 1];
      const incomingArr = headers.map(h => {
        const v = row[h];
        return (v === null || v === undefined) ? '' : v;
      });
      if (_rowsEqualIgnoringUpdatedAt(headers, existingArr, incomingArr, tz)) {
        continue; // contenido identico, no tocar nada
      }
      const rowArr = headers.map((h, i) => h === 'updatedAt' ? nowIso : incomingArr[i]);
      sheet.getRange(existingRowNum, 1, 1, headers.length).setValues([rowArr]);
    } else {
      const rowArr = headers.map(h => {
        if (h === 'updatedAt') return nowIso;
        const v = row[h];
        return (v === null || v === undefined) ? '' : v;
      });
      sheet.appendRow(rowArr);
      idMap[key] = sheet.getLastRow();
    }
    upserted++;
  }

  return { ok: true, upserted };
}

// Marca una fila como deleted:1 (tombstone — no borra la fila).
function _deleteRow({ sheetName, id, updatedBy }) {
  if (!sheetName) throw new Error('sheetName requerido');
  if (!id)        throw new Error('id requerido');

  const ss    = _getSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { ok: true }; // no-op si el sheet no existe

  const data    = sheet.getDataRange().getValues();
  const headers = data[0].map(String);
  const idCol   = headers.indexOf('id');
  const delCol  = headers.indexOf('deleted');
  const tsCol   = headers.indexOf('updatedAt');
  const byCol   = headers.indexOf('updatedBy');
  const now     = new Date().toISOString();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(id)) {
      if (delCol >= 0) sheet.getRange(i + 1, delCol + 1).setValue(1);
      if (tsCol  >= 0) sheet.getRange(i + 1, tsCol  + 1).setValue(now);
      if (byCol  >= 0) sheet.getRange(i + 1, byCol  + 1).setValue(updatedBy ?? '');
      return { ok: true };
    }
  }

  return { ok: true }; // fila no encontrada → no-op
}

// ── Sheets JSON privados (_inicio_User, _deudas_User) ────
// Estructura: id | json | updatedAt | deleted
const JSON_ROW_HEADERS = ['id', 'json', 'updatedAt', 'deleted'];

function _ensureJsonSheet(ss, sheetName) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(JSON_ROW_HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, JSON_ROW_HEADERS.length)
         .setBackground('#1e293b').setFontColor('#94a3b8').setFontWeight('bold');
  }
  return sheet;
}

function _pullJsonRows({ sheetName, since }) {
  if (!sheetName) throw new Error('sheetName requerido');
  const ss    = _getSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { ok: true, rows: [], pulledAt: new Date().toISOString() };

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return { ok: true, rows: [], pulledAt: new Date().toISOString() };

  const sinceTs = since ? new Date(since).getTime() : 0;
  const rows    = [];

  for (let i = 1; i < data.length; i++) {
    const [id, json, updatedAt, deleted] = data[i].map(v => String(v ?? ''));
    const rowTs = updatedAt ? new Date(updatedAt).getTime() : 0;
    if (since && rowTs <= sinceTs) continue;
    let parsed = null;
    try { parsed = JSON.parse(json); } catch {}
    rows.push({ id, parsed, updatedAt, deleted: deleted === '1' || deleted === 'true' });
  }

  return { ok: true, rows, pulledAt: new Date().toISOString() };
}

// Compara dos objetos ya parseados ignorando el campo 'updatedAt'.
function _jsonEqualIgnoringUpdatedAt(objA, objB) {
  const a = Object.assign({}, objA); delete a.updatedAt;
  const b = Object.assign({}, objB); delete b.updatedAt;
  return JSON.stringify(a) === JSON.stringify(b);
}

// Upsert de filas JSON por id. Solo estampa updatedAt del servidor cuando
// el contenido (dentro del blob json, sin contar el propio updatedAt)
// realmente cambio o la fila es nueva. El updatedAt se corrige tanto en
// la columna del sheet como DENTRO del blob json (ambos se usan para
// comparar en el merge del cliente — deben quedar sincronizados).
function _pushJsonRows({ sheetName, rows }) {
  if (!sheetName)           throw new Error('sheetName requerido');
  if (!Array.isArray(rows)) throw new Error('rows debe ser array');
  if (!rows.length)         return { ok: true, upserted: 0 };

  const ss    = _getSpreadsheet();
  const sheet = _ensureJsonSheet(ss, sheetName);
  const data  = sheet.getDataRange().getValues();
  const nowIso = new Date().toISOString();

  const idMap = {};
  for (let i = 1; i < data.length; i++) {
    idMap[String(data[i][0])] = i + 1;
  }

  let upserted = 0;
  for (const row of rows) {
    const key = String(row.id);
    const existingRowNum = idMap[key];
    let incomingParsed;
    try { incomingParsed = JSON.parse(row.json ?? '{}'); } catch (e) { incomingParsed = {}; }

    if (existingRowNum) {
      const existingJson = data[existingRowNum - 1][1];
      let existingParsed;
      try { existingParsed = JSON.parse(existingJson || '{}'); } catch (e) { existingParsed = {}; }

      const existingDeleted = String(data[existingRowNum - 1][3]) === '1' || String(data[existingRowNum - 1][3]) === 'true';
      const incomingDeleted = !!row.deleted;

      if (incomingDeleted === existingDeleted && _jsonEqualIgnoringUpdatedAt(existingParsed, incomingParsed)) {
        continue; // contenido identico y mismo estado deleted, no tocar nada
      }
      incomingParsed.updatedAt = nowIso;
      const rowArr = [key, JSON.stringify(incomingParsed), nowIso, row.deleted ? 1 : 0];
      sheet.getRange(existingRowNum, 1, 1, 4).setValues([rowArr]);
    } else {
      incomingParsed.updatedAt = nowIso;
      const rowArr = [key, JSON.stringify(incomingParsed), nowIso, row.deleted ? 1 : 0];
      sheet.appendRow(rowArr);
      idMap[key] = sheet.getLastRow();
    }
    upserted++;
  }
  return { ok: true, upserted };
}

function _deleteJsonRow({ sheetName, id }) {
  if (!sheetName || !id) throw new Error('sheetName e id requeridos');
  const ss    = _getSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  const now   = new Date().toISOString();

  if (sheet) {
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) {
        sheet.getRange(i + 1, 3).setValue(now);
        sheet.getRange(i + 1, 4).setValue(1);
        return { ok: true };
      }
    }
  }
  // Si no existe la fila, insertar tombstone para propagar la eliminación
  const s = sheet ?? _ensureJsonSheet(_getSpreadsheet(), sheetName);
  s.appendRow([String(id), '', now, 1]);
  return { ok: true };
}

// ── Respuesta JSON ────────────────────────────────────────
function _json(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
