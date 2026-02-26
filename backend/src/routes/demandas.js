const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { DEMANDS_SHEET, PROFILE_SHEET, STATUS } = require('../config/constants');
const { readSheet, updateMappedRow, appendMappedRow } = require('../services/sheetsService');
const { parseMeta, demandsRowTemplate, generateNextSolicitacaoId, ensureDemandsMetaColumn } = require('../services/demandService');
const { normalizeText, equalsIgnoreCase } = require('../utils/text');
const { toBrDate } = require('../utils/datetime');

const router = express.Router();
router.use(authMiddleware);

function getRegisteredBy(row) {
  return row['Registrado por'] || row['Registrador por'] || '';
}

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
    dataRegistro: row['Data do Registro'],
    finalizado: row.Finalizado,
    meta: parseMeta(row.Meta),
    categoria: row.Categoria || '',
    registradoPor: getRegisteredBy(row),
    finalizadoPor: row['Finalizado por'],
    atribuidaPara: row['Atribuida para'],
    medidasAdotadas: row['Medidas adotadas'] || '',
    demandaReabertaQtd: Number(row['Demanda reaberta qtd'] || 0),
    motivoReabertura: row['Motivo reabertura'] || '',
    respostaFinal: row['Resposta final'] || '',
    concluido: isConcluidoValue(row.Finalizado)
  };
}

async function hasSigaPermission(nome) {
  const { rows } = await readSheet(PROFILE_SHEET);
  const user = rows.find((row) => equalsIgnoreCase(row.Atendente, nome));
  return !!(user && equalsIgnoreCase(user.Registrosiga, 'Sim'));
}

function isSigaQueueItem(row) {
  const finalizado = normalizeText(row.Finalizado);
  return !isConcluidoValue(finalizado);
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
    const medidasAdotadas = normalizeText(req.body?.medidasAdotadas);
    const respostaFinal = normalizeText(req.body?.respostaFinal);

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
      if (!medidasAdotadas) {
        return res.status(400).json({ error: 'Medidas adotadas é obrigatório para concluir' });
      }
      if (Number(item['Demanda reaberta qtd'] || 0) >= 1 && !respostaFinal) {
        return res.status(400).json({ error: 'Resposta final é obrigatória para demanda reaberta' });
      }
      item['Medidas adotadas'] = medidasAdotadas;
      if (Number(item['Demanda reaberta qtd'] || 0) >= 1) {
        item['Resposta final'] = respostaFinal;
      }
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

    await ensureDemandsMetaColumn();
    const id = await generateNextSolicitacaoId(assunto);
    const row = demandsRowTemplate({
      ID: id,
      Assunto: assunto,
      'Descrição': descricao,
      'Data do Registro': toBrDate(),
      Finalizado: '',
      'Registrado por': req.user.nome,
      'Registrador por': req.user.nome,
      'Finalizado por': '',
      'Atribuida para': '',
      Meta: '0.5',
      'Meta registro siga': '0.5',
      Categoria: 'Baixo',
      'Medidas adotadas': '',
      'Demanda reaberta qtd': '0',
      'Motivo reabertura': '',
      'Resposta final': ''
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
    if (parseMeta(item.Meta) <= 0) {
      item.Meta = '0.5';
    }
    await updateMappedRow(DEMANDS_SHEET, item._rowIndex, item);

    return res.json({ message: 'Registro finalizado com sucesso' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
