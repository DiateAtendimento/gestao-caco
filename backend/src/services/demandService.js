const { DEMANDS_SHEET, DEMANDS_HEADERS } = require('../config/constants');
const { readSheet, ensureColumn } = require('./sheetsService');
const { currentYear } = require('../utils/datetime');

async function ensureDemandsMetaColumn() {
  await ensureColumn(DEMANDS_SHEET, 'Meta');
  await ensureColumn(DEMANDS_SHEET, 'Meta registro siga');
  await ensureColumn(DEMANDS_SHEET, 'Categoria');
  await ensureColumn(DEMANDS_SHEET, 'Medidas adotadas');
  await ensureColumn(DEMANDS_SHEET, 'Demanda reaberta qtd');
  await ensureColumn(DEMANDS_SHEET, 'Motivo reabertura');
  await ensureColumn(DEMANDS_SHEET, 'Resposta final');
  await ensureColumn(DEMANDS_SHEET, 'Origem');
}

function normalizeIdText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase();
}

function assuntoPrefix(assunto) {
  const clean = normalizeIdText(assunto);
  const overrides = {
    WHATSAPP: 'WST',
    GESCON: 'GCN'
  };
  if (overrides[clean]) {
    return overrides[clean];
  }
  if (clean.length >= 3) {
    const middle = clean.charAt(Math.floor(clean.length / 2));
    return `${clean.charAt(0)}${middle}${clean.charAt(clean.length - 1)}`;
  }
  return clean.padEnd(3, 'X').slice(0, 3);
}

function parseMeta(value) {
  if (!value) {
    return 0;
  }
  const normalized = String(value).replace('%', '').replace(',', '.').trim();
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

async function generateNextSolicitacaoId(assunto) {
  const { rows } = await readSheet(DEMANDS_SHEET);
  const year = currentYear();
  const prefix = assuntoPrefix(assunto);
  const expectedStart = `${prefix}`;
  const expectedEnd = `/${year}`;

  const maxSeq = rows.reduce((acc, row) => {
    const id = String(row.ID || '').trim();
    if (!id.startsWith(expectedStart) || !id.endsWith(expectedEnd)) {
      return acc;
    }

    const match = id.match(/^([A-Z]{3})(\d{6})\/(\d{4})$/i);
    if (!match) {
      return acc;
    }

    return Math.max(acc, Number(match[2]));
  }, 0);

  const next = maxSeq + 1;
  const padded = String(next).padStart(6, '0');
  return `${prefix}${padded}/${year}`;
}

function numericPartFromId(id) {
  const match = String(id).match(/^[A-Z]{3}(\d{6})\/(\d{4})$/i);
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
  assuntoPrefix,
  numericPartFromId,
  parseMeta,
  demandsRowTemplate
};
