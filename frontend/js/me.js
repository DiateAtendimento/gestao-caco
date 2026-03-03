import { api, requireAuth, clearSession, initThemeIcon } from './auth.js';
import { ACTIVITIES } from './data.js';
import { showLoading, showStatus, mountInlineLottie, showAtribuicaoRecebida, showMessageDialog, promptText } from './feedback.js';
import { attachAvatar } from './avatar.js';

const user = requireAuth('colaborador');
if (!user) throw new Error('Sessão inválida');
initThemeIcon();

const state = {
  profile: null,
  demandas: [],
  sigaRegistros: [],
  webconfRegistros: [],
  webconfDraft: {
    qualWebconferencia: '',
    data: '',
    horario: '',
    enteNaoCompareceu: '',
    participants: []
  }
};

const atividadesEl = document.getElementById('atividades');
const demandasEl = document.getElementById('demandas');
const sigaBodyEl = document.getElementById('registros-siga-body');
const sigaBlockEl = document.getElementById('siga-block');
const webconfBlockEl = document.getElementById('webconf-block');
const webconfBodyEl = document.getElementById('webconf-body');
const modalWebconfWizard = document.getElementById('modal-webconf-wizard');
const modalWebconfParticipantes = document.getElementById('modal-webconf-participantes');
const msgEl = document.getElementById('msg');
const seenDemandasKey = `seenDemandas:${user.nome}`;
const SILENT_REFRESH_MS = 3000;
let refreshInFlight = false;
let webconfStep = 1;
const WHATSAPP_ASSUNTOS = [
  'Atendimento',
  'Atuária',
  'Auditoria',
  'Auditoria - Direta',
  'Benefício',
  'CadPrev - Duvidas',
  'CadPrev - Erro',
  'CadPrev - Liberação de Acesso',
  'Certificação Profissional',
  'CNIS-RPPS',
  'COMPREV - Sistema',
  'COMPREV - Termo de Adesão e Operacionalização',
  'COMPREV/DATAPREV',
  'Contabilidade',
  'Contencioso',
  'CRP - EMERGENCIAL',
  'E-Social',
  'Email',
  'Encaminhamento da legislação',
  'Gescon',
  'Indicador de Situação Previdenciária - ISP',
  'Informações Judiciais - Outros',
  'INSS',
  'Investimentos',
  'Normatização',
  'Outros Assuntos',
  'Pedido de Reunião',
  'Plano de Custeio',
  'Previdência Complementar - SURPC',
  'PRÓ-GESTÃO RPPS',
  'Programa de Regularidade',
  'Pronto - DATAPREV',
  'Prova de Vida',
  'Repasse e Parcelamento - Confessado',
  'Repasse e Parcelamento - PAP',
  'SIG-RPPS',
  'SIPREV',
  'SIRC - DATAPREV'
];

function showMsg(text) {
  msgEl.textContent = text || '';
}

function openModal(el) {
  if (el) el.classList.add('open');
}

function closeModal(el) {
  if (el) el.classList.remove('open');
}

function isEnabled(value) {
  return String(value || '').trim().toLowerCase() === 'sim';
}

async function runAction(actionName, loadingText, successType, successText, fn) {
  const started = performance.now();
  const loading = await showLoading(loadingText);
  console.log(`[Colaborador] ${actionName} iniciado`);

  try {
    const result = await fn();
    console.log(`[Colaborador] ${actionName} concluído em ${Math.round(performance.now() - started)}ms`);
    if (successText) {
      await showStatus(successType, successText);
    }
    return result;
  } catch (error) {
    console.error(`[Colaborador] ${actionName} erro:`, error.message);
    showMsg(error.message);
    await showStatus('erro', `Erro: ${error.message}`);
    throw error;
  } finally {
    loading.close();
  }
}

