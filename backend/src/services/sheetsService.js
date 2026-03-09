const sheets = require('../config/google');
const env = require('../config/env');

const READ_CACHE_TTL_MS = Number(process.env.SHEETS_READ_CACHE_TTL_MS || 8000);
const SHEETS_RETRY_MAX = Number(process.env.SHEETS_RETRY_MAX || 4);
const SHEETS_RETRY_BASE_MS = Number(process.env.SHEETS_RETRY_BASE_MS || 250);
const SHEETS_RETRY_MAX_MS = Number(process.env.SHEETS_RETRY_MAX_MS || 2500);

const sheetReadCache = new Map();
const sheetReadInFlight = new Map();
const sheetValuesCache = new Map();
const sheetValuesInFlight = new Map();
const spreadsheetMetaCache = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(max = 120) {
  return Math.floor(Math.random() * max);
}

function extractStatusCode(error) {
  return Number(
    error?.code
    || error?.status
    || error?.response?.status
    || error?.response?.statusCode
    || 0
  );
}

function isQuotaLikeError(error) {
  const text = String(
    error?.message
    || error?.response?.data?.error?.message
    || ''
  ).toLowerCase();

  return (
    text.includes('quota')
    || text.includes('rate limit')
    || text.includes('userratelimitexceeded')
    || text.includes('ratelimitexceeded')
    || text.includes('read requests per minute')
  );
}

function shouldRetrySheets(error) {
  const status = extractStatusCode(error);
  if ([429, 500, 502, 503, 504].includes(status)) return true;
  if (status === 403 && isQuotaLikeError(error)) return true;
  return isQuotaLikeError(error);
}

async function callSheets(operationName, fn) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      const retryable = shouldRetrySheets(error);
      if (!retryable || attempt >= SHEETS_RETRY_MAX) {
        throw error;
      }

      attempt += 1;
      const delay = Math.min(
        SHEETS_RETRY_BASE_MS * (2 ** (attempt - 1)) + jitter(),
        SHEETS_RETRY_MAX_MS
      );

      console.warn(
        `[Sheets] ${operationName} tentativa ${attempt}/${SHEETS_RETRY_MAX} após erro temporário (${extractStatusCode(error) || 'sem-status'}). Aguardando ${delay}ms`
      );
      await sleep(delay);
    }
  }
}

function cacheKey(sheetName) {
  return `${env.googleSheetId}:${sheetName}`;
}

function valuesCacheKey(sheetName, range) {
  return `${env.googleSheetId}:${sheetName}:${range}`;
}

function invalidateSheetCache(sheetName) {
  const baseKey = `${env.googleSheetId}:${sheetName}`;
  sheetReadCache.delete(cacheKey(sheetName));
  sheetReadInFlight.delete(cacheKey(sheetName));

  for (const key of sheetValuesCache.keys()) {
    if (key.startsWith(`${baseKey}:`)) {
      sheetValuesCache.delete(key);
    }
  }
  for (const key of sheetValuesInFlight.keys()) {
    if (key.startsWith(`${baseKey}:`)) {
      sheetValuesInFlight.delete(key);
    }
  }
}

async function readSheet(sheetName, options = {}) {
  const forceRefresh = !!options.forceRefresh;
  const key = cacheKey(sheetName);

  if (!forceRefresh) {
    const cached = sheetReadCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    if (sheetReadInFlight.has(key)) {
      return sheetReadInFlight.get(key);
    }
  }

  const promise = (async () => {
    const range = `${sheetName}!A1:ZZ`;
    const response = await callSheets(`values.get:${sheetName}`, () => sheets.spreadsheets.values.get({
      spreadsheetId: env.googleSheetId,
      range
    }));

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
  })().finally(() => {
    sheetReadInFlight.delete(key);
  });

  sheetReadInFlight.set(key, promise);
  return promise;
}

