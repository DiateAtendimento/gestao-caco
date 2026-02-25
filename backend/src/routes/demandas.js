const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { DEMANDS_SHEET, PROFILE_SHEET, STATUS } = require('../config/constants');
const { readSheet, updateMappedRow, appendMappedRow } = require('../services/sheetsService');
const { parseMeta, demandsRowTemplate } = require('../services/demandService');
const { normalizeText, equalsIgnoreCase } = require('../utils/text');
const { toBrDate } = require('../utils/datetime');

const router = express.Router();
router.use(authMiddleware);

function isBrDate(value) {
  return /^\d{2}\/\d{2}\/\d{4}$/.test(normalizeText(value));
}

function isConcluidoValue(value) {
  const text = normalizeText(value);
  return isBrDate(text) || text.startsWith(STATUS.CONCLUIDO);
}

function mapDemanda(row) {
  return {
    id: row.ID,
    area: row.Assunto,
    descricao: row['Descrição'],
    finalizado: row.Finalizado,
    meta: parseMeta(row.Meta),
    registradoPor: row['Registrado por'],
    finalizadoPor: row['Finalizado por'],
    atribuidaPara: row['Atribuida para'],
    concluido: isConcluidoValue(row.Finalizado)
  };
}

async function hasSigaPermission(nome) {
  const { rows } = await readSheet(PROFILE_SHEET);
  const user = rows.find((row) => equalsIgnoreCase(row.Atendente, nome));
  return user && normalizeText(user.Registrosiga) === 'Sim';
}

function isSigaQueueItem(row) {
  const registradoPor = normalizeText(row['Registrado por']);
  const atribuidaPara = normalizeText(row['Atribuida para']);
  const finalizado = normalizeText(row.Finalizado);
  return !!registradoPor && !atribuidaPara && !isBrDate(finalizado);
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
      .filter((row) => normalizeText(row['Atribuida para']) === atendente)
      .map(mapDemanda);

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

    const dono = normalizeText(item['Atribuida para']);
    if (req.user.role === 'colaborador' && dono !== req.user.nome) {
      return res.status(403).json({ error: 'Acesso negado para esta demanda' });
    }

    if (statusInput === STATUS.CONCLUIDO) {
      item.Finalizado = toBrDate();
      item['Finalizado por'] = req.user.nome;
    } else if (statusInput === STATUS.EM_ANDAMENTO) {
      item.Finalizado = STATUS.EM_ANDAMENTO;
    } else {
      item.Finalizado = '';
      item['Finalizado por'] = '';
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
      Assunto: assunto,
      'Descrição': descricao,
      'Data do Registro': toBrDate(),
      Finalizado: '',
      'Registrado por': req.user.nome,
      'Finalizado por': '',
      'Atribuida para': '',
      Meta: '0'
    });

    await appendMappedRow(DEMANDS_SHEET, row);
    return res.status(201).json({ message: 'Registro WhatsApp salvo' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/registros-siga', async (req, res) => {
  try {
    if (!(await hasSigaPermission(req.user.nome))) {
      return res.status(403).json({ error: 'Usuário sem permissão de Registro SIGA' });
    }

    const { rows } = await readSheet(DEMANDS_SHEET);
    const pendentes = rows.filter(isSigaQueueItem).map(mapDemanda);
    return res.json({ registros: pendentes });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/registros-siga/:id/registrado', async (req, res) => {
  try {
    if (!(await hasSigaPermission(req.user.nome))) {
      return res.status(403).json({ error: 'Usuário sem permissão de Registro SIGA' });
    }

    const id = normalizeText(req.params.id);
    const { rows } = await readSheet(DEMANDS_SHEET);
    const item = rows.find((row) => row.ID === id);
    if (!item) {
      return res.status(404).json({ error: 'Registro não encontrado' });
    }

    item.Finalizado = toBrDate();
    item['Finalizado por'] = req.user.nome;
    await updateMappedRow(DEMANDS_SHEET, item._rowIndex, item);

    return res.json({ message: 'Registro finalizado com sucesso' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
