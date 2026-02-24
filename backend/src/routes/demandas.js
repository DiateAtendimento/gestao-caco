const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { DEMANDS_SHEET, STATUS } = require('../config/constants');
const { readSheet, updateMappedRow, appendMappedRow } = require('../services/sheetsService');
const { parseMeta, demandsRowTemplate } = require('../services/demandService');
const { normalizeText } = require('../utils/text');
const { toBrDateTime } = require('../utils/datetime');

const router = express.Router();
router.use(authMiddleware);

function isConcluido(status) {
  return normalizeText(status).startsWith(STATUS.CONCLUIDO);
}

router.get('/', async (req, res) => {
  try {
    const atendente = normalizeText(req.query.atendente);
    if (!atendente) {
      return res.status(400).json({ error: 'atendente é obrigatório' });
    }

    if (req.user.role === 'colaborador' && atendente !== req.user.nome) {
      return res.status(403).json({ error: 'Colaborador só pode ver as próprias demandas' });
    }

    const { rows } = await readSheet(DEMANDS_SHEET);
    const demandas = rows
      .filter((row) => normalizeText(row['Nome do atendente']) === atendente)
      .map((row) => ({
        id: row.ID,
        area: row.Assunto,
        descricao: row['Descrição'],
        finalizado: row.Finalizado,
        meta: parseMeta(row.Meta),
        concluido: isConcluido(row.Finalizado)
      }));

    return res.json({ demandas });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/:id/status', async (req, res) => {
  try {
    const id = normalizeText(req.params.id);
    const statusInput = normalizeText(req.body?.status);

    if (![STATUS.NAO_INICIADA, STATUS.EM_ANDAMENTO, STATUS.CONCLUIDO].includes(statusInput)) {
      return res.status(400).json({ error: 'Status inválido' });
    }

    const { rows } = await readSheet(DEMANDS_SHEET);
    const item = rows.find((row) => row.ID === id);
    if (!item) {
      return res.status(404).json({ error: 'Demanda não encontrada' });
    }

    const dono = normalizeText(item['Nome do atendente']);
    if (req.user.role === 'colaborador' && dono !== req.user.nome) {
      return res.status(403).json({ error: 'Acesso negado para esta demanda' });
    }

    if (statusInput === STATUS.CONCLUIDO) {
      item.Finalizado = `${STATUS.CONCLUIDO} - ${toBrDateTime()}`;
    } else {
      item.Finalizado = statusInput;
    }

    await updateMappedRow(DEMANDS_SHEET, item._rowIndex, item);
    return res.json({ message: 'Status atualizado', finalizado: item.Finalizado });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/registro-whatsapp', async (req, res) => {
  try {
    if (req.user.role !== 'colaborador') {
      return res.status(403).json({ error: 'Somente colaborador' });
    }

    const assunto = normalizeText(req.body?.assunto);
    const descricao = normalizeText(req.body?.descricao);

    if (!assunto || !descricao) {
      return res.status(400).json({ error: 'Assunto e descrição são obrigatórios' });
    }

    const row = demandsRowTemplate({
      ID: `WPP-${Date.now()}`,
      Assunto: `Registro WhatsApp: ${assunto}`,
      'Descrição': descricao,
      'Data do Registro': toBrDateTime(),
      Finalizado: STATUS.NAO_INICIADA,
      'Número da solicitação': '',
      'Nome do atendente': req.user.nome,
      Meta: '0'
    });

    await appendMappedRow(DEMANDS_SHEET, row);
    return res.status(201).json({ message: 'Registro WhatsApp salvo' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
