const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const {
  PROFILE_SHEET,
  DEMANDS_SHEET,
  DEMANDS_HEADERS,
  WEBCONF_SHEET,
  WEBCONF_HEADERS,
  DAYS_WEBCONF_SHEET
} = require('../config/constants');
const {
  readSheet,
  readSheetValues,
  appendMappedRow,
  writeHeadersIfEmpty,
  updateMappedRowsBatch
} = require('../services/sheetsService');
const { ensureDemandsMetaColumn, demandsRowTemplate } = require('../services/demandService');
const { normalizeText, equalsIgnoreCase } = require('../utils/text');
const { toBrDate, currentYear } = require('../utils/datetime');
const { publishDemandasUpdate } = require('../services/eventBus');

const router = express.Router();
router.use(authMiddleware);
const permissionCache = new Map();
const PERMISSION_TTL_MS = 60 * 1000;

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function parseParticipants(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => ({
      nome: normalizeText(item?.nome),
      cpf: onlyDigits(item?.cpf),
      municipio: normalizeText(item?.municipio),
      uf: normalizeText(item?.uf).toUpperCase(),
      descricao: normalizeText(item?.descricao)
    }))
    .filter((p) => (p.nome || p.cpf || p.municipio || p.uf || p.descricao))
    .filter((p) => !p.cpf || p.cpf.length === 11);
}

function invertYesNo(value) {
  if (equalsIgnoreCase(value, 'Sim')) return 'Não';
  if (equalsIgnoreCase(value, 'Não')) return 'Sim';
  return '';
}

function countParticipantsFromText(participantesTexto) {
  const text = String(participantesTexto || '');
  if (!text.trim()) return 0;
  const matches = text.match(/Participante\s+\d+/gi);
  return matches ? matches.length : 0;
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

function parseBrDate(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]) - 1;
  const year = Number(match[3]);
  const parsed = new Date(year, month, day, 0, 0, 0, 0);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function getFirstFilled(row, keys) {
  for (const key of keys) {
    const value = String(row?.[key] || '').trim();
    if (value) return value;
  }
  return '';
}

function getByHeaderTokens(row, requiredTokens) {
  const tokens = requiredTokens.map((t) => normalizeHeaderLabel(t));
  const entries = Object.entries(row || {});
  for (const [header, rawValue] of entries) {
    if (header === '_rowIndex') continue;
    const normalized = normalizeHeaderLabel(header);
    const hasAll = tokens.every((token) => normalized.includes(token));
    if (!hasAll) continue;
    const value = String(rawValue || '').trim();
    if (value) return value;
  }
  return '';
}

function simpleHashBase36(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36).toUpperCase();
}

function legacyWebconfId(row) {
  const seed = [
    row._rowIndex,
    row.Data,
    row.Atendente,
    row['Qual a Webconferencia'],
    row['Qual a Webconferência'],
    row['Qual Webconferência']
  ].join('|');
  const hash = simpleHashBase36(seed).padStart(6, '0').slice(0, 6);
  const rowPart = String(row._rowIndex || 0).padStart(4, '0');
  return `LG${hash}${rowPart}`;
}

function normalizeHeaderLabel(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[^a-zA-Z0-9 ]+/g, '')
    .trim()
    .toLowerCase();
}

function setByHeaderAliases(targetRow, existingHeaders, aliases, value) {
  const aliasSet = new Set(aliases.map((alias) => normalizeHeaderLabel(alias)));
  let matched = false;
  (existingHeaders || []).forEach((header) => {
    if (aliasSet.has(normalizeHeaderLabel(header))) {
      targetRow[header] = value;
      matched = true;
    }
  });
  if (!matched && aliases[0]) {
    targetRow[aliases[0]] = value;
  }
}

function setByHeaderTokenIncludes(targetRow, existingHeaders, requiredTokens, value) {
  const tokens = requiredTokens.map((t) => normalizeHeaderLabel(t));
  let matched = false;
  (existingHeaders || []).forEach((header) => {
    const normalized = normalizeHeaderLabel(header);
    const hasAll = tokens.every((token) => normalized.includes(token));
    if (hasAll) {
      targetRow[header] = value;
      matched = true;
    }
  });
  return matched;
}

