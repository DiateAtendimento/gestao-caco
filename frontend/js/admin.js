import { api, requireAuth, clearSession, initThemeIcon } from './auth.js';
import { ACTIVITIES, AREA_OPTIONS, META_OPTIONS } from './data.js';
import { showLoading, showStatus } from './feedback.js';
import { attachAvatar } from './avatar.js';

const user = requireAuth('admin');
if (!user) throw new Error('Sessão inválida');
initThemeIcon();

const state = {
  cards: [],
  selectedSolicitacoes: [],
  selectedAtendente: null,
  dashboardUrl: 'https://docs.google.com/spreadsheets/d/16k4heNHfta1LBhSjbmeskHQY-NPAo41pqHwyZT8nSbM/edit?gid=0#gid=0',
  editingId: null
};

const cardsEl = document.getElementById('cards');
const msgEl = document.getElementById('msg');
const modalConfig = document.getElementById('modal-config');
const modalSolicitacao = document.getElementById('modal-solicitacao');
const modalNovoColab = document.getElementById('modal-novo-colab');
const modalConfirmDelete = document.getElementById('modal-confirm-delete');
attachAvatar(document.getElementById('admin-avatar'), 'admin');

function showMsg(text) {
  msgEl.textContent = text || '';
}

function openModal(el) { el.classList.add('open'); }
function closeModal(el) { el.classList.remove('open'); }

function enabledActivitiesMap(card) {
  return ACTIVITIES.filter((a) => card.atividades?.[a.key] === 'Sim').slice(0, 3);
}

function formatPercent(value) {
  const num = Number(value || 0);
  const fixed = Number.isInteger(num) ? String(num) : num.toFixed(1).replace('.', ',');
  return `${fixed}%`;
}

async function runAction(actionName, loadingText, successType, successText, fn) {
  const started = performance.now();
  const loading = await showLoading(loadingText);
  console.log(`[Admin] ${actionName} iniciado`);

  try {
    const result = await fn();
    console.log(`[Admin] ${actionName} concluído em ${Math.round(performance.now() - started)}ms`);
    if (successText) {
      await showStatus(successType, successText);
    }
    return result;
  } catch (error) {
    console.error(`[Admin] ${actionName} erro:`, error.message);
    showMsg(error.message);
    await showStatus('erro', `Erro: ${error.message}`);
    throw error;
  } finally {
    loading.close();
  }
}

function renderCards() {
  cardsEl.innerHTML = '';

  state.cards.forEach((card) => {
    const acts = enabledActivitiesMap(card);
    const box = document.createElement('article');
    box.className = 'colab-card';
    box.innerHTML = `
      <div class="colab-head">
        <div class="colab-icon-actions">
          <button class="icon-btn" data-del="${card.nome}" title="Excluir">🗑</button>
          <button class="icon-btn" data-edit="${card.nome}" title="Editar">✎</button>
        </div>
        <img class="colab-avatar" data-avatar-name="${card.nome}" alt="${card.nome}" />
        <div class="colab-name">${card.nome}</div>
        <div class="progress-wrap">
          <div class="progress-green" style="width:${Math.min(card.percentual * 20, 100)}%"></div>
          <div class="progress-text">${formatPercent(card.percentual)}</div>
        </div>
      </div>
      <div class="colab-body">
        <h5>Atividades</h5>
        <div class="card-acts">${acts.map((a) => `<img src="${a.icon}" alt="${a.label}" />`).join('')}</div>
        <div class="exec-text">Detalhamento da execução</div>
        <div class="count-row">
          <div class="count-item">
            <b>${card.emAndamento}</b>
            <span>Em andamento</span>
          </div>
          <div class="count-item red">
            <b>${card.naoIniciadas}</b>
            <span>Não iniciadas</span>
          </div>
        </div>
      </div>
    `;
    cardsEl.appendChild(box);
  });

  cardsEl.querySelectorAll('img[data-avatar-name]').forEach((img) => {
    attachAvatar(img, img.dataset.avatarName);
  });

  const add = document.createElement('article');
  add.className = 'add-colab-card';
  add.innerHTML = `
    <button id="btn-open-new" type="button">
      <img src="assets/icons/btn-adicionar.svg" alt="Adicionar" />
      Adicionar um novo colaborador
    </button>
  `;
  cardsEl.appendChild(add);

  cardsEl.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => openConfig(btn.dataset.edit));
  });

  cardsEl.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.selectedAtendente = btn.dataset.del;
      document.getElementById('confirm-delete-name').textContent = state.selectedAtendente;
      openModal(modalConfirmDelete);
    });
  });

  document.getElementById('btn-open-new').addEventListener('click', () => openModal(modalNovoColab));
}

