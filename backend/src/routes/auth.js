const express = require('express');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { PROFILE_SHEET } = require('../config/constants');
const { readSheet, ensureColumn, updateMappedRow } = require('../services/sheetsService');
const { equalsIgnoreCase, normalizeText } = require('../utils/text');

const router = express.Router();
let senhaColumnReady = false;

router.post('/login', async (req, res) => {
  try {
    const nome = normalizeText(req.body?.nome);
    const senha = normalizeText(req.body?.senha);
    if (!nome || !senha) {
      return res.status(400).json({ error: 'Nome e senha são obrigatórios' });
    }

    if (!senhaColumnReady) {
      await ensureColumn(PROFILE_SHEET, 'Senha');
      senhaColumnReady = true;
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

    const senhaPlanilha = normalizeText(user.Senha);
    if (!senhaPlanilha) {
      return res.status(401).json({ error: 'Senha não configurada para este usuário' });
    }

    if (senha !== senhaPlanilha) {
      return res.status(401).json({ error: 'Senha inválida' });
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

router.post('/primeiro-acesso', async (req, res) => {
  try {
    const nome = normalizeText(req.body?.nome);
    const senha = normalizeText(req.body?.senha);
    const confirmarSenha = normalizeText(req.body?.confirmarSenha);

    if (!nome || !senha || !confirmarSenha) {
      return res.status(400).json({ error: 'Nome, senha e confirmação são obrigatórios' });
    }

    if (senha !== confirmarSenha) {
      return res.status(400).json({ error: 'As senhas não conferem' });
    }

    if (!senhaColumnReady) {
      await ensureColumn(PROFILE_SHEET, 'Senha');
      senhaColumnReady = true;
    }

    const { rows } = await readSheet(PROFILE_SHEET);
    const user = rows.find((row) => equalsIgnoreCase(row.Atendente, nome));

    if (!user || user.Ativo !== 'Sim') {
      return res.status(404).json({ error: 'Atendente não encontrado ou inativo' });
    }

    if (normalizeText(user.Senha)) {
      return res.status(400).json({ error: 'Este usuário já possui senha cadastrada' });
    }

    user.Senha = senha;
    await updateMappedRow(PROFILE_SHEET, user._rowIndex, user);
    return res.json({ message: 'Primeiro acesso concluído com sucesso' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