function normalizeComparableText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function currentWeekdayConfig() {
  const weekday = new Date().getDay();
  if (weekday === 1) return { label: 'Segunda-Feira', assuntoCol: 0, inicioCol: 1 };
  if (weekday === 2) return { label: 'Terça-Feira', assuntoCol: 3, inicioCol: 4 };
  if (weekday === 3) return { label: 'Quarta-Feira', assuntoCol: 6, inicioCol: 7 };
  if (weekday === 4) return { label: 'Quinta-Feira', assuntoCol: 9, inicioCol: 10 };
  if (weekday === 5) return { label: 'Sexta-Feira', assuntoCol: 12, inicioCol: 13 };
  return { label: 'Segunda-Feira', assuntoCol: 0, inicioCol: 1 };
}

function parseTimeToMinutes(text) {
  const match = String(text || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return Number.MAX_SAFE_INTEGER;
  return (hour * 60) + minute;
}

function toBrDateFrom(baseDate, daysAhead) {
  const date = new Date(baseDate);
  date.setDate(date.getDate() + daysAhead);
  return toBrDate(date);
}

function weekdayLabelByJsDay(jsDay) {
  if (jsDay === 1) return 'Segunda-Feira';
  if (jsDay === 2) return 'Terça-Feira';
  if (jsDay === 3) return 'Quarta-Feira';
  if (jsDay === 4) return 'Quinta-Feira';
  if (jsDay === 5) return 'Sexta-Feira';
  return 'Segunda-Feira';
}

async function hasWebconferencePermission(nome) {
  const key = normalizeText(nome).toLowerCase();
  const cached = permissionCache.get(`webconf:${key}`);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }
  const { rows } = await readSheet(PROFILE_SHEET);
  const user = rows.find((row) => equalsIgnoreCase(row.Atendente, nome));
  const value = !!(user && equalsIgnoreCase(user.Webconferencia, 'Sim'));
  permissionCache.set(`webconf:${key}`, { value, expiresAt: now + PERMISSION_TTL_MS });
  return value;
}

