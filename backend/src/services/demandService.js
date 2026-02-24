const { DEMANDS_SHEET, DEMANDS_HEADERS } = require('../config/constants');
const { readSheet, ensureColumn } = require('./sheetsService');
const { currentYear } = require('../utils/datetime');

async function ensureDemandsMetaColumn() {
  await ensureColumn(DEMANDS_SHEET, 'Meta');
}

function parseMeta(value) {
  if (!value) {
    return 0;
  }
  const normalized = String(value).replace('%', '').replace(',', '.').trim();
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

async function generateNextSolicitacaoId() {
  const { rows } = await readSheet(DEMANDS_SHEET);
  const year = currentYear();
  const suffix = `/${year}`;

  const maxSeq = rows.reduce((acc, row) => {
    const id = String(row.ID || '').trim();
    if (!id.endsWith(suffix)) {
      return acc;
    }

    const match = id.match(/^S(\d{6})\/(\d{4})$/i);
    if (!match) {
      return acc;
    }

    return Math.max(acc, Number(match[1]));
  }, 0);

  const next = maxSeq + 1;
  const padded = String(next).padStart(6, '0');
  return `S${padded}/${year}`;
}

function numericPartFromId(id) {
  const match = String(id).match(/^S(\d{6})\/(\d{4})$/i);
  return match ? match[1] : '';
}

function demandsRowTemplate(overrides = {}) {
  const template = {};
  DEMANDS_HEADERS.forEach((h) => {
    template[h] = '';
  });
  return { ...template, ...overrides };
}

module.exports = {
  ensureDemandsMetaColumn,
  generateNextSolicitacaoId,
  numericPartFromId,
  parseMeta,
  demandsRowTemplate
};
