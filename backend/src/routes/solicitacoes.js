const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { DEMANDS_SHEET, DEMANDS_HEADERS, STATUS } = require('../config/constants');
const { readSheet, appendMappedRow, updateMappedRow, deleteRow, writeHeadersIfEmpty } = require('../services/sheetsService');
const { ensureDemandsMetaColumn, generateNextSolicitacaoId, demandsRowTemplate, parseMeta } = require('../services/demandService');
const { normalizeText } = require('../utils/text');
const { toBrDate } = require('../utils/datetime');

const router = express.Router();
router.use(authMiddleware);

function mapSolicitacao(row) {
  return {
    id: row.ID,
    area: row.Assunto,
    descricao: row['Descrição'],
    dataRegistro: row['Data do Registro'],
    finalizado: row.Finalizado,
    registradoPor: row['Registrado por'] || row['Registrador por'],
    finalizadoPor: row['Finalizado por'],
    atribuidaPara: row['Atribuida para'],
    meta: parseMeta(row.Meta),
    categoria: normalizeCategoria(row.Categoria),
    medidasAdotadas: row['Medidas adotadas'] || '',
    demandaReabertaQtd: Number(row['Demanda reaberta qtd'] || 0),
    motivoReabertura: row['Motivo reabertura'] || '',
    respostaFinal: row['Resposta final'] || ''
  };
}

function isBrDate(value) {
  return /^\d{2}\/\d{2}\/\d{4}$/.test(normalizeText(value));
}

function isConcluido(status) {
  const text = normalizeText(status);
  return isBrDate(text) || text.startsWith(STATUS.CONCLUIDO);
}

function normalizeCategoria(value) {
  const text = normalizeText(value).toLowerCase();
  if (text === 'baixo') return 'Baixo';
  if (text === 'medio' || text === 'médio') return 'Médio';
  if (text === 'urgente') return 'Urgente';
  return '';
}

function categoriaFromMeta(meta) {
  if (meta >= 5) return 'Urgente';
  if (meta >= 3) return 'Médio';
  return 'Baixo';
}

router.get('/', async (req, res) => {
  try {
    await writeHeadersIfEmpty(DEMANDS_SHEET, DEMANDS_HEADERS);
    await ensureDemandsMetaColumn();

    const { rows } = await readSheet(DEMANDS_SHEET);
    const pendentes = req.query.pendentes === 'true';
    const atendente = normalizeText(req.query.atendente);
    const minhas = req.query.minhas === 'true';
    const historico = req.query.historico === 'true';

    let filtered = rows;
    if (pendentes) {
      filtered = filtered.filter((row) => !normalizeText(row['Atribuida para']) && !isConcluido(row.Finalizado));
    }
    if (minhas) {
      filtered = filtered.filter((row) =>
        normalizeText(row['Registrado por'] || row['Registrador por']) === normalizeText(req.user.nome)
      );
    }
    if (atendente) {
      filtered = filtered.filter((row) => normalizeText(row['Atribuida para']) === atendente);
    }
    if (historico) {
      filtered = filtered.filter((row) => !!normalizeText(row['Atribuida para']) && isConcluido(row.Finalizado));
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
    const atendenteNome = normalizeText(req.body?.atendenteNome);
    const categoria = normalizeCategoria(req.body?.categoria);

    if (!area || !descricao || meta <= 0 || !categoria) {
      return res.status(400).json({ error: 'Área, descrição, meta e categoria são obrigatórios' });
    }
    if (categoria !== categoriaFromMeta(meta)) {
      return res.status(400).json({ error: 'Categoria incompatível com a meta informada' });
    }

    const id = await generateNextSolicitacaoId(area);
    const row = demandsRowTemplate({
      ID: id,
      Assunto: area,
      'Descrição': descricao,
      'Data do Registro': toBrDate(),
      Finalizado: '',
      'Registrado por': req.user.nome,
      'Registrador por': req.user.nome,
      'Finalizado por': '',
      'Atribuida para': atendenteNome || '',
      Meta: String(meta),
      'Meta registro siga': '0.5',
      Categoria: categoria,
      'Medidas adotadas': '',
      'Demanda reaberta qtd': '0',
      'Motivo reabertura': '',
      'Resposta final': ''
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
    const categoria = normalizeCategoria(req.body?.categoria);

    const { rows } = await readSheet(DEMANDS_SHEET);
    const item = rows.find((row) => row.ID === id);
    if (!item) {
      return res.status(404).json({ error: 'Solicitação não encontrada' });
    }

    if (area) item.Assunto = area;
    if (descricao) item['Descrição'] = descricao;
    if (meta > 0) item.Meta = String(meta);
    if (categoria) {
      if (meta > 0 && categoria !== categoriaFromMeta(meta)) {
        return res.status(400).json({ error: 'Categoria incompatível com a meta informada' });
      }
      item.Categoria = categoria;
    }

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

    item['Atribuida para'] = atendenteNome;
    await updateMappedRow(DEMANDS_SHEET, item._rowIndex, item);
    return res.json({ message: 'Solicitação atribuída' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/:id/reabrir', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const id = normalizeText(req.params.id);
    const motivoReabertura = normalizeText(req.body?.motivoReabertura);
    if (!motivoReabertura) {
      return res.status(400).json({ error: 'Motivo de reabertura é obrigatório' });
    }

    const { rows } = await readSheet(DEMANDS_SHEET);
    const item = rows.find((row) => row.ID === id);
    if (!item) {
      return res.status(404).json({ error: 'Solicitação não encontrada' });
    }

    const reaberturaAtual = Number(item['Demanda reaberta qtd'] || 0);
    if (reaberturaAtual >= 1) {
      return res.status(400).json({ error: 'Esta demanda já foi reaberta uma vez. Abra um novo chamado.' });
    }
    if (!isConcluido(item.Finalizado)) {
      return res.status(400).json({ error: 'Somente demandas concluídas podem ser reabertas' });
    }

    item['Demanda reaberta qtd'] = String(reaberturaAtual + 1);
    item['Motivo reabertura'] = motivoReabertura;
    item['Resposta final'] = '';
    item.Finalizado = '';
    item['Finalizado por'] = '';
    await updateMappedRow(DEMANDS_SHEET, item._rowIndex, item);

    return res.json({ message: 'Demanda reaberta com sucesso' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