function renderAtividades() {
  atividadesEl.innerHTML = '';
  atividadesEl.classList.remove('count-1', 'count-2', 'count-3plus');

  if (!state.profile?.atividades?.length) {
    const box = document.createElement('div');
    box.className = 'empty-state-box';
    box.innerHTML = `
      <div id="lottie-sem-atividade"></div>
      <p>Nenhuma atividade vinculada no momento.</p>
    `;
    atividadesEl.appendChild(box);
    mountInlineLottie('lottie-sem-atividade', 'sem_atividade', true);
    return;
  }

  const totalAtividades = state.profile.atividades.length;
  if (totalAtividades === 1) {
    atividadesEl.classList.add('count-1');
  } else if (totalAtividades === 2) {
    atividadesEl.classList.add('count-2');
  } else {
    atividadesEl.classList.add('count-3plus');
  }

  state.profile.atividades.forEach((key) => {
    const activity = ACTIVITIES.find((a) => a.key === key);
    const chip = document.createElement('div');
    chip.className = 'activity-chip';
    chip.innerHTML = `
      <img src="${activity?.icon || 'assets/icons/ti.svg'}" alt="${activity?.label || key}" />
      <div>${activity?.label || key}</div>
    `;
    atividadesEl.appendChild(chip);
  });
}

function renderDemandas() {
  demandasEl.innerHTML = '';
  const abertas = state.demandas.filter((d) => !d.concluido);

  if (!abertas.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td colspan="5">
        <div class="empty-state-table">
          <div id="lottie-sem-atribuicao"></div>
          <p>Nenhuma demanda atribuída para você.</p>
        </div>
      </td>
    `;
    demandasEl.appendChild(tr);
    mountInlineLottie('lottie-sem-atribuicao', 'sem_atribuicao', true);
    return;
  }

  abertas.forEach((d) => {
    const andamentoDot = d.finalizado === 'Em andamento' ? '<span class="status-dot andamento"></span>' : '';
    const categoriaClass = String(d.categoria || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const noteBtn = d.motivoReabertura
      ? `<button class="btn-note" data-note="${d.id}" type="button" title="Motivo da reabertura">🗒</button>`
      : '';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${andamentoDot}${d.id}</td>
      <td>${d.area}</td>
      <td><span class="cat-badge ${categoriaClass}">${d.categoria || '-'}</span></td>
      <td>${d.descricao}</td>
      <td>
        <div class="status-actions">
          ${noteBtn}
          <button class="btn-status andamento" data-start="${d.id}" data-row-index="${d.rowIndex || ''}" type="button">Em andamento</button>
          <button class="btn-status concluido" data-done="${d.id}" data-row-index="${d.rowIndex || ''}" type="button">Concluído</button>
        </div>
      </td>
    `;
    demandasEl.appendChild(tr);
  });

  demandasEl.querySelectorAll('[data-start]').forEach((btn) => {
    btn.addEventListener('click', () => updateStatus(btn.dataset.start, 'Em andamento', btn.dataset.rowIndex));
  });
  demandasEl.querySelectorAll('[data-done]').forEach((btn) => {
    btn.addEventListener('click', () => updateStatus(btn.dataset.done, 'Concluído', btn.dataset.rowIndex));
  });
  demandasEl.querySelectorAll('[data-note]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const demanda = abertas.find((d) => d.id === btn.dataset.note);
      if (!demanda) return;
      await showMessageDialog({
        title: 'Motivo da reabertura',
        message: demanda.motivoReabertura,
        closeLabel: 'Fechar'
      });
    });
  });
}

function renderRegistrosSiga() {
  sigaBodyEl.innerHTML = '';
  if (!isEnabled(state.profile?.flags?.Registrosiga)) {
    sigaBlockEl.classList.add('hidden');
    return;
  }

  sigaBlockEl.classList.remove('hidden');
  if (!state.sigaRegistros.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td colspan="7">
        <div class="empty-state-table">
          <div id="lottie-sem-siga"></div>
          <p>Nenhum registro pendente no SIGA.</p>
        </div>
      </td>
    `;
    sigaBodyEl.appendChild(tr);
    mountInlineLottie('lottie-sem-siga', 'sem_atribuicao', true);
    return;
  }

  state.sigaRegistros.forEach((d, index) => {
    const origem = String(d.origem || '').toLowerCase();
    const origemLabel = origem === 'webconferencia' ? 'Webconferência' : 'WhatsApp';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${d.id}</td>
      <td>${origemLabel}</td>
      <td>${d.area}</td>
      <td>${d.dataRegistro || '-'}</td>
      <td>${d.descricao}</td>
      <td><button class="btn-status concluido" data-siga="${d.id}" data-row-index="${d.rowIndex || ''}" type="button">Registrado</button></td>
    `;
    sigaBodyEl.appendChild(tr);
  });

  sigaBodyEl.querySelectorAll('[data-siga]').forEach((btn) => {
    btn.addEventListener('click', () => registrarSiga(btn.dataset.siga, btn.dataset.rowIndex));
  });
}