function renderAtividades() {
  const target = document.getElementById('atividades-grid');
  const card = state.cards.find((c) => c.nome === state.selectedAtendente);
  const atividades = card?.atividades || {};
  target.innerHTML = '';

  ACTIVITIES.forEach((item) => {
    const enabled = atividades[item.key] === 'Sim';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `activity-btn ${enabled ? '' : 'disabled'}`;
    btn.innerHTML = `<img src="${item.icon}" alt="${item.label}" /><span>${item.label}</span>`;
    btn.addEventListener('click', async () => {
      try {
        await runAction('toggle atividade', 'Atualizando atividade...', 'salvo', 'Atividade atualizada', async () => {
          await api(`/api/users/${encodeURIComponent(state.selectedAtendente)}/atividades`, {
            method: 'PUT',
            body: JSON.stringify({ atividade: item.key })
          });
          await loadAdminData();
          renderAtividades();
          renderCards();
        });
      } catch (_e) {}
    });
    target.appendChild(btn);
  });
}

function renderSolicitacoesSelecionado() {
  const body = document.getElementById('tbody-solicitacoes');
  body.innerHTML = '';

  if (!state.selectedSolicitacoes.length) {
    body.innerHTML = '<tr><td colspan="5">Nenhuma solicitação pendente. Use "Adicionar solicitação".</td></tr>';
    return;
  }

  state.selectedSolicitacoes.forEach((row) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.id}</td>
      <td>${row.area}</td>
      <td>${Number(row.meta).toFixed(2)}%</td>
      <td>${row.descricao}</td>
      <td class="actions-cell">
        <button data-edit-sol="${row.id}" title="Editar">✏</button>
        <button data-del-sol="${row.id}" title="Excluir">❌</button>
        <button data-assign-sol="${row.id}" title="Atribuir"><i class="bi bi-send-fill"></i></button>
      </td>
    `;
    body.appendChild(tr);
  });

  body.querySelectorAll('[data-edit-sol]').forEach((btn) => btn.addEventListener('click', () => openSolicitacao(btn.dataset.editSol)));
  body.querySelectorAll('[data-del-sol]').forEach((btn) => btn.addEventListener('click', async () => {
    try {
      await runAction('excluir solicitação', 'Excluindo solicitação...', 'excluido', 'Solicitação excluída', async () => {
        await api(`/api/solicitacoes/${encodeURIComponent(btn.dataset.delSol)}`, { method: 'DELETE' });
        await loadSelectedSolicitacoes();
        await loadAdminData();
        renderSolicitacoesSelecionado();
        renderCards();
      });
    } catch (_e) {}
  }));
  body.querySelectorAll('[data-assign-sol]').forEach((btn) => btn.addEventListener('click', async () => {
    try {
      await runAction('atribuir solicitação', 'Atribuindo solicitação...', 'atribuido', 'Solicitação atribuída', async () => {
        await api(`/api/solicitacoes/${encodeURIComponent(btn.dataset.assignSol)}/atribuir`, {
          method: 'POST',
          body: JSON.stringify({ atendenteNome: state.selectedAtendente })
        });
        await loadSelectedSolicitacoes();
        await loadAdminData();
        renderSolicitacoesSelecionado();
        renderCards();
      });
    } catch (_e) {}
  }));
}

function setupSolicitacaoForm() {
  const area = document.getElementById('sol-area');
  const meta = document.getElementById('sol-meta');
  area.innerHTML = AREA_OPTIONS.map((item) => `<option value="${item}">${item}</option>`).join('');
  meta.innerHTML = META_OPTIONS.map((m) => `<option value="${m}">${m.toFixed(2)}%</option>`).join('');
}

function openSolicitacao(id = null) {
  state.editingId = id;
  document.getElementById('sol-id').value = id || 'Gerado automaticamente no salvar';
  document.getElementById('sol-title').textContent = id ? 'Editar Solicitação' : `Nova Solicitação - ${state.selectedAtendente}`;
  document.getElementById('sol-descricao').value = '';

  if (id) {
    const row = state.selectedSolicitacoes.find((p) => p.id === id);
    if (row) {
      document.getElementById('sol-area').value = row.area;
      document.getElementById('sol-meta').value = String(row.meta);
      document.getElementById('sol-descricao').value = row.descricao;
    }
  }

  openModal(modalSolicitacao);
}

async function loadSelectedSolicitacoes() {
  if (!state.selectedAtendente) {
    state.selectedSolicitacoes = [];
    return;
  }

  const data = await api('/api/solicitacoes?pendentes=true');
  state.selectedSolicitacoes = (data.solicitacoes || []).map((item) => ({
    id: item.id,
    area: item.area,
    descricao: item.descricao,
    meta: item.meta || 0,
    finalizado: item.finalizado
  }));
  console.log(`[Admin] solicitações do colaborador ${state.selectedAtendente}: ${state.selectedSolicitacoes.length}`);
}

async function openConfig(nome) {
  state.selectedAtendente = nome;
  document.getElementById('cfg-user-name').textContent = nome;

  try {
    await runAction('abrir configurações', 'Carregando configurações...', null, null, async () => {
      await loadSelectedSolicitacoes();
      renderAtividades();
      renderSolicitacoesSelecionado();
      openModal(modalConfig);
    });
  } catch (_e) {}
}

async function loadAdminData() {
  const started = performance.now();
  const dashboard = await api('/api/dashboard/admin');
  state.cards = (dashboard.cards || []).sort((a, b) =>
    String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR', { sensitivity: 'base' })
  );
  state.dashboardUrl = dashboard.dashboardUrl || state.dashboardUrl;
  console.log(`[Admin] cards carregados: ${state.cards.length}, tempo: ${Math.round(performance.now() - started)}ms`);
}

async function refreshSilently() {
  try {
    await loadAdminData();
    renderCards();
    if (state.selectedAtendente) {
      await loadSelectedSolicitacoes();
      renderSolicitacoesSelecionado();
    }
  } catch (error) {
    console.error('[Admin] polling erro:', error.message);
  }
}

document.getElementById('btn-dashboard').addEventListener('click', () => window.open(state.dashboardUrl, '_blank'));

document.getElementById('btn-logout').addEventListener('click', async () => {
  clearSession();
  await showStatus('excluido', 'Sessão encerrada');
  window.location.href = 'login.html';
});

document.getElementById('btn-close-config').addEventListener('click', () => closeModal(modalConfig));
document.getElementById('btn-close-sol').addEventListener('click', () => closeModal(modalSolicitacao));
document.getElementById('btn-close-colab').addEventListener('click', () => closeModal(modalNovoColab));
document.getElementById('btn-close-delete').addEventListener('click', () => closeModal(modalConfirmDelete));

document.querySelectorAll('[data-tab]').forEach((btn) => btn.addEventListener('click', () => {
  document.querySelectorAll('.tab-content').forEach((el) => el.classList.remove('active'));
  document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
}));

document.getElementById('btn-new-solicitacao').addEventListener('click', () => openSolicitacao());

document.getElementById('form-solicitacao').addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    area: document.getElementById('sol-area').value,
    meta: Number(document.getElementById('sol-meta').value),
    descricao: document.getElementById('sol-descricao').value.trim()
  };

  try {
    await runAction('salvar solicitação', 'Salvando solicitação...', 'salvo', 'Solicitação salva', async () => {
      if (state.editingId) {
        await api(`/api/solicitacoes/${encodeURIComponent(state.editingId)}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      } else {
        await api('/api/solicitacoes', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        console.log('[Admin] nova solicitação criada e mantida como pendente para atribuição manual');
      }

      closeModal(modalSolicitacao);
      await loadSelectedSolicitacoes();
      await loadAdminData();
      renderSolicitacoesSelecionado();
      renderCards();
    });
  } catch (_e) {}
});

