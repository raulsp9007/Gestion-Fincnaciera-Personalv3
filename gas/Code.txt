/**
 * CashMap v2 — Google Apps Script backend
 *
 * INSTRUCCIONES DE DESPLIEGUE:
 * 1. Abre script.google.com y crea un nuevo proyecto
 * 2. Copia este código en Code.gs
 * 3. Extensiones → Apps Script → Implementar → Nueva implementación
 *    - Tipo: Aplicación web
 *    - Ejecutar como: Yo (tu cuenta)
 *    - Quién tiene acceso: Cualquier usuario
 * 4. Copia la URL /exec y pégala en CashMap v2 → Admin → Conexión GAS
 *
 * Cada menu compartido ocupa una hoja (tab) dentro de este spreadsheet.
 * La hoja _config almacena la configuración de acceso.
 *
 * Columnas de datos: id | date | amount | description | type | category | notes | deleted | updatedAt | updatedBy
 */

const GAS_VERSION = '2.0';

// ── Entry points ──────────────────────────────────────────

function doPost(e) {
  try {
    const { action, payload } = JSON.parse(e.postData.contents);
    const result = _dispatch(action, payload || {});
    return _respond({ ok: true, ...result });
  } catch (err) {
    return _respond({ ok: false, error: err.message });
  }
}

// Permite verificar que la URL es correcta desde el navegador
function doGet() {
  return _respond({ ok: true, message: 'CashMap v2 GAS backend — usa POST', version: GAS_VERSION });
}

// ── Router ────────────────────────────────────────────────

function _dispatch(action, payload) {
  switch (action) {
    case 'ping':      return _ping();
    case 'getConfig': return _getConfig();
    case 'setConfig': return _setConfig(payload);
    case 'pushRows':  return _pushRows(payload);
    case 'pullRows':  return _pullRows(payload);
    case 'deleteRow': return _deleteRow(payload);
    default: throw new Error('Acción desconocida: ' + action);
  }
}

// ── Actions ───────────────────────────────────────────────

function _ping() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return {
    version:       GAS_VERSION,
    spreadsheetId: ss.getId(),
    time:          new Date().toISOString()
  };
}

function _getConfig() {
  const sheet = _getOrCreateSheet('_config', ['key', 'value', 'updatedAt']);
  const rows  = _sheetToObjects(sheet);
  const config = {};
  rows.forEach(r => { config[r.key] = r.value; });
  return { config };
}

function _setConfig(payload) {
  const { key, value } = payload;
  if (!key) throw new Error('key requerido');
  const sheet   = _getOrCreateSheet('_config', ['key', 'value', 'updatedAt']);
  const data    = sheet.getDataRange().getValues();
  const rowIdx  = data.findIndex((r, i) => i > 0 && r[0] === key);
  const now     = new Date().toISOString();
  if (rowIdx > 0) {
    sheet.getRange(rowIdx + 1, 2, 1, 2).setValues([[value, now]]);
  } else {
    sheet.appendRow([key, value, now]);
  }
  return { saved: true };
}

function _pushRows(payload) {
  const { sheetName, rows } = payload;
  if (!sheetName) throw new Error('sheetName requerido');
  if (!Array.isArray(rows) || !rows.length) return { pushed: 0 };

  const HEADERS = ['id', 'date', 'amount', 'description', 'type', 'category', 'notes', 'deleted', 'updatedAt', 'updatedBy'];
  const sheet   = _getOrCreateSheet(sheetName, HEADERS);
  const data    = sheet.getDataRange().getValues();
  const now     = new Date().toISOString();

  for (const row of rows) {
    const rowValues = [
      row.id, row.date, row.amount, row.description,
      row.type, row.category, row.notes ?? '',
      row.deleted ?? 0, now, row.updatedBy ?? ''
    ];
    // Find existing row by id (column 1 = index 0)
    const existIdx = data.findIndex((r, i) => i > 0 && String(r[0]) === String(row.id));
    if (existIdx > 0) {
      sheet.getRange(existIdx + 1, 1, 1, rowValues.length).setValues([rowValues]);
      data[existIdx] = rowValues; // keep local index up to date
    } else {
      sheet.appendRow(rowValues);
      data.push(rowValues);
    }
  }
  return { pushed: rows.length };
}

function _pullRows(payload) {
  const { sheetName, since } = payload;
  if (!sheetName) throw new Error('sheetName requerido');

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return { rows: [], pulledAt: new Date().toISOString() };

  const sinceMs = since ? new Date(since).getTime() : 0;
  const objects = _sheetToObjects(sheet);
  const rows    = objects.filter(r => {
    const t = r.updatedAt ? new Date(r.updatedAt).getTime() : 0;
    return t >= sinceMs;
  });

  return { rows, pulledAt: new Date().toISOString() };
}

function _deleteRow(payload) {
  const { sheetName, id, updatedBy } = payload;
  if (!sheetName || id == null) throw new Error('sheetName e id requeridos');

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return { deleted: false };

  const data    = sheet.getDataRange().getValues();
  const rowIdx  = data.findIndex((r, i) => i > 0 && String(r[0]) === String(id));
  if (rowIdx < 0) return { deleted: false };

  const now = new Date().toISOString();
  // deleted=col8, updatedAt=col9, updatedBy=col10
  sheet.getRange(rowIdx + 1, 8, 1, 3).setValues([[1, now, updatedBy ?? '']]);
  return { deleted: true };
}

// ── Helpers ───────────────────────────────────────────────

function _getOrCreateSheet(name, headers) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let sheet   = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function _sheetToObjects(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const hdrs = data[0].map(h => String(h));
  return data.slice(1).map(row => {
    const obj = {};
    hdrs.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

function _respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
