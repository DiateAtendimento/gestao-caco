const express = require('express');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { PROFILE_SHEET } = require('../config/constants');
const { readSheet } = require('../services/sheetsService');
const { equalsIgnoreCase, normalizeText } = require('../utils/text');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const nome = normalizeText(req.body?.nome);
    if (!nome) {
      return res.status(400).json({ error: 'Nome é obrigatório' });
    }

    const { rows } = await readSheet(PROFILE_SHEET);
    const user = rows.find((row) => equalsIgnoreCase(row.Atendente, nome));

    if (!user || user.Ativo !== 'Sim') {
      return res.status(401).json({ error: 'Usuário inválido ou inativo' });
    }

    const role = normalizeText(user.Role).toLowerCase();
    if (role !== 'admin' && role !== 'colaborador') {
      return res.status(400).json({ error: 'Role inválida na planilha' });
    }

    if (equalsIgnoreCase(nome, 'admin') && role !== 'admin') {
      return res.status(401).json({ error: 'Login admin requer role=admin' });
    }

    const payload = {
      nome: user.Atendente,
      role
    };

    const token = jwt.sign(payload, env.jwtSecret, { expiresIn: '12h' });

    return res.json({
      token,
      user: payload
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
