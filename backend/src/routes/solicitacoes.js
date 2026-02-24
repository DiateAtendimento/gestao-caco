const express = require('express');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { DEMANDS_SHEET, DEMANDS_HEADERS, STATUS } = require('../config/constants');
const { readSheet, appendMappedRow, updateMappedRow, deleteRow, writeHeadersIfEmpty } = require('../services/sheetsService');
const {
  ensureDemandsMetaColumn,
  generateNextSolicitacaoId,
  numericPartFromId,
  demandsRowTemplate,
  parseMeta
} = require('../services/demandService');
const { normalizeText } = require('../utils/text');
const { toBrDateTime } = require('../utils/datetime');

const router = express.Router();
router.use(authMiddleware);

function mapSolicitacao(row) {
  return {
    id: row.ID,
    area: row.Assunto,
    descricao: row['Descrição'],
    dataRegistro: row['Data do Registro'],
    finalizado: row.Finalizado,
    numeroSolicitacao: row['Número da solicitação'],
    nomeAtendente: row['Nome do atendente'],
    meta: parseMeta(row.Meta)
  };
}

router.get('/', async (req, res) => {
  try {
    await writeHeadersIfEmpty(DEMANDS_SHEET, DEMANDS_HEADERS);
    await ensureDemandsMetaColumn();
    const { rows } = await readSheet(DEMANDS_SHEET);

    const pendentes = req.query.pendentes === 'true';
    const atendente = normalizeText(req.query.atendente);

    let filtered = rows;
    if (pendentes) {
      filtered = filtered.filter((row) => !normalizeText(row['Nome do atendente']));
    }
    if (atendente) {
      filtered = filtered.filter((row) => normalizeText(row['Nome do atendente']) === atendente);
    }

    return res.json({ solicitacoes: filtered.map(mapSolicitacao) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    await writeHeadersIfEmpty(DEMANDS_SHEET, DEMANDS_HEADERS);
    await ensureDemandsMetaColumn();

    const area = normalizeText(req.body?.area);
    const descricao = normalizeText(req.body?.descricao);
    const meta = parseMeta(req.body?.meta);

    if (!area || !descricao || meta <= 0) {
      return res.status(400).json({ error: 'Área, descrição e meta são obrigatórios' });
    }

    const id = await generateNextSolicitacaoId();
    const row = demandsRowTemplate({
      ID: id,
      Assunto: area,
      'Descrição': descricao,
      'Data do Registro': toBrDateTime(),
      Finalizado: STATUS.NAO_INICIADA,
      'Número da solicitação': numericPartFromId(id),
      'Nome do atendente': '',
      Meta: String(meta)
    });

    await appendMappedRow(DEMANDS_SHEET, row, DEMANDS_HEADERS);
    return res.status(201).json({ message: 'Solicitação criada', id });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const id = normalizeText(req.params.id);
    const area = normalizeText(req.body?.area);
    const descricao = normalizeText(req.body?.descricao);
    const meta = parseMeta(req.body?.meta);

    const { rows } = await readSheet(DEMANDS_SHEET);
    const item = rows.find((row) => row.ID === id);
    if (!item) {
      return res.status(404).json({ error: 'Solicitação não encontrada' });
    }

    if (area) item.Assunto = area;
    if (descricao) item['Descrição'] = descricao;
    if (meta > 0) item.Meta = String(meta);

    await updateMappedRow(DEMANDS_SHEET, item._rowIndex, item);
    return res.json({ message: 'Solicitação atualizada' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const id = normalizeText(req.params.id);
    const { rows } = await readSheet(DEMANDS_SHEET);
    const item = rows.find((row) => row.ID === id);
    if (!item) {
      return res.status(404).json({ error: 'Solicitação não encontrada' });
    }

    await deleteRow(DEMANDS_SHEET, item._rowIndex);
    return res.json({ message: 'Solicitação removida' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/:id/atribuir', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const id = normalizeText(req.params.id);
    const atendenteNome = normalizeText(req.body?.atendenteNome);

    if (!atendenteNome) {
      return res.status(400).json({ error: 'atendenteNome é obrigatório' });
    }

    const { rows } = await readSheet(DEMANDS_SHEET);
    const item = rows.find((row) => row.ID === id);
    if (!item) {
      return res.status(404).json({ error: 'Solicitação não encontrada' });
    }

    item['Nome do atendente'] = atendenteNome;
    if (!item.Finalizado) {
      item.Finalizado = STATUS.NAO_INICIADA;
    }

    await updateMappedRow(DEMANDS_SHEET, item._rowIndex, item);
    return res.json({ message: 'Solicitação atribuída' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
