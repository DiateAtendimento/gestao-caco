const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const {
  PROFILE_SHEET,
  DEMANDS_SHEET,
  DEMANDS_HEADERS,
  WEBCONF_SHEET,
  WEBCONF_HEADERS
} = require('../config/constants');
const {
  readSheet,
  appendMappedRow,
  writeHeadersIfEmpty
} = require('../services/sheetsService');
const { ensureDemandsMetaColumn, demandsRowTemplate } = require('../services/demandService');
const { normalizeText, equalsIgnoreCase } = require('../utils/text');
const { toBrDate, currentYear } = require('../utils/datetime');

const router = express.Router();
router.use(authMiddleware);

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function parseParticipants(input) {
  if (!Array.isArray(input)) return [];
  return input.map((item) => ({
    nome: normalizeText(item?.nome),
    cpf: onlyDigits(item?.cpf),
    municipio: normalizeText(item?.municipio),
    uf: normalizeText(item?.uf).toUpperCase(),
    descricao: normalizeText(item?.descricao)
  }));
}

function participantBlock(p, index) {
  return [
    `Participante ${index + 1}`,
    `Nome: ${p.nome || '-'}`,
    `CPF: ${p.cpf || '-'}`,
    `Município: ${p.municipio || '-'}`,
    `UF: ${p.uf || '-'}`,
    `Descrição: ${p.descricao || '-'}`
  ].join('\n');
}

function participantDemandDescription(p) {
  return [
    `Nome: ${p.nome || '-'}`,
    `CPF: ${p.cpf || '-'}`,
    `Município: ${p.municipio || '-'}`,
    `UF: ${p.uf || '-'}`,
    `Descrição: ${p.descricao || '-'}`
  ].join('\n');
}

function nextSequenceByPrefix(rows, prefix) {
  const year = currentYear();
  const regex = new RegExp(`^${prefix}(\\d{6})/${year}$`, 'i');
  return rows.reduce((acc, row) => {
    const id = String(row.ID || '').trim();
    const match = id.match(regex);
    if (!match) return acc;
    return Math.max(acc, Number(match[1]));
  }, 0);
}

async function hasWebconferencePermission(nome) {
  const { rows } = await readSheet(PROFILE_SHEET);
  const user = rows.find((row) => equalsIgnoreCase(row.Atendente, nome));
  return !!(user && equalsIgnoreCase(user.Webconferencia, 'Sim'));
}

router.get('/registros', async (req, res) => {
  try {
    if (!(await hasWebconferencePermission(req.user.nome))) {
      return res.status(403).json({ error: 'Usuário sem permissão de Webconferencia' });
    }

    await writeHeadersIfEmpty(WEBCONF_SHEET, WEBCONF_HEADERS);
    const { rows } = await readSheet(WEBCONF_SHEET);

    const registros = rows.map((row) => ({
      id: row.ID,
      qualWebconferencia: row['Qual a Webconferencia'] || '',
      data: row.Data || '',
      horario: row['Horário'] || '',
      atendente: row.Atendente || '',
      enteNaoCompareceu: row['Ente não compareceu ao agendamento'] || '',
      quantidadeAtendida: Number(row['Quantidade atendida'] || 0),
      participantes: row.Participantes || ''
    }));

    return res.json({ registros });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/registros', async (req, res) => {
  try {
    if (!(await hasWebconferencePermission(req.user.nome))) {
      return res.status(403).json({ error: 'Usuário sem permissão de Webconferencia' });
    }

    await writeHeadersIfEmpty(WEBCONF_SHEET, WEBCONF_HEADERS);
    await writeHeadersIfEmpty(DEMANDS_SHEET, DEMANDS_HEADERS);
    await ensureDemandsMetaColumn();

    const qualWebconferencia = normalizeText(req.body?.qualWebconferencia);
    const data = normalizeText(req.body?.data) || toBrDate();
    const horario = normalizeText(req.body?.horario);
    const enteNaoCompareceu = normalizeText(req.body?.enteNaoCompareceu);
    const participants = parseParticipants(req.body?.participants);

    const webRowsFresh = await readSheet(WEBCONF_SHEET, { forceRefresh: true });
    const demandsRowsFresh = await readSheet(DEMANDS_SHEET, { forceRefresh: true });

    const nextWebSeq = nextSequenceByPrefix(webRowsFresh.rows, 'RWC') + 1;
    const webId = `RWC${String(nextWebSeq).padStart(6, '0')}/${currentYear()}`;

    const participantesTexto = participants.length
      ? participants.map((p, index) => participantBlock(p, index)).join('\n\n--------------------\n\n')
      : '';

    await appendMappedRow(WEBCONF_SHEET, {
      ID: webId,
      'Qual a Webconferencia': qualWebconferencia,
      Data: data,
      'Horário': horario,
      Atendente: req.user.nome,
      'Ente não compareceu ao agendamento': enteNaoCompareceu,
      'Quantidade atendida': String(participants.length),
      Participantes: participantesTexto
    }, WEBCONF_HEADERS);

    let demandSeq = nextSequenceByPrefix(demandsRowsFresh.rows, 'WBC');
    const createdDemandIds = [];

    for (const participant of participants) {
      demandSeq += 1;
      const demandId = `WBC${String(demandSeq).padStart(6, '0')}/${currentYear()}`;
      const row = demandsRowTemplate({
        ID: demandId,
        Assunto: qualWebconferencia,
        'Descrição': participantDemandDescription(participant),
        'Data do Registro': data,
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
        Origem: 'webconferencia'
      });

      await appendMappedRow(DEMANDS_SHEET, row, DEMANDS_HEADERS);
      createdDemandIds.push(demandId);
    }

    return res.status(201).json({
      message: 'Registro de webconferência salvo',
      registroId: webId,
      demandasGeradas: createdDemandIds
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
