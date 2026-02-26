const sheets = require('../config/google');
const env = require('../config/env');

const READ_CACHE_TTL_MS = 4000;
const sheetReadCache = new Map();

function cacheKey(sheetName) {
  return `${env.googleSheetId}:${sheetName}`;
}

function invalidateSheetCache(sheetName) {
  sheetReadCache.delete(cacheKey(sheetName));
}

async function readSheet(sheetName) {
  const key = cacheKey(sheetName);
  const cached = sheetReadCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const range = `${sheetName}!A1:ZZ`;
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: env.googleSheetId,
    range
  });

  const values = response.data.values || [];
  if (!values.length) {
    const empty = { headers: [], rows: [] };
    sheetReadCache.set(key, { value: empty, expiresAt: Date.now() + READ_CACHE_TTL_MS });
    return empty;
  }

  const headers = values[0];
  const rows = values.slice(1).map((row, index) => {
    const rowObj = { _rowIndex: index + 2 };
    headers.forEach((header, i) => {
      rowObj[header] = row[i] || '';
    });
    return rowObj;
  });

  const parsed = { headers, rows };
  sheetReadCache.set(key, { value: parsed, expiresAt: Date.now() + READ_CACHE_TTL_MS });
  return parsed;
}

async function writeHeadersIfEmpty(sheetName, headers) {
  const current = await readSheet(sheetName);
  if (current.headers.length > 0) {
    return current.headers;
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: env.googleSheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [headers] }
  });
  invalidateSheetCache(sheetName);

  return headers;
}

async function ensureColumn(sheetName, headerName) {
  const { headers } = await readSheet(sheetName);
  if (headers.includes(headerName)) {
    return headers;
  }

  const updatedHeaders = [...headers, headerName];
  await sheets.spreadsheets.values.update({
    spreadsheetId: env.googleSheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [updatedHeaders] }
  });
  invalidateSheetCache(sheetName);

  return updatedHeaders;
}

async function appendMappedRow(sheetName, data, fallbackHeaders = []) {
  const existingHeaders = await writeHeadersIfEmpty(sheetName, fallbackHeaders);
  const headers = existingHeaders.length ? existingHeaders : fallbackHeaders;
  const row = headers.map((header) => data[header] ?? '');

  await sheets.spreadsheets.values.append({
    spreadsheetId: env.googleSheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] }
  });
  invalidateSheetCache(sheetName);
}

async function updateMappedRow(sheetName, rowIndex, data) {
  const { headers } = await readSheet(sheetName);
  const row = headers.map((header) => data[header] ?? '');

  await sheets.spreadsheets.values.update({
    spreadsheetId: env.googleSheetId,
    range: `${sheetName}!A${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: { values: [row] }
  });
  invalidateSheetCache(sheetName);
}

async function deleteRow(sheetName, rowIndex) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: env.googleSheetId
  });

  const sheet = (meta.data.sheets || []).find((item) => item.properties.title === sheetName);
  if (!sheet) {
    throw new Error(`Aba não encontrada: ${sheetName}`);
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: env.googleSheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: sheet.properties.sheetId,
              dimension: 'ROWS',
              startIndex: rowIndex - 1,
              endIndex: rowIndex
            }
          }
        }
      ]
    }
  });
  invalidateSheetCache(sheetName);
}

module.exports = {
  readSheet,
  writeHeadersIfEmpty,
  ensureColumn,
  appendMappedRow,
  updateMappedRow,
  deleteRow
};
