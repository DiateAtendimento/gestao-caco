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

function isSigaQueueItem(row) {
  const registradoPor = normalizeText(row['Registrado por']);
  const atribuidaPara = normalizeText(row['Atribuida para']);
  return !!registradoPor && !atribuidaPara && !isConcluido(row.Finalizado);
}

router.get('/admin', async (_req, res) => {
  try {
    const [{ rows: users }, { rows: demandas }] = await Promise.all([
      readSheet(PROFILE_SHEET),
      readSheet(DEMANDS_SHEET)
    ]);

    const colaboradores = users.filter((row) => row.Ativo === 'Sim' && normalizeText(row.Role).toLowerCase() === 'colaborador');
    const pendingSigaCount = demandas.filter(isSigaQueueItem).length;

    const cards = colaboradores.map((col) => {
      const minhas = demandas.filter((d) => normalizeText(d['Atribuida para']) === normalizeText(col.Atendente));
      const abertas = minhas.filter((d) => !isConcluido(d.Finalizado));

      let percentual = abertas.reduce((acc, d) => acc + parseMeta(d.Meta), 0);
      let emAndamento = abertas.filter((d) => d.Finalizado === STATUS.EM_ANDAMENTO).length;
      let naoIniciadas = abertas.filter((d) => {
        const st = normalizeText(d.Finalizado);
        return !st || st === STATUS.NAO_INICIADA;
      }).length;

      if (normalizeText(col.Registrosiga) === 'Sim') {
        percentual = 0;
        emAndamento = 0;
        naoIniciadas = pendingSigaCount;
      }

      return {
        nome: col.Atendente,
        ramal: col.Ramal,
        percentual,
        emAndamento,
        naoIniciadas,
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
