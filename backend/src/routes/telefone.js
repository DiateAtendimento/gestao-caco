const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const {
  PROFILE_SHEET,
  DEMANDS_SHEET,
  DEMANDS_HEADERS,
  TELEFONE_SHEET,
  TELEFONE_HEADERS,
  COORDENACOES_SHEET
} = require('../config/constants');
const { readSheet, writeHeadersIfEmpty, appendMappedRow } = require('../services/sheetsService');
const { ensureDemandsMetaColumn, demandsRowTemplate } = require('../services/demandService');
const { normalizeText, equalsIgnoreCase } = require('../utils/text');
const { toBrDate, currentYear } = require('../utils/datetime');

const router = express.Router();
router.use(authMiddleware);


function normalizeComparableText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function splitNames(rawNames) {
  return String(rawNames || '')
    .split(/[\n,;|/]+/g)
    .map((name) => normalizeText(name))
    .filter(Boolean);
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

function normalizeTransferOptions(rows) {
  const grouped = new Map();
  rows.forEach((row) => {
    const sigla = normalizeText(row.Sigla || row.sigla || '');
    const nomes = splitNames(row.Nomes || row.nomes || '');
    if (!sigla || !nomes.length) return;
    if (!grouped.has(sigla)) grouped.set(sigla, new Set());
    const bucket = grouped.get(sigla);
    nomes.forEach((nome) => bucket.add(nome));
  });

  const groups = Array.from(grouped.entries()).map(([sigla, namesSet]) => ({
    sigla,
    nomes: Array.from(namesSet).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }));

  const flat = groups.flatMap((group) => group.nomes.map((nome) => ({
    nome,
    sigla: group.sigla,
    nameKey: normalizeComparableText(nome)
  })));

  return { groups, flat };
}

function resolveSiglaByName(flat, transferidoPara) {
  const key = normalizeComparableText(transferidoPara);
  const found = flat.find((item) => item.nameKey === key);
  return found ? found.sigla : '';
}

function buildDetalhamento({
  assunto,
  descricao,
  dataRegistro,
  atendente,
  transferidoPara,
  coordenacao
}) {
  return [
    `Assunto: ${assunto || '-'}`,
    `Descrição: ${descricao || '-'}`,
    `Data do Registro: ${dataRegistro || '-'}`,
    `Atendente: ${atendente || '-'}`,
    `Transferido para: ${transferidoPara || '-'}`,
    `Coordenacao: ${coordenacao || '-'}`
  ].join('\n');
}

async function hasTelefonePermission(nome) {
  const { rows } = await readSheet(PROFILE_SHEET);
  const user = rows.find((row) => equalsIgnoreCase(row.Atendente, nome));
  return !!(
    user
    && (
      equalsIgnoreCase(user.Telefone, 'Sim')
      || equalsIgnoreCase(user['Registro Telefone'], 'Sim')
      || equalsIgnoreCase(user['Registro de Telefone'], 'Sim')
    )
  );
}

router.get('/transferencias', async (req, res) => {
  try {
    if (!(await hasTelefonePermission(req.user.nome))) {
      return res.status(403).json({ error: 'Usuário sem permissão de Telefone' });
    }
    const { rows } = await readSheet(COORDENACOES_SHEET);
    const normalized = normalizeTransferOptions(rows);
    return res.json({ grupos: normalized.groups });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/registros', async (req, res) => {
  try {
    if (!(await hasTelefonePermission(req.user.nome))) {
      return res.status(403).json({ error: 'Usuário sem permissão de Telefone' });
    }
    await writeHeadersIfEmpty(TELEFONE_SHEET, TELEFONE_HEADERS);
    const { rows } = await readSheet(TELEFONE_SHEET);
    const registros = rows
      .map((row) => ({
        id: row.ID || '',
        assunto: row.Assunto || '',
        descricao: row['Descrição'] || '',
        dataRegistro: row['Data do Registro'] || '',
        atendente: row.Atendente || '',
        transferidoPara: row['Transferido para'] || '',
        coordenacao: row.Coordenacao || row['Coordenação'] || '',
        detalhamento: row.Detalhamento || ''
      }))
      .sort((a, b) => String(b.id || '').localeCompare(String(a.id || ''), 'pt-BR'));
    return res.json({ registros });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/registros', async (req, res) => {
  try {
    if (!(await hasTelefonePermission(req.user.nome))) {
      return res.status(403).json({ error: 'Usuário sem permissão de Telefone' });
    }

    await writeHeadersIfEmpty(TELEFONE_SHEET, TELEFONE_HEADERS);
    await writeHeadersIfEmpty(DEMANDS_SHEET, DEMANDS_HEADERS);
    await ensureDemandsMetaColumn();

    const assunto = normalizeText(req.body?.assunto);
    const descricao = normalizeText(req.body?.descricao);
    const dataRegistro = normalizeText(req.body?.dataRegistro) || toBrDate();
    const transferidoPara = normalizeText(req.body?.transferidoPara);

    if (!assunto) {
      return res.status(400).json({ error: 'Assunto é obrigatório' });
    }

    const { rows: coordRows } = await readSheet(COORDENACOES_SHEET);
    const normalized = normalizeTransferOptions(coordRows);
    const coordenacao = resolveSiglaByName(normalized.flat, transferidoPara);

    const { rows: telefoneRowsFresh } = await readSheet(TELEFONE_SHEET, { forceRefresh: true });
    const nextSeq = nextSequenceByPrefix(telefoneRowsFresh, 'TEL') + 1;
    const telefoneId = `TEL${String(nextSeq).padStart(6, '0')}/${currentYear()}`;

    const detalhamento = buildDetalhamento({
      assunto,
      descricao,
      dataRegistro,
      atendente: req.user.nome,
      transferidoPara,
      coordenacao
    });

    await appendMappedRow(TELEFONE_SHEET, {
      ID: telefoneId,
      Assunto: assunto,
      'Descrição': descricao,
      'DescriÃ§Ã£o': descricao,
      'Data do Registro': dataRegistro,
      Atendente: req.user.nome,
      'Transferido para': transferidoPara,
      Coordenacao: coordenacao,
      Coordenação: coordenacao,
      Detalhamento: detalhamento
    }, TELEFONE_HEADERS);

    const demandRow = demandsRowTemplate({
      ID: telefoneId,
      Assunto: assunto,
      'Descrição': descricao,
      'DescriÃ§Ã£o': descricao,
      'Data do Registro': dataRegistro,
      Finalizado: '',
      'Atribuida para': '',
      'Registrador por': req.user.nome,
      'Registrado por': req.user.nome,
      Meta: '0.5',
      'Meta registro siga': '0.5',
      Categoria: 'Baixo',
      'Finalizado por': '',
      'Medidas adotadas': '',
      'Demanda reaberta qtd': '0',
      'Motivo reabertura': '',
      'Resposta final': '',
      Origem: 'TELEFONE'
    });

    await appendMappedRow(DEMANDS_SHEET, demandRow, DEMANDS_HEADERS);
    return res.status(201).json({ message: 'Registro de telefone salvo', id: telefoneId });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