function renderWebconfRegistros() {
  if (!webconfBlockEl || !webconfBodyEl) return;
  if (!isEnabled(state.profile?.flags?.Webconferencia)) {
    webconfBlockEl.classList.add('hidden');
    return;
  }

  webconfBlockEl.classList.remove('hidden');
  webconfBodyEl.innerHTML = '';
  if (!state.webconfRegistros.length) {
    webconfBodyEl.innerHTML = '<tr><td colspan=\"8\">Nenhum registro de webconferência encontrado.</td></tr>';
    return;
  }

  state.webconfRegistros.forEach((row) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.id || '-'}</td>
      <td>${row.qualWebconferencia || '-'}</td>
      <td>${row.data || '-'}</td>
      <td>${row.horario || '-'}</td>
      <td>
        <div class=\"webconf-attendente\">
          <img data-webconf-avatar=\"${row.atendente || ''}\" alt=\"${row.atendente || 'Atendente'}\" />
          <span>${row.atendente || '-'}</span>
        </div>
      </td>
      <td>${row.enteNaoCompareceu || '-'}</td>
      <td>${Number(row.quantidadeAtendida || 0)}</td>
      <td><button class=\"btn-soft\" data-webconf-participantes=\"${row.id}\">Ver</button></td>
    `;
    webconfBodyEl.appendChild(tr);
  });

  webconfBodyEl.querySelectorAll('[data-webconf-avatar]').forEach((img) => {
    attachAvatar(img, img.dataset.webconfAvatar || '');
  });

  webconfBodyEl.querySelectorAll('[data-webconf-participantes]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = state.webconfRegistros.find((r) => r.id === btn.dataset.webconfParticipantes);
      document.getElementById('webconf-participantes-preview').textContent = row?.participantes || 'Sem participantes';
      openModal(modalWebconfParticipantes);
    });
  });
}

function resetWebconfDraft() {
  state.webconfDraft = {
    qualWebconferencia: '',
    data: '',
    horario: '',
    enteNaoCompareceu: '',
    participants: []
  };
}

function syncWebconfParticipantTable() {
  const body = document.getElementById('webconf-participantes-body');
  body.innerHTML = '';
  if (!state.webconfDraft.participants.length) {
    body.innerHTML = '<tr><td colspan=\"5\">Nenhum participante adicionado.</td></tr>';
    return;
  }

  state.webconfDraft.participants.forEach((p, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${p.nome || '-'}</td>
      <td>${p.cpf || '-'}</td>
      <td>${p.municipio || '-'}</td>
      <td>${p.uf || '-'}</td>
    `;
    body.appendChild(tr);
  });
}

function setWebconfStep(step) {
  webconfStep = step;
  [1, 2, 3].forEach((n) => {
    const el = document.getElementById(`webconf-step-${n}`);
    if (!el) return;
    el.classList.toggle('hidden', n !== step);
  });
}

function toDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function openWebconfWizard() {
  resetWebconfDraft();
  setWebconfStep(1);
  document.getElementById('webconf-qual').value = '';
  document.getElementById('webconf-data').value = '';
  document.getElementById('webconf-horario').value = '';
  document.getElementById('webconf-atendente').value = user.nome;
  attachAvatar(document.getElementById('webconf-atendente-avatar'), user.nome);
  document.getElementById('webconf-ente').value = '';
  document.getElementById('webconf-p-nome').value = '';
  document.getElementById('webconf-p-cpf').value = '';
  document.getElementById('webconf-p-municipio').value = '';
  document.getElementById('webconf-p-uf').value = '';
  document.getElementById('webconf-p-descricao').value = '';
  const noHistorySuffix = String(Date.now());
  [
    { id: 'webconf-qual', name: `webconf_qual_${noHistorySuffix}` },
    { id: 'webconf-data', name: `webconf_data_${noHistorySuffix}` },
    { id: 'webconf-horario', name: `webconf_horario_${noHistorySuffix}` },
    { id: 'webconf-ente', name: `webconf_ente_${noHistorySuffix}` },
    { id: 'webconf-p-nome', name: `webconf_part_nome_${noHistorySuffix}` },
    { id: 'webconf-p-cpf', name: `webconf_part_cpf_${noHistorySuffix}` },
    { id: 'webconf-p-municipio', name: `webconf_part_municipio_${noHistorySuffix}` },
    { id: 'webconf-p-uf', name: `webconf_part_uf_${noHistorySuffix}` },
    { id: 'webconf-p-descricao', name: `webconf_part_descricao_${noHistorySuffix}` }
  ].forEach(({ id, name }) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.setAttribute('name', name);
    el.setAttribute('autocomplete', 'off');
    el.setAttribute('autocorrect', 'off');
    el.setAttribute('autocapitalize', 'off');
    el.setAttribute('spellcheck', 'false');
  });
  syncWebconfParticipantTable();
  openModal(modalWebconfWizard);
}

async function updateStatus(id, status, rowIndex) {
  const demanda = state.demandas.find((d) => d.id === id);
  const isConcluding = status === 'Concluído';
  const isReopened = Number(demanda?.demandaReabertaQtd || 0) >= 1;
  let medidasAdotadas = '';
  let respostaFinal = '';

  if (isConcluding && !isReopened) {
    const medidas = await promptText({
      title: 'Concluir demanda',
      message: 'Informe as medidas adotadas para concluir:',
      placeholder: 'Descreva as medidas adotadas',
      required: true,
      confirmLabel: 'Confirmar'
    });
    if (medidas === null) return;
    medidasAdotadas = medidas;
  }

  if (isConcluding && isReopened) {
    const resposta = await promptText({
      title: 'Resposta final',
      message: 'Informe a resposta final da demanda reaberta:',
      placeholder: 'Digite a resposta final',
      required: true,
      confirmLabel: 'Confirmar'
    });
    if (resposta === null) return;
    respostaFinal = resposta;
  }

  if (isConcluding && !isReopened && !String(medidasAdotadas).trim()) {
    await showStatus('erro', 'Medidas adotadas é obrigatório para concluir');
    return;
  }
  if (isConcluding && isReopened && !String(respostaFinal).trim()) {
    await showStatus('erro', 'Resposta final é obrigatória para demanda reaberta');
    return;
  }

  try {
    await runAction('atualizar status', 'Atualizando status...', 'atribuido', 'Status atualizado', async () => {
      await api(`/api/demandas/${encodeURIComponent(id)}/status`, {
        method: 'POST',
        body: JSON.stringify({
          status,
          rowIndex: Number(rowIndex || 0) || null,
          medidasAdotadas: String(medidasAdotadas).trim(),
          respostaFinal: String(respostaFinal).trim()
        })
      });
      await loadData();
      renderDemandas();
    });
  } catch (_e) {}
}

async function registrarSiga(id, rowIndex) {
  try {
    await runAction('registrar no SIGA', 'Finalizando registro...', 'salvo', 'Registro finalizado', async () => {
      await api(`/api/demandas/registros-siga/${encodeURIComponent(id)}/registrado`, {
        method: 'POST',
        body: JSON.stringify({ rowIndex: Number(rowIndex || 0) || null })
      });
      await loadData();
      renderRegistrosSiga();
    });
  } catch (_e) {}
}

