const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { PROFILE_SHEET, ACTIVITY_COLUMNS } = require('../config/constants');
const { readSheet, ensureColumn } = require('../services/sheetsService');
const { equalsIgnoreCase, normalizeText } = require('../utils/text');

const router = express.Router();
router.use(authMiddleware);

function isSim(value) {
  return normalizeText(value).toLowerCase() === 'sim';
}

router.get('/me', async (req, res) => {
  try {
    await ensureColumn(PROFILE_SHEET, 'Senha');
    const { rows } = await readSheet(PROFILE_SHEET);
    const profile = rows.find((row) => equalsIgnoreCase(row.Atendente, req.user.nome));

    if (!profile || profile.Ativo !== 'Sim') {
      return res.status(404).json({ error: 'Perfil não encontrado ou inativo' });
    }

    const atividades = ACTIVITY_COLUMNS.filter((key) => isSim(profile[key]));

    return res.json({
      nome: profile.Atendente,
      ramal: profile.Ramal,
      role: normalizeText(profile.Role).toLowerCase(),
      atividades,
      flags: ACTIVITY_COLUMNS.reduce((acc, key) => {
        acc[key] = isSim(profile[key]) ? 'Sim' : 'Não';
        return acc;
      }, {})
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
