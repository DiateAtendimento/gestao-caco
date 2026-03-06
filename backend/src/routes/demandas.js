const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { DEMANDS_SHEET, PROFILE_SHEET, REDIRECT_SHEET, REDIRECT_HEADERS, ACTIVITY_COLUMNS, STATUS } = require('../config/constants');
const { readSheet, updateMappedRow, appendMappedRow, writeHeadersIfEmpty } = require('../services/sheetsService');
const { parseMeta, demandsRowTemplate, generateNextSolicitacaoId, ensureDemandsMetaColumn } = require('../services/demandService');
const { normalizeText, equalsIgnoreCase } = require('../utils/text');
const { toBrDate, toBrDateTime, currentYear } = require('../utils/datetime');

const router = express.Router();
router.use(authMiddleware);
const permissionCache = new Map();
const PERMISSION_TTL_MS = 60 * 1000;

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
    rowIndex: Number(row._rowIndex || 0) || null,
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
    origem: normalizeText(row.Origem).toLowerCase(),
    concluido: isConcluidoValue(row.Finalizado)
  };
}

function resolveDemandRow(rows, id, rowIndexInput) {
  const parsedRowIndex = Number(rowIndexInput || 0);
  if (Number.isInteger(parsedRowIndex) && parsedRowIndex >= 2) {
    const byRow = rows.find((row) => Number(row._rowIndex) === parsedRowIndex);
    if (byRow) {
      return byRow;
    }
  }
  return rows.find((row) => row.ID === id);
}

async function hasSigaPermission(nome) {
  const key = normalizeText(nome).toLowerCase();
  const cached = permissionCache.get(`siga:${key}`);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }
  const { rows } = await readSheet(PROFILE_SHEET);
  const user = rows.find((row) => equalsIgnoreCase(row.Atendente, nome));
  const value = !!(user && equalsIgnoreCase(user.Registrosiga, 'Sim'));
  permissionCache.set(`siga:${key}`, { value, expiresAt: now + PERMISSION_TTL_MS });
  return value;
}

function isSigaQueueItem(row) {
  const finalizado = normalizeText(row.Finalizado);
  const origem = normalizeText(row.Origem).toLowerCase();
  const isSigaOrigin = origem === 'whatsapp' || origem === 'webconferencia';
  if (isConcluidoValue(finalizado)) return false;
  if (!isSigaOrigin) return false;
  return true;
}

function parseBrDate(value) {
  const text = normalizeText(value);
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]) - 1;
  const year = Number(match[3]);
  const parsed = new Date(year, month, day, 0, 0, 0, 0);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function sortByMostRecent(rows) {
  return [...rows].sort((a, b) => {
    const db = parseBrDate(b['Data do Registro']);
    const da = parseBrDate(a['Data do Registro']);
    if (db && da && db.getTime() !== da.getTime()) return db - da;
    if (db && !da) return -1;
    if (!db && da) return 1;
    return (Number(b._rowIndex || 0) || 0) - (Number(a._rowIndex || 0) || 0);
  });
}

function normalizeComparableText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toLowerCase();
}

function mapAreaToActivityColumn(area) {
  const key = normalizeComparableText(area);
  if (!key) return '';
  const map = {
    ti: 'Ti',
    whatsapp: 'Whatsapp',
    email: 'Email',
    telefone: 'Telefone',
    webconferencia: 'Webconferencia',
    progregularidade: 'Programaregularidade',
    programaregularidade: 'Programaregularidade',
    programaderegularidade: 'Programaregularidade',
    sei: 'Sei',
    falabr: 'Falabr',
    registrosiga: 'Registrosiga',
    registrossiga: 'Registrosiga',
    siga: 'Registrosiga',
    servprotocolo: 'Servicoprotocolo',
    servicodeprotocolo: 'Servicoprotocolo',
    gescon: 'Gescon',
    taxigov: 'Taxigov',
    salareuniao400: 'Salareuniao400',
    sala400: 'Salareuniao400',
    benspatrimonio: 'Benspatrimonio',
    bensepatrimonio: 'Benspatrimonio',
    materialescritorio: 'Materialescritorio',
    materialdeescritorio: 'Materialescritorio',
    phplist: 'Phplist',
    registroviagem: 'Registroviagem'
  };
  if (map[key]) return map[key];
  const partialMatches = [
    ['webconferencia', 'Webconferencia'],
    ['whatsapp', 'Whatsapp'],
    ['telefone', 'Telefone'],
    ['programaderegularidade', 'Programaregularidade'],
    ['registrosiga', 'Registrosiga'],
    ['registrossiga', 'Registrosiga'],
    ['gescon', 'Gescon'],
    ['taxigov', 'Taxigov'],
    ['phplist', 'Phplist'],
    ['sei', 'Sei'],
    ['email', 'Email']
  ];
  const matched = partialMatches.find(([token]) => key.includes(token));
  return matched ? matched[1] : '';
}