document.getElementById('form-novo-colab').addEventListener('submit', async (event) => {
  event.preventDefault();
  const body = {
    nome: document.getElementById('colab-nome').value.trim(),
    ramal: document.getElementById('colab-ramal').value.trim(),
    genero: document.getElementById('colab-genero').value
  };

  try {
    await runAction('criar colaborador', 'Criando colaborador...', 'salvo', 'Colaborador criado', async () => {
      await api('/api/users', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      event.target.reset();
      closeModal(modalNovoColab);
      await loadAdminData();
      renderCards();
    });
  } catch (_e) {}
});

document.getElementById('btn-confirm-delete').addEventListener('click', async () => {
  try {
    await runAction('desativar colaborador', 'Desativando colaborador...', 'excluido', 'Colaborador desativado', async () => {
      await api(`/api/users/${encodeURIComponent(state.selectedAtendente)}`, { method: 'DELETE' });
      closeModal(modalConfirmDelete);
      closeModal(modalConfig);
      await loadAdminData();
      renderCards();
    });
  } catch (_e) {}
});

setupSolicitacaoForm();
(async () => {
  try {
    await runAction('carregar dashboard admin', 'Carregando painel admin...', null, null, async () => {
      await loadAdminData();
      renderCards();
    });
    setInterval(refreshSilently, 12000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) refreshSilently();
    });
  } catch (_e) {}
})();