router.get('/registros', async (req, res) => {
  try {
    if (!(await hasWebconferencePermission(req.user.nome))) {
      return res.status(403).json({ error: 'Usuário sem permissão de Webconferencia' });
    }

    await writeHeadersIfEmpty(WEBCONF_SHEET, WEBCONF_HEADERS);
    const { rows } = await readSheet(WEBCONF_SHEET);
    const legacyRowsToPersist = [];
    for (const row of rows) {
      const currentId = String(row.ID || '').trim();
      if (currentId) continue;
      const legacyId = legacyWebconfId(row);
      row.ID = legacyId;
      legacyRowsToPersist.push({
        rowIndex: row._rowIndex,
        data: row
      });
    }
    if (legacyRowsToPersist.length) {
      await updateMappedRowsBatch(WEBCONF_SHEET, legacyRowsToPersist);
    }

    const registros = rows
      .map((row) => ({
        enteCompareceu: (
          row['Ente compareceu ao agendamento']
          || row['Ente compareceu']
          || invertYesNo(row['Ente não compareceu ao agendamento'] || row['Ente nao compareceu ao agendamento'])
          || ''
        ),
        id: String(row.ID || '').trim() || legacyWebconfId(row),
        qualWebconferencia: getFirstFilled(row, [
          'Qual a Webconferencia',
          'Qual a Webconferência',
          'Qual Webconferência',
          'Qual Webconferencia',
          'Webconferência',
          'Webconferencia'
        ]) || getByHeaderTokens(row, ['qual', 'webconfer']),
        data: row.Data || '',
        horario: row['Horário'] || row.Horario || '',
        atendente: row.Atendente || '',
        enteNaoCompareceu: row['Ente não compareceu ao agendamento'] || row['Ente nao compareceu ao agendamento'] || '',
        quantidadeAtendida: Number(row['Quantidade atendida'] || 0) || countParticipantsFromText(row.Participantes),
        participantes: row.Participantes || '',
        rowIndex: Number(row._rowIndex || 0) || 0
      }))
      .sort((a, b) => {
        const db = parseBrDate(b.data);
        const da = parseBrDate(a.data);
        if (db && da && db.getTime() !== da.getTime()) return db - da;
        if (db && !da) return -1;
        if (!db && da) return 1;
        return (b.rowIndex || 0) - (a.rowIndex || 0);
      })
      .map(({ rowIndex, ...item }) => item);

    return res.json({ registros });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/agenda', async (req, res) => {
  try {
    if (!(await hasWebconferencePermission(req.user.nome))) {
      return res.status(403).json({ error: 'Usuário sem permissão de Webconferencia' });
    }

    const assunto = normalizeComparableText(req.query?.assunto);
    const now = new Date();
    const currentJsDay = now.getDay();
    const weekdayColumns = [
      { jsDay: 1, assuntoCol: 0, inicioCol: 1 },
      { jsDay: 2, assuntoCol: 3, inicioCol: 4 },
      { jsDay: 3, assuntoCol: 6, inicioCol: 7 },
      { jsDay: 4, assuntoCol: 9, inicioCol: 10 },
      { jsDay: 5, assuntoCol: 12, inicioCol: 13 }
    ];
    const values = await readSheetValues(DAYS_WEBCONF_SHEET, 'A1:O100');
    const rows = values.slice(1);
    const candidates = [];

    weekdayColumns.forEach((cfg) => {
      const daysAhead = (cfg.jsDay - currentJsDay + 7) % 7;
      rows.forEach((row) => {
        const assuntoDia = normalizeComparableText(row[cfg.assuntoCol]);
        const inicio = String(row[cfg.inicioCol] || '').trim();
        if (!inicio) return;
        if (assunto && assuntoDia !== assunto) return;
        candidates.push({
          jsDay: cfg.jsDay,
          daysAhead,
          inicio,
          minutos: parseTimeToMinutes(inicio)
        });
      });
    });

    if (candidates.length) {
      candidates.sort((a, b) => {
        if (a.daysAhead !== b.daysAhead) return a.daysAhead - b.daysAhead;
        return a.minutos - b.minutos;
      });
      const selected = candidates[0];
      return res.json({
        data: toBrDateFrom(now, selected.daysAhead),
        horarioInicio: selected.inicio,
        diaSemana: weekdayLabelByJsDay(selected.jsDay)
      });
    }

    const fallbackDay = currentWeekdayConfig();
    const fallbackRow = rows.find((row) => String(row[fallbackDay.inicioCol] || '').trim());
    const fallbackHorario = fallbackRow ? String(fallbackRow[fallbackDay.inicioCol] || '').trim() : '';
    return res.json({
      data: toBrDate(now),
      horarioInicio: fallbackHorario,
      diaSemana: fallbackDay.label
    });
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
    const { headers: webconfHeaders } = await readSheet(WEBCONF_SHEET);
    await writeHeadersIfEmpty(DEMANDS_SHEET, DEMANDS_HEADERS);
    await ensureDemandsMetaColumn();

    const qualWebconferencia = normalizeText(req.body?.qualWebconferencia);
    const data = normalizeText(req.body?.data) || toBrDate();
    const horario = normalizeText(req.body?.horario);
    const enteCompareceu = normalizeText(req.body?.enteCompareceu)
      || invertYesNo(normalizeText(req.body?.enteNaoCompareceu))
      || '';
    const enteNaoCompareceu = invertYesNo(enteCompareceu);
    const participants = parseParticipants(req.body?.participants);
    const quantidadeAtendida = participants.length;

    const webRowsFresh = await readSheet(WEBCONF_SHEET, { forceRefresh: true });
    const demandsRowsFresh = await readSheet(DEMANDS_SHEET, { forceRefresh: true });

    const nextWebSeq = nextSequenceByPrefix(webRowsFresh.rows, 'RWC') + 1;
    const webId = `RWC${String(nextWebSeq).padStart(6, '0')}/${currentYear()}`;

    const participantesTexto = quantidadeAtendida
      ? participants.map((p, index) => participantBlock(p, index)).join('\n\n--------------------\n\n')
      : '';

    const webconfRow = { ID: webId, Data: data, Atendente: req.user.nome, Participantes: participantesTexto };
    setByHeaderAliases(
      webconfRow,
      webconfHeaders,
      ['Qual a Webconferencia', 'Qual a Webconferência', 'Qual Webconferencia', 'Qual Webconferência'],
      qualWebconferencia
    );
    setByHeaderTokenIncludes(webconfRow, webconfHeaders, ['qual', 'webconfer'], qualWebconferencia);
    setByHeaderAliases(webconfRow, webconfHeaders, ['Horário', 'Horario'], horario);
    setByHeaderAliases(webconfRow, webconfHeaders, ['Ente compareceu ao agendamento', 'Ente compareceu'], enteCompareceu);
    setByHeaderAliases(
      webconfRow,
      webconfHeaders,
      ['Ente não compareceu ao agendamento', 'Ente nao compareceu ao agendamento'],
      enteNaoCompareceu
    );
    setByHeaderAliases(webconfRow, webconfHeaders, ['Quantidade atendida'], String(quantidadeAtendida));

    await appendMappedRow(WEBCONF_SHEET, webconfRow, WEBCONF_HEADERS);

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

    publishDemandasUpdate({
      type: 'registro_webconferencia_criado',
      origem: 'webconferencia',
      registradoPor: req.user.nome,
      demandasGeradas: createdDemandIds
    });

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