function nextRedirectId(rows) {
  const year = currentYear();
  const regex = new RegExp(`^DRD(\\d{6})/${year}$`, 'i');
  const seq = rows.reduce((acc, row) => {
    const id = String(row[REDIRECT_COL.ID_REDIRECT] || '').trim();
    const match = id.match(regex);
    if (!match) return acc;
    return Math.max(acc, Number(match[1]));
  }, 0) + 1;
  return `DRD${String(seq).padStart(6, '0')}/${year}`;
}

function mapRedirectRow(row) {
  return {
    idRedirecionamento: row[REDIRECT_COL.ID_REDIRECT] || '',
    idDemanda: row[REDIRECT_COL.ID_DEMANDA] || '',
    deColaborador: row[REDIRECT_COL.DE_COLABORADOR] || '',
    paraColaborador: row[REDIRECT_COL.PARA_COLABORADOR] || '',
    area: row[REDIRECT_COL.AREA] || '',
    categoria: row[REDIRECT_COL.CATEGORIA] || '',
    descricaoSnapshot: row[REDIRECT_COL.DESCRICAO_SNAPSHOT] || '',
    status: row[REDIRECT_COL.STATUS] || '',
    dataHoraEnvio: row[REDIRECT_COL.DATA_ENVIO] || '',
    dataHoraResposta: row[REDIRECT_COL.DATA_RESPOSTA] || '',
    respondidoPor: row[REDIRECT_COL.RESPONDIDO_POR] || '',
    motivoDevolucao: row[REDIRECT_COL.MOTIVO_DEVOLUCAO] || '',
    tentativa: Number(row[REDIRECT_COL.TENTATIVA] || 1) || 1,
    ativo: equalsIgnoreCase(row[REDIRECT_COL.ATIVO], 'Sim'),
    observacoes: row[REDIRECT_COL.OBSERVACOES] || '',
    rowIndex: Number(row._rowIndex || 0) || null
  };
}

function applyRedirectRowTemplate(overrides = {}) {
  const base = {};
  REDIRECT_HEADERS.forEach((h) => { base[h] = ''; });
  return { ...base, ...overrides };
}

const REDIRECT_COL = {
  ID_REDIRECT: REDIRECT_HEADERS[0],
  ID_DEMANDA: REDIRECT_HEADERS[1],
  DE_COLABORADOR: REDIRECT_HEADERS[2],
  PARA_COLABORADOR: REDIRECT_HEADERS[3],
  AREA: REDIRECT_HEADERS[4],
  CATEGORIA: REDIRECT_HEADERS[5],
  DESCRICAO_SNAPSHOT: REDIRECT_HEADERS[6],
  STATUS: REDIRECT_HEADERS[7],
  DATA_ENVIO: REDIRECT_HEADERS[8],
  DATA_RESPOSTA: REDIRECT_HEADERS[9],
  RESPONDIDO_POR: REDIRECT_HEADERS[10],
  MOTIVO_DEVOLUCAO: REDIRECT_HEADERS[11],
  TENTATIVA: REDIRECT_HEADERS[12],
  ATIVO: REDIRECT_HEADERS[13],
  DATA_CONCLUSAO_FLUXO: REDIRECT_HEADERS[14],
  OBSERVACOES: REDIRECT_HEADERS[15]
};

