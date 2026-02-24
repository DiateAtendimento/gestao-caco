const express = require('express');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { PROFILE_SHEET, DEMANDS_SHEET, STATUS, ACTIVITY_COLUMNS, DASHBOARD_URL } = require('../config/constants');
const { readSheet } = require('../services/sheetsService');
const { parseMeta } = require('../services/demandService');
const { normalizeText } = require('../utils/text');

const router = express.Router();
router.use(authMiddleware, requireRole('admin'));

function isConcluido(status) {
  return normalizeText(status).startsWith(STATUS.CONCLUIDO);
}

router.get('/admin', async (_req, res) => {
  try {
    const [{ rows: users }, { rows: demandas }] = await Promise.all([
      readSheet(PROFILE_SHEET),
      readSheet(DEMANDS_SHEET)
    ]);

    const colaboradores = users.filter((row) => row.Ativo === 'Sim' && normalizeText(row.Role).toLowerCase() === 'colaborador');

    const cards = colaboradores.map((col) => {
      const minhas = demandas.filter((d) => normalizeText(d['Nome do atendente']) === normalizeText(col.Atendente));
      const abertas = minhas.filter((d) => !isConcluido(d.Finalizado));

      const percentual = abertas.reduce((acc, d) => acc + parseMeta(d.Meta), 0);
      const emAndamento = abertas.filter((d) => d.Finalizado === STATUS.EM_ANDAMENTO).length;
      const naoIniciadas = abertas.filter((d) => d.Finalizado === STATUS.NAO_INICIADA).length;

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
