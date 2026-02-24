const sheets = require('../config/google');
const env = require('../config/env');

async function readSheet(sheetName) {
  const range = `${sheetName}!A1:ZZ`;
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: env.googleSheetId,
    range
  });

  const values = response.data.values || [];
  if (!values.length) {
    return { headers: [], rows: [] };
  }

  const headers = values[0];
  const rows = values.slice(1).map((row, index) => {
    const rowObj = { _rowIndex: index + 2 };
    headers.forEach((header, i) => {
      rowObj[header] = row[i] || '';
    });
    return rowObj;
  });

  return { headers, rows };
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
}

module.exports = {
  readSheet,
  writeHeadersIfEmpty,
  ensureColumn,
  appendMappedRow,
  updateMappedRow,
  deleteRow
};
