const express = require('express');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { PROFILE_SHEET, DEMANDS_SHEET, STATUS, ACTIVITY_COLUMNS, DASHBOARD_URL } = require('../config/constants');
const { readSheet } = require('../services/sheetsService');
const { parseMeta } = require('../services/demandService');
const { normalizeText } = require('../utils/text');

const router = express.Router();
router.use(authMiddleware, requireRole('admin'));

function isBrDate(value) {
  return /^\d{2}\/\d{2}\/\d{4}$/.test(normalizeText(value));
}

function isConcluido(status) {
  const text = normalizeText(status);
  return isBrDate(text) || text.startsWith(STATUS.CONCLUIDO);
}

function parseBrDate(value) {
  const text = normalizeText(value);
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]) - 1;
  const year = Number(match[3]);
  return new Date(year, month, day, 0, 0, 0, 0);
}

function isOlderThan48h(value) {
  const dt = parseBrDate(value);
  if (!dt) return false;
  return (Date.now() - dt.getTime()) >= (48 * 60 * 60 * 1000);
}

function isSigaQueueItem(row) {
  return !isConcluido(row.Finalizado);
}

function getRegisteredBy(row) {
  return normalizeText(row['Registrado por'] || row['Registrador por']);
}

function isSim(value) {
  return normalizeText(value).toLowerCase() === 'sim';
}

function parseSigaMeta(value) {
  const normalized = normalizeText(value).replace('%', '').replace(',', '.');
  const number = Number(normalized);
  if (Number.isFinite(number) && number > 0) {
    return number;
  }
  return 0.5;
}

router.get('/admin', async (_req, res) => {
  try {
    const [{ rows: users }, { rows: demandas }] = await Promise.all([
      readSheet(PROFILE_SHEET),
      readSheet(DEMANDS_SHEET)
    ]);

    const colaboradores = users.filter((row) => row.Ativo === 'Sim' && normalizeText(row.Role).toLowerCase() === 'colaborador');
    const pendingSiga = demandas.filter(isSigaQueueItem);
    const pendingSigaCount = pendingSiga.length;
    const pendingSigaMeta = pendingSiga.reduce((acc, row) => acc + parseSigaMeta(row['Meta registro siga']), 0);
    const cards = colaboradores.map((col) => {
      const minhas = demandas.filter((d) => normalizeText(d['Atribuida para']) === normalizeText(col.Atendente));
      const abertas = minhas.filter((d) => !isConcluido(d.Finalizado));
      let staleCount = abertas.filter((d) => isOlderThan48h(d['Data do Registro'])).length;

      let percentual = abertas.reduce((acc, d) => acc + parseMeta(d.Meta), 0);
      let emAndamento = abertas.filter((d) => d.Finalizado === STATUS.EM_ANDAMENTO).length;
      let naoIniciadas = abertas.filter((d) => {
        const st = normalizeText(d.Finalizado);
        return !st || st === STATUS.NAO_INICIADA;
      }).length;

      if (isSim(col.Whatsapp)) {
        const whatsappPendentes = demandas.filter((d) =>
          !normalizeText(d['Atribuida para']) &&
          getRegisteredBy(d) === normalizeText(col.Atendente) &&
          !isConcluido(d.Finalizado)
        );
        const whatsappCarga = whatsappPendentes.reduce((acc, d) => acc + parseSigaMeta(d['Meta registro siga']), 0);
        percentual += whatsappCarga;
        naoIniciadas += whatsappPendentes.length;
        staleCount += whatsappPendentes.filter((d) => isOlderThan48h(d['Data do Registro'])).length;
      }

      if (isSim(col.Registrosiga)) {
        percentual += pendingSigaMeta;
        naoIniciadas += pendingSigaCount;
        staleCount += pendingSiga.filter((d) => isOlderThan48h(d['Data do Registro'])).length;
      }

      return {
        nome: col.Atendente,
        ramal: col.Ramal,
        percentual,
        emAndamento,
        naoIniciadas,
        staleOver48h: staleCount > 0,
        atividades: ACTIVITY_COLUMNS.reduce((acc, key) => {
          acc[key] = col[key] || 'Não';
          return acc;
        }, {})
      };
    });

    return res.json({ cards, dashboardUrl: DASHBOARD_URL });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