router.get('/', async (req, res) => {
  try {
    const atendente = normalizeText(req.query.atendente);
    if (!atendente) {
      return res.status(400).json({ error: 'atendente é obrigatório' });
    }

    if (req.user.role === 'colaborador' && !equalsIgnoreCase(atendente, req.user.nome)) {
      return res.status(403).json({ error: 'Colaborador só pode ver as próprias demandas' });
    }

    const { rows } = await readSheet(DEMANDS_SHEET);
    const demandas = sortByMostRecent(rows)
      .filter((row) => equalsIgnoreCase(row['Atribuida para'], atendente))
      .map(mapDemanda);

    return res.json({ demandas });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/redirecionaveis/:id', async (req, res) => {
  try {
    if (req.user.role !== 'colaborador') {
      return res.status(403).json({ error: 'Somente colaborador' });
    }

    const id = normalizeText(req.params.id);
    const rowIndex = Number(req.query?.rowIndex || 0) || null;
    const { rows: demandRows } = await readSheet(DEMANDS_SHEET);
    const item = resolveDemandRow(demandRows, id, rowIndex);
    if (!item) return res.status(404).json({ error: 'Demanda não encontrada' });
    if (!equalsIgnoreCase(item['Atribuida para'], req.user.nome)) {
      return res.status(403).json({ error: 'Apenas responsável atual pode redirecionar' });
    }

    const { rows: profileRows } = await readSheet(PROFILE_SHEET);
    const requester = profileRows.find((row) => equalsIgnoreCase(row.Atendente, req.user.nome));
    const requesterActivities = ACTIVITY_COLUMNS.filter((col) => equalsIgnoreCase(requester?.[col], 'Sim'));

    if (!requesterActivities.length) {
      return res.json({ colaboradores: [] });
    }

    const colaboradores = profileRows
      .filter((row) => equalsIgnoreCase(row.Ativo, 'Sim'))
      .filter((row) => !equalsIgnoreCase(row.Atendente, req.user.nome))
      .map((row) => {
        const sharedActivities = requesterActivities.filter((col) => equalsIgnoreCase(row[col], 'Sim'));
        return {
          row,
          sharedActivities
        };
      })
      .filter(({ sharedActivities }) => sharedActivities.length > 0)
      .map(({ row, sharedActivities }) => ({
        nome: row.Atendente,
        ramal: row.Ramal || '',
        atividade: sharedActivities.join(', ')
      }));

    return res.json({ colaboradores });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/:id/redirecionar', async (req, res) => {
  try {
    if (req.user.role !== 'colaborador') {
      return res.status(403).json({ error: 'Somente colaborador' });
    }

    const id = normalizeText(req.params.id);
    const rowIndex = req.body?.rowIndex;
    const paraColaborador = normalizeText(req.body?.paraColaborador);
    const observacoes = normalizeText(req.body?.observacoes);
    if (!paraColaborador) {
      return res.status(400).json({ error: 'paraColaborador é obrigatório' });
    }

    await writeHeadersIfEmpty(REDIRECT_SHEET, REDIRECT_HEADERS);
    const { rows: demandRows } = await readSheet(DEMANDS_SHEET);
    const item = resolveDemandRow(demandRows, id, rowIndex);
    if (!item) return res.status(404).json({ error: 'Demanda não encontrada' });
    if (isConcluidoValue(item.Finalizado)) {
      return res.status(400).json({ error: 'Demanda concluída não pode ser redirecionada' });
    }
    if (!equalsIgnoreCase(item['Atribuida para'], req.user.nome)) {
      return res.status(403).json({ error: 'Apenas responsável atual pode redirecionar' });
    }
    if (equalsIgnoreCase(paraColaborador, req.user.nome)) {
      return res.status(400).json({ error: 'Não é possível redirecionar para si mesmo' });
    }

    const { rows: profileRows } = await readSheet(PROFILE_SHEET);
    const requester = profileRows.find((row) => equalsIgnoreCase(row.Atendente, req.user.nome));
    const requesterActivities = ACTIVITY_COLUMNS.filter((col) => equalsIgnoreCase(requester?.[col], 'Sim'));
    if (!requesterActivities.length) {
      return res.status(400).json({ error: 'Seu perfil não possui atividades habilitadas para redirecionamento' });
    }
    const target = profileRows.find((row) => equalsIgnoreCase(row.Atendente, paraColaborador) && equalsIgnoreCase(row.Ativo, 'Sim'));
    if (!target) return res.status(404).json({ error: 'Colaborador de destino não encontrado/ativo' });
    const compatibleByUserActivities = requesterActivities.some((col) => equalsIgnoreCase(target[col], 'Sim'));
    if (!compatibleByUserActivities) {
      return res.status(400).json({ error: 'Destino sem atividade compatível com a demanda' });
    }

    const { rows: redirectRows } = await readSheet(REDIRECT_SHEET, { forceRefresh: true });
    const alreadyPending = redirectRows.some((row) =>
      equalsIgnoreCase(row[REDIRECT_COL.ID_DEMANDA], item.ID) &&
      equalsIgnoreCase(row[REDIRECT_COL.ATIVO], 'Sim') &&
      equalsIgnoreCase(row[REDIRECT_COL.STATUS], 'Pendente')
    );
    if (alreadyPending) {
      return res.status(400).json({ error: 'Já existe redirecionamento pendente para essa demanda' });
    }

    const idRedirecionamento = nextRedirectId(redirectRows);
    const row = applyRedirectRowTemplate({
      [REDIRECT_COL.ID_REDIRECT]: idRedirecionamento,
      [REDIRECT_COL.ID_DEMANDA]: item.ID,
      [REDIRECT_COL.DE_COLABORADOR]: req.user.nome,
      [REDIRECT_COL.PARA_COLABORADOR]: paraColaborador,
      [REDIRECT_COL.AREA]: item.Assunto || '',
      [REDIRECT_COL.CATEGORIA]: item.Categoria || '',
      [REDIRECT_COL.DESCRICAO_SNAPSHOT]: item['Descrição'] || '',
      [REDIRECT_COL.STATUS]: 'Pendente',
      [REDIRECT_COL.DATA_ENVIO]: toBrDateTime(),
      [REDIRECT_COL.DATA_RESPOSTA]: '',
      [REDIRECT_COL.RESPONDIDO_POR]: '',
      [REDIRECT_COL.MOTIVO_DEVOLUCAO]: '',
      [REDIRECT_COL.TENTATIVA]: '1',
      [REDIRECT_COL.ATIVO]: 'Sim',
      [REDIRECT_COL.DATA_CONCLUSAO_FLUXO]: '',
      [REDIRECT_COL.OBSERVACOES]: observacoes
    });

    await appendMappedRow(REDIRECT_SHEET, row, REDIRECT_HEADERS);
    return res.status(201).json({ message: 'Demanda redirecionada', idRedirecionamento });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/redirecionadas/recebidas', async (req, res) => {
  try {
    if (req.user.role !== 'colaborador') {
      return res.status(403).json({ error: 'Somente colaborador' });
    }
    await writeHeadersIfEmpty(REDIRECT_SHEET, REDIRECT_HEADERS);
    const { rows } = await readSheet(REDIRECT_SHEET);
    const registros = rows
      .filter((row) => equalsIgnoreCase(row[REDIRECT_COL.PARA_COLABORADOR], req.user.nome))
      .filter((row) => equalsIgnoreCase(row[REDIRECT_COL.STATUS], 'Pendente'))
      .filter((row) => equalsIgnoreCase(row[REDIRECT_COL.ATIVO], 'Sim'))
      .map(mapRedirectRow);
    return res.json({ registros });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/redirecionadas/enviadas', async (req, res) => {
  try {
    if (req.user.role !== 'colaborador') {
      return res.status(403).json({ error: 'Somente colaborador' });
    }
    await writeHeadersIfEmpty(REDIRECT_SHEET, REDIRECT_HEADERS);
    const { rows } = await readSheet(REDIRECT_SHEET);
    const registros = rows
      .filter((row) => equalsIgnoreCase(row[REDIRECT_COL.DE_COLABORADOR], req.user.nome))
      .filter((row) => equalsIgnoreCase(row[REDIRECT_COL.ATIVO], 'Sim'))
      .filter((row) => {
        const status = normalizeText(row[REDIRECT_COL.STATUS]).toLowerCase();
        return status === 'pendente' || status === 'devolvido';
      })
      .map(mapRedirectRow);
    return res.json({ registros });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/redirecionadas/:id/aceitar', async (req, res) => {
  try {
    if (req.user.role !== 'colaborador') {
      return res.status(403).json({ error: 'Somente colaborador' });
    }
    const redirectId = normalizeText(req.params.id);
    const { rows: redirectRows } = await readSheet(REDIRECT_SHEET);
    const redir = redirectRows.find((row) => equalsIgnoreCase(row[REDIRECT_COL.ID_REDIRECT], redirectId));
    if (!redir) return res.status(404).json({ error: 'Redirecionamento não encontrado' });
    if (!equalsIgnoreCase(redir[REDIRECT_COL.PARA_COLABORADOR], req.user.nome)) {
      return res.status(403).json({ error: 'Apenas destinatário pode aceitar' });
    }
    if (!equalsIgnoreCase(redir[REDIRECT_COL.STATUS], 'Pendente')) {
      return res.status(400).json({ error: 'Redirecionamento não está pendente' });
    }

    const { rows: demandRows } = await readSheet(DEMANDS_SHEET);
    const demand = demandRows.find((row) => equalsIgnoreCase(row.ID, redir[REDIRECT_COL.ID_DEMANDA]));
    if (!demand) return res.status(404).json({ error: 'Demanda original não encontrada' });
    demand['Atribuida para'] = req.user.nome;
    await updateMappedRow(DEMANDS_SHEET, demand._rowIndex, demand);

    redir[REDIRECT_COL.STATUS] = 'Aceito';
    redir[REDIRECT_COL.ATIVO] = 'Não';
    redir[REDIRECT_COL.DATA_RESPOSTA] = toBrDateTime();
    redir[REDIRECT_COL.RESPONDIDO_POR] = req.user.nome;
    redir[REDIRECT_COL.DATA_CONCLUSAO_FLUXO] = toBrDateTime();
    await updateMappedRow(REDIRECT_SHEET, redir._rowIndex, redir);
    return res.json({ message: 'Demanda aceita e atribuída' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/redirecionadas/:id/devolver', async (req, res) => {
  try {
    if (req.user.role !== 'colaborador') {
      return res.status(403).json({ error: 'Somente colaborador' });
    }
    const redirectId = normalizeText(req.params.id);
    const motivo = normalizeText(req.body?.motivoDevolucao);
    const { rows } = await readSheet(REDIRECT_SHEET);
    const redir = rows.find((row) => equalsIgnoreCase(row[REDIRECT_COL.ID_REDIRECT], redirectId));
    if (!redir) return res.status(404).json({ error: 'Redirecionamento não encontrado' });
    if (!equalsIgnoreCase(redir[REDIRECT_COL.PARA_COLABORADOR], req.user.nome)) {
      return res.status(403).json({ error: 'Apenas destinatário pode devolver' });
    }
    if (!equalsIgnoreCase(redir[REDIRECT_COL.STATUS], 'Pendente')) {
      return res.status(400).json({ error: 'Redirecionamento não está pendente' });
    }

    redir[REDIRECT_COL.STATUS] = 'Devolvido';
    redir[REDIRECT_COL.DATA_RESPOSTA] = toBrDateTime();
    redir[REDIRECT_COL.RESPONDIDO_POR] = req.user.nome;
    redir[REDIRECT_COL.MOTIVO_DEVOLUCAO] = motivo;
    redir[REDIRECT_COL.ATIVO] = 'Sim';
    await updateMappedRow(REDIRECT_SHEET, redir._rowIndex, redir);
    return res.json({ message: 'Demanda devolvida ao remetente' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/redirecionadas/:id/aceitar-devolucao', async (req, res) => {
  try {
    if (req.user.role !== 'colaborador') {
      return res.status(403).json({ error: 'Somente colaborador' });
    }
    const redirectId = normalizeText(req.params.id);
    const { rows } = await readSheet(REDIRECT_SHEET);
    const redir = rows.find((row) => equalsIgnoreCase(row[REDIRECT_COL.ID_REDIRECT], redirectId));
    if (!redir) return res.status(404).json({ error: 'Redirecionamento não encontrado' });
    if (!equalsIgnoreCase(redir[REDIRECT_COL.DE_COLABORADOR], req.user.nome)) {
      return res.status(403).json({ error: 'Apenas remetente pode aceitar devolução' });
    }
    if (!equalsIgnoreCase(redir[REDIRECT_COL.STATUS], 'Devolvido')) {
      return res.status(400).json({ error: 'Redirecionamento não está devolvido' });
    }

    redir[REDIRECT_COL.STATUS] = 'Devolução aceita';
    redir[REDIRECT_COL.ATIVO] = 'Não';
    redir[REDIRECT_COL.DATA_CONCLUSAO_FLUXO] = toBrDateTime();
    await updateMappedRow(REDIRECT_SHEET, redir._rowIndex, redir);
    return res.json({ message: 'Devolução aceita' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/redirecionadas/:id/recusar-devolucao', async (req, res) => {
  try {
    if (req.user.role !== 'colaborador') {
      return res.status(403).json({ error: 'Somente colaborador' });
    }
    const redirectId = normalizeText(req.params.id);
    const { rows } = await readSheet(REDIRECT_SHEET);
    const redir = rows.find((row) => equalsIgnoreCase(row[REDIRECT_COL.ID_REDIRECT], redirectId));
    if (!redir) return res.status(404).json({ error: 'Redirecionamento não encontrado' });
    if (!equalsIgnoreCase(redir[REDIRECT_COL.DE_COLABORADOR], req.user.nome)) {
      return res.status(403).json({ error: 'Apenas remetente pode recusar devolução' });
    }
    if (!equalsIgnoreCase(redir[REDIRECT_COL.STATUS], 'Devolvido')) {
      return res.status(400).json({ error: 'Redirecionamento não está devolvido' });
    }

    redir[REDIRECT_COL.STATUS] = 'Pendente';
    redir[REDIRECT_COL.DATA_ENVIO] = toBrDateTime();
    redir[REDIRECT_COL.DATA_RESPOSTA] = '';
    redir[REDIRECT_COL.RESPONDIDO_POR] = '';
    redir[REDIRECT_COL.MOTIVO_DEVOLUCAO] = '';
    redir[REDIRECT_COL.TENTATIVA] = String((Number(redir[REDIRECT_COL.TENTATIVA] || 1) || 1) + 1);
    redir[REDIRECT_COL.ATIVO] = 'Sim';
    redir[REDIRECT_COL.OBSERVACOES] = normalizeText(redir[REDIRECT_COL.OBSERVACOES]) || 'Reenviado após recusa de devolução';
    await updateMappedRow(REDIRECT_SHEET, redir._rowIndex, redir);
    return res.json({ message: 'Devolução recusada e demanda reenviada' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/:id/status', async (req, res) => {
  try {
    const id = normalizeText(req.params.id);
    const rowIndex = req.body?.rowIndex;
    const statusInput = normalizeText(req.body?.status);
    const medidasAdotadas = normalizeText(req.body?.medidasAdotadas);
    const respostaFinal = normalizeText(req.body?.respostaFinal);

    if (![STATUS.NAO_INICIADA, STATUS.EM_ANDAMENTO, STATUS.CONCLUIDO].includes(statusInput)) {
      return res.status(400).json({ error: 'Status inválido' });
    }

    const { rows } = await readSheet(DEMANDS_SHEET);
    const item = resolveDemandRow(rows, id, rowIndex);
    if (!item) {
      return res.status(404).json({ error: 'Demanda não encontrada' });
    }

    const dono = normalizeText(item['Atribuida para']);
    if (req.user.role === 'colaborador' && !equalsIgnoreCase(dono, req.user.nome)) {
      return res.status(403).json({ error: 'Acesso negado para esta demanda' });
    }

    if (statusInput === STATUS.CONCLUIDO) {
      const isReopened = Number(item['Demanda reaberta qtd'] || 0) >= 1;
      if (!isReopened && !medidasAdotadas) {
        return res.status(400).json({ error: 'Medidas adotadas é obrigatório para concluir' });
      }
      if (isReopened && !respostaFinal) {
        return res.status(400).json({ error: 'Resposta final é obrigatória para demanda reaberta' });
      }

      if (!isReopened || medidasAdotadas) {
        item['Medidas adotadas'] = medidasAdotadas;
      }
      if (isReopened) {
        item['Resposta final'] = respostaFinal;
      } else {
        item['Resposta final'] = '';
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
      'Resposta final': '',
      Origem: 'whatsapp'
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
    const pendentes = sortByMostRecent(rows).filter(isSigaQueueItem).map(mapDemanda);
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
    const rowIndex = req.body?.rowIndex;
    const { rows } = await readSheet(DEMANDS_SHEET);
    const item = resolveDemandRow(rows, id, rowIndex);
    if (!item) {
      return res.status(404).json({ error: 'Registro não encontrado' });
    }
    if (!isSigaQueueItem(item)) {
      return res.status(400).json({ error: 'Este item não pertence à fila de Registro SIGA' });
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