function setupWhatsapp() {
  const block = document.getElementById('whatsapp-block');
  if (!isEnabled(state.profile?.flags?.Whatsapp)) {
    block.classList.add('hidden');
    return;
  }

  block.classList.remove('hidden');
  const wppForm = document.getElementById('form-whatsapp');
  if (wppForm) wppForm.reset();
  const assuntoSelect = document.getElementById('wpp-assunto');
  const descricaoInput = document.getElementById('wpp-descricao');
  const noHistorySuffix = String(Date.now());
  if (assuntoSelect) {
    assuntoSelect.setAttribute('name', `wpp_assunto_${noHistorySuffix}`);
    assuntoSelect.setAttribute('autocomplete', 'off');
  }
  if (descricaoInput) {
    descricaoInput.setAttribute('name', `wpp_descricao_${noHistorySuffix}`);
    descricaoInput.setAttribute('autocomplete', 'off');
    descricaoInput.setAttribute('autocorrect', 'off');
    descricaoInput.setAttribute('autocapitalize', 'off');
    descricaoInput.setAttribute('spellcheck', 'false');
  }
  if (assuntoSelect && !assuntoSelect.dataset.ready) {
    assuntoSelect.innerHTML = `
      <option value="">Selecione o assunto</option>
      ${WHATSAPP_ASSUNTOS.map((item) => `<option value="${item}">${item}</option>`).join('')}
    `;
    assuntoSelect.dataset.ready = 'true';
  }

  document.getElementById('form-whatsapp').addEventListener('submit', async (event) => {
    event.preventDefault();

    try {
      await runAction('registrar whatsapp', 'Salvando registro...', 'salvo', 'Registro WhatsApp salvo', async () => {
        await api('/api/demandas/registro-whatsapp', {
          method: 'POST',
          body: JSON.stringify({
            assunto: document.getElementById('wpp-assunto').value.trim(),
            descricao: document.getElementById('wpp-descricao').value.trim()
          })
        });
        event.target.reset();
      });
    } catch (_e) {}
  });
}

function setupWebconfWizard() {
  const openBtn = document.getElementById('btn-open-webconf-modal');
  const closeBtn = document.getElementById('btn-close-webconf-modal');
  const closeParticipantesBtn = document.getElementById('btn-close-webconf-participantes');
  if (!openBtn || !closeBtn || !closeParticipantesBtn) return;

  openBtn.addEventListener('click', () => openWebconfWizard());
  closeBtn.addEventListener('click', () => closeModal(modalWebconfWizard));
  closeParticipantesBtn.addEventListener('click', () => closeModal(modalWebconfParticipantes));
  modalWebconfWizard.addEventListener('click', (event) => {
    if (event.target === modalWebconfWizard) closeModal(modalWebconfWizard);
  });
  modalWebconfParticipantes.addEventListener('click', (event) => {
    if (event.target === modalWebconfParticipantes) closeModal(modalWebconfParticipantes);
  });

  document.getElementById('webconf-next-1').addEventListener('click', () => {
    state.webconfDraft.qualWebconferencia = document.getElementById('webconf-qual').value.trim();
    setWebconfStep(2);
  });
  document.getElementById('webconf-back-2').addEventListener('click', () => setWebconfStep(1));
  document.getElementById('webconf-next-2').addEventListener('click', () => {
    state.webconfDraft.data = document.getElementById('webconf-data').value.trim();
    state.webconfDraft.horario = document.getElementById('webconf-horario').value.trim();
    state.webconfDraft.enteNaoCompareceu = document.getElementById('webconf-ente').value.trim();
    setWebconfStep(3);
  });
  document.getElementById('webconf-back-3').addEventListener('click', () => setWebconfStep(2));

  document.getElementById('webconf-add-participante').addEventListener('click', () => {
    state.webconfDraft.participants.push({
      nome: document.getElementById('webconf-p-nome').value.trim(),
      cpf: toDigits(document.getElementById('webconf-p-cpf').value),
      municipio: document.getElementById('webconf-p-municipio').value.trim(),
      uf: document.getElementById('webconf-p-uf').value.trim().toUpperCase(),
      descricao: document.getElementById('webconf-p-descricao').value.trim()
    });
    document.getElementById('webconf-p-nome').value = '';
    document.getElementById('webconf-p-cpf').value = '';
    document.getElementById('webconf-p-municipio').value = '';
    document.getElementById('webconf-p-uf').value = '';
    document.getElementById('webconf-p-descricao').value = '';
    syncWebconfParticipantTable();
  });

  document.getElementById('webconf-save').addEventListener('click', async () => {
    state.webconfDraft.qualWebconferencia = document.getElementById('webconf-qual').value.trim();
    state.webconfDraft.data = document.getElementById('webconf-data').value.trim();
    state.webconfDraft.horario = document.getElementById('webconf-horario').value.trim();
    state.webconfDraft.enteNaoCompareceu = document.getElementById('webconf-ente').value.trim();

    try {
      await runAction('registrar webconferência', 'Salvando registro...', 'salvo', 'Registro de webconferência salvo', async () => {
        await api('/api/webconferencia/registros', {
          method: 'POST',
          body: JSON.stringify({
            qualWebconferencia: state.webconfDraft.qualWebconferencia,
            data: state.webconfDraft.data,
            horario: state.webconfDraft.horario,
            enteNaoCompareceu: state.webconfDraft.enteNaoCompareceu,
            participants: state.webconfDraft.participants
          })
        });
        closeModal(modalWebconfWizard);
        await loadData();
        renderWebconfRegistros();
        renderRegistrosSiga();
      });
    } catch (_e) {}
  });
}