async function readSheetValues(sheetName, range = 'A1:ZZ') {
  const key = valuesCacheKey(sheetName, range);
  const cached = sheetValuesCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  if (sheetValuesInFlight.has(key)) {
    return sheetValuesInFlight.get(key);
  }

  const promise = (async () => {
    const response = await callSheets(`values.get:${sheetName}:${range}`, () => sheets.spreadsheets.values.get({
      spreadsheetId: env.googleSheetId,
      range: `${sheetName}!${range}`
    }));
    const values = response.data.values || [];
    sheetValuesCache.set(key, { value: values, expiresAt: Date.now() + READ_CACHE_TTL_MS });
    return values;
  })().finally(() => {
    sheetValuesInFlight.delete(key);
  });

  sheetValuesInFlight.set(key, promise);
  return promise;
}

async function writeHeadersIfEmpty(sheetName, headers) {
  const current = await readSheet(sheetName);
  if (current.headers.length > 0) {
    return current.headers;
  }

  await callSheets(`values.update:${sheetName}:headers`, () => sheets.spreadsheets.values.update({
    spreadsheetId: env.googleSheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [headers] }
  }));
  invalidateSheetCache(sheetName);

  return headers;
}

async function ensureColumn(sheetName, headerName) {
  const { headers } = await readSheet(sheetName);
  if (headers.includes(headerName)) {
    return headers;
  }

  const updatedHeaders = [...headers, headerName];
  await callSheets(`values.update:${sheetName}:ensureColumn`, () => sheets.spreadsheets.values.update({
    spreadsheetId: env.googleSheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [updatedHeaders] }
  }));
  invalidateSheetCache(sheetName);

  return updatedHeaders;
}

async function appendMappedRow(sheetName, data, fallbackHeaders = []) {
  const existingHeaders = await writeHeadersIfEmpty(sheetName, fallbackHeaders);
  const headers = existingHeaders.length ? existingHeaders : fallbackHeaders;
  const row = headers.map((header) => data[header] ?? '');

  await callSheets(`values.append:${sheetName}`, () => sheets.spreadsheets.values.append({
    spreadsheetId: env.googleSheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] }
  }));
  invalidateSheetCache(sheetName);
}

async function updateMappedRow(sheetName, rowIndex, data) {
  const { headers } = await readSheet(sheetName);
  const row = headers.map((header) => data[header] ?? '');

  await callSheets(`values.update:${sheetName}:row${rowIndex}`, () => sheets.spreadsheets.values.update({
    spreadsheetId: env.googleSheetId,
    range: `${sheetName}!A${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: { values: [row] }
  }));
  invalidateSheetCache(sheetName);
}

async function updateMappedRowsBatch(sheetName, entries = []) {
  if (!Array.isArray(entries) || !entries.length) return;

  const { headers } = await readSheet(sheetName);
  const data = entries
    .filter((entry) => Number(entry?.rowIndex) >= 2 && entry?.data)
    .map((entry) => ({
      range: `${sheetName}!A${Number(entry.rowIndex)}`,
      values: [headers.map((header) => entry.data[header] ?? '')]
    }));

  if (!data.length) return;

  await callSheets(`values.batchUpdate:${sheetName}`, () => sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: env.googleSheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data
    }
  }));
  invalidateSheetCache(sheetName);
}

async function deleteRow(sheetName, rowIndex) {
  const metaKey = env.googleSheetId;
  let meta = spreadsheetMetaCache.get(metaKey);

  if (!meta || meta.expiresAt <= Date.now()) {
    const metaResponse = await callSheets('spreadsheets.get:meta', () => sheets.spreadsheets.get({
      spreadsheetId: env.googleSheetId
    }));
    meta = {
      data: metaResponse.data,
      expiresAt: Date.now() + (5 * 60 * 1000)
    };
    spreadsheetMetaCache.set(metaKey, meta);
  }

  const sheet = (meta.data.sheets || []).find((item) => item.properties.title === sheetName);
  if (!sheet) {
    throw new Error(`Aba não encontrada: ${sheetName}`);
  }

  await callSheets(`spreadsheets.batchUpdate:deleteRow:${sheetName}`, () => sheets.spreadsheets.batchUpdate({
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
  }));
  invalidateSheetCache(sheetName);
}

module.exports = {
  readSheet,
  readSheetValues,
  writeHeadersIfEmpty,
  ensureColumn,
  appendMappedRow,
  updateMappedRow,
  updateMappedRowsBatch,
  deleteRow
};
