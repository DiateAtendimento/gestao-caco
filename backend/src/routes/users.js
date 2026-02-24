const express = require('express');
const { PROFILE_SHEET, PROFILE_HEADERS, ACTIVITY_COLUMNS } = require('../config/constants');
const { readSheet, appendMappedRow, updateMappedRow, writeHeadersIfEmpty } = require('../services/sheetsService');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { equalsIgnoreCase, normalizeText } = require('../utils/text');

const router = express.Router();
router.use(authMiddleware, requireRole('admin'));

function detectGender(name) {
  const lower = normalizeText(name).toLowerCase();
  if (!lower) return 'masculino';
  if (lower.endsWith('a')) return 'feminino';
  return 'masculino';
}

router.get('/', async (_req, res) => {
  try {
    await writeHeadersIfEmpty(PROFILE_SHEET, PROFILE_HEADERS);
    const { rows } = await readSheet(PROFILE_SHEET);
    const users = rows
      .filter((row) => row.Ativo === 'Sim' && normalizeText(row.Role).toLowerCase() === 'colaborador')
      .map((row) => ({
        nome: row.Atendente,
        ramal: row.Ramal,
        ativo: row.Ativo,
        role: row.Role,
        genero: row.Genero || detectGender(row.Atendente),
        atividades: ACTIVITY_COLUMNS.reduce((acc, key) => {
          acc[key] = row[key] || 'Não';
          return acc;
        }, {})
      }));

    return res.json({ users });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const nome = normalizeText(req.body?.nome);
    const ramal = normalizeText(req.body?.ramal);
    const genero = normalizeText(req.body?.genero).toLowerCase();

    if (!nome || !ramal) {
      return res.status(400).json({ error: 'Nome e ramal são obrigatórios' });
    }

    if (genero && genero !== 'masculino' && genero !== 'feminino') {
      return res.status(400).json({ error: 'Genero inválido' });
    }

    await writeHeadersIfEmpty(PROFILE_SHEET, PROFILE_HEADERS);
    const { rows } = await readSheet(PROFILE_SHEET);
    const exists = rows.find((row) => equalsIgnoreCase(row.Atendente, nome));
    if (exists && exists.Ativo === 'Sim') {
      return res.status(409).json({ error: 'Colaborador já existe e está ativo' });
    }

    const payload = PROFILE_HEADERS.reduce((acc, header) => {
      acc[header] = '';
      return acc;
    }, {});

    payload.Atendente = nome;
    payload.Ramal = ramal;
    payload.Ativo = 'Sim';
    payload.Role = 'colaborador';
    ACTIVITY_COLUMNS.forEach((activity) => {
      payload[activity] = 'Não';
    });

    await appendMappedRow(PROFILE_SHEET, payload, PROFILE_HEADERS);
    return res.status(201).json({ message: 'Colaborador criado' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.put('/:nome/atividades', async (req, res) => {
  try {
    const nome = normalizeText(req.params.nome);
    const atividade = normalizeText(req.body?.atividade);

    if (!ACTIVITY_COLUMNS.includes(atividade)) {
      return res.status(400).json({ error: 'Atividade inválida' });
    }

    const { rows } = await readSheet(PROFILE_SHEET);
    const user = rows.find((row) => equalsIgnoreCase(row.Atendente, nome) && row.Ativo === 'Sim');
    if (!user) {
      return res.status(404).json({ error: 'Colaborador não encontrado' });
    }

    const next = user[atividade] === 'Sim' ? 'Não' : 'Sim';
    user[atividade] = next;
    await updateMappedRow(PROFILE_SHEET, user._rowIndex, user);

    return res.json({ atividade, valor: next });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.delete('/:nome', async (req, res) => {
  try {
    const nome = normalizeText(req.params.nome);
    const { rows } = await readSheet(PROFILE_SHEET);
    const user = rows.find((row) => equalsIgnoreCase(row.Atendente, nome) && row.Ativo === 'Sim');
    if (!user) {
      return res.status(404).json({ error: 'Colaborador não encontrado' });
    }

    user.Ativo = 'Não';
    await updateMappedRow(PROFILE_SHEET, user._rowIndex, user);

    return res.json({ message: 'Colaborador desativado' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