async function loadData() {
  const started = performance.now();
  const profile = await api('/api/profile/me');
  const demandasPromise = api(`/api/demandas?atendente=${encodeURIComponent(user.nome)}`);
  const sigaPromise = isEnabled(profile?.flags?.Registrosiga)
    ? api('/api/demandas/registros-siga')
    : Promise.resolve({ registros: [] });
  const webconfPromise = isEnabled(profile?.flags?.Webconferencia)
    ? api('/api/webconferencia/registros')
    : Promise.resolve({ registros: [] });
  const [demandas, siga, webconf] = await Promise.all([demandasPromise, sigaPromise, webconfPromise]);

  state.profile = profile;
  state.demandas = demandas.demandas || [];
  state.sigaRegistros = siga?.registros || [];
  state.webconfRegistros = webconf?.registros || [];

  const currentIds = state.demandas.map((d) => d.id);
  const previousRaw = localStorage.getItem(seenDemandasKey);
  if (previousRaw) {
    const previousIds = JSON.parse(previousRaw);
    const hasNew = currentIds.some((id) => !previousIds.includes(id));
    if (hasNew) {
      showAtribuicaoRecebida(user.nome, 5000);
      console.log('[Colaborador] nova atribuição detectada');
    }
  }
  localStorage.setItem(seenDemandasKey, JSON.stringify(currentIds));

  document.getElementById('welcome').textContent = user.nome;
  document.getElementById('profile-nome').textContent = `Nome: ${profile.nome}`;
  document.getElementById('profile-ramal').textContent = `Ramal: ${profile.ramal || '-'}`;
  attachAvatar(document.getElementById('me-avatar'), profile.nome);
  console.log(`[Colaborador] perfil e demandas carregados em ${Math.round(performance.now() - started)}ms`);
}

document.getElementById('btn-logout').addEventListener('click', async () => {
  clearSession();
  await showStatus('excluido', 'Sessão encerrada');
  window.location.href = 'login.html';
});


async function refreshSilently() {
  if (document.hidden || refreshInFlight) return;
  refreshInFlight = true;
  try {
    await loadData();
    renderAtividades();
    renderDemandas();
    renderRegistrosSiga();
    renderWebconfRegistros();
  } catch (error) {
    console.error('[Colaborador] polling erro:', error.message);
  } finally {
    refreshInFlight = false;
  }
}

(async () => {
  try {
    await runAction('carregar painel colaborador', 'Carregando painel colaborador...', null, null, async () => {
      await loadData();
      renderAtividades();
      renderDemandas();
      renderRegistrosSiga();
      renderWebconfRegistros();
      setupWhatsapp();
      setupWebconfWizard();
    });

    setInterval(() => {
      void refreshSilently();
    }, SILENT_REFRESH_MS);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        void refreshSilently();
      }
    });
    window.addEventListener('focus', () => {
      void refreshSilently();
    });
  } catch (_e) {}
})();

