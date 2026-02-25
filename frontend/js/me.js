import { api, requireAuth, clearSession, initThemeIcon } from './auth.js';
import { ACTIVITIES } from './data.js';
import { showLoading, showStatus, mountInlineLottie, showAtribuicaoRecebida } from './feedback.js';
import { attachAvatar } from './avatar.js';

const user = requireAuth('colaborador');
if (!user) throw new Error('Sessão inválida');
initThemeIcon();

const state = {
  profile: null,
  demandas: [],
  sigaRegistros: []
};

const atividadesEl = document.getElementById('atividades');
const demandasEl = document.getElementById('demandas');
const sigaBodyEl = document.getElementById('registros-siga-body');
const sigaBlockEl = document.getElementById('siga-block');
const msgEl = document.getElementById('msg');
const seenDemandasKey = `seenDemandas:${user.nome}`;
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
      <td colspan="4">
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
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${andamentoDot}${d.id}</td>
      <td>${d.area}</td>
      <td>${d.descricao}</td>
      <td>
        <div class="status-actions">
          <button class="btn-status andamento" data-start="${d.id}" type="button">Em andamento</button>
          <button class="btn-status concluido" data-done="${d.id}" type="button">Concluído</button>
        </div>
      </td>
    `;
    demandasEl.appendChild(tr);
  });

  demandasEl.querySelectorAll('[data-start]').forEach((btn) => {
    btn.addEventListener('click', () => updateStatus(btn.dataset.start, 'Em andamento'));
  });
  demandasEl.querySelectorAll('[data-done]').forEach((btn) => {
    btn.addEventListener('click', () => updateStatus(btn.dataset.done, 'Concluído'));
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
      <td colspan="4">
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

  state.sigaRegistros.forEach((d) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${d.id}</td>
      <td>${d.area}</td>
      <td>${d.descricao}</td>
      <td><button class="btn-status concluido" data-siga="${d.id}" type="button">Registrado</button></td>
    `;
    sigaBodyEl.appendChild(tr);
  });

  sigaBodyEl.querySelectorAll('[data-siga]').forEach((btn) => {
    btn.addEventListener('click', () => registrarSiga(btn.dataset.siga));
  });
}

async function updateStatus(id, status) {
  try {
    await runAction('atualizar status', 'Atualizando status...', 'atribuido', 'Status atualizado', async () => {
      await api(`/api/demandas/${encodeURIComponent(id)}/status`, {
        method: 'POST',
        body: JSON.stringify({ status })
      });
      await loadData();
      renderDemandas();
    });
  } catch (_e) {}
}

async function registrarSiga(id) {
  try {
    await runAction('registrar no SIGA', 'Finalizando registro...', 'salvo', 'Registro finalizado', async () => {
      await api(`/api/demandas/registros-siga/${encodeURIComponent(id)}/registrado`, {
        method: 'POST'
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
  const assuntoSelect = document.getElementById('wpp-assunto');
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

async function loadData() {
  const started = performance.now();
  const requests = [
    api('/api/profile/me'),
    api(`/api/demandas?atendente=${encodeURIComponent(user.nome)}`)
  ];

  if (state.profile?.flags?.Registrosiga === 'Sim' || !state.profile) {
    requests.push(api('/api/demandas/registros-siga').catch(() => ({ registros: [] })));
  }

  const [profile, demandas, siga] = await Promise.all(requests);

  state.profile = profile;
  state.demandas = demandas.demandas || [];
  state.sigaRegistros = siga?.registros || [];

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
  try {
    await loadData();
    renderAtividades();
    renderDemandas();
    renderRegistrosSiga();
  } catch (error) {
    console.error('[Colaborador] polling erro:', error.message);
  }
}

(async () => {
  try {
    await runAction('carregar painel colaborador', 'Carregando painel colaborador...', null, null, async () => {
      await loadData();
      renderAtividades();
      renderDemandas();
      renderRegistrosSiga();
      setupWhatsapp();
    });

    setInterval(refreshSilently, 12000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) refreshSilently();
    });
  } catch (_e) {}
})();

