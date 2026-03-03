import { api, requireAuth, clearSession, initThemeIcon } from './auth.js';
import { ACTIVITIES, AREA_OPTIONS, META_OPTIONS, CATEGORY_OPTIONS } from './data.js';
import { showLoading, showStatus, promptText } from './feedback.js';
import { attachAvatar } from './avatar.js';

const user = requireAuth('admin');
if (!user) throw new Error('Sessão inválida');
initThemeIcon();

const state = {
  cards: [],
  selectedSolicitacoes: [],
  selectedHistorico: [],
  demandasRegistros: [],
  demandasRegistrosLoaded: false,
  draftSolicitacoesByAtendente: {},
  recentlyAssignedByAtendente: {},
  selectedAtendente: null,
  dashboardUrl: 'https://docs.google.com/spreadsheets/d/16k4heNHfta1LBhSjbmeskHQY-NPAo41pqHwyZT8nSbM/edit?gid=0#gid=0',
  editingId: null,
  demandasRegistrosFilters: {
    dataInicio: '',
    dataFim: '',
    texto: ''
  }
};

const cardsEl = document.getElementById('cards');
const msgEl = document.getElementById('msg');
const modalConfig = document.getElementById('modal-config');
const modalSolicitacao = document.getElementById('modal-solicitacao');
const modalNovoColab = document.getElementById('modal-novo-colab');
const modalConfirmDelete = document.getElementById('modal-confirm-delete');
const modalDemandasRegistros = document.getElementById('modal-demandas-registros');
const demandasRegistrosBody = document.getElementById('tbody-demandas-registros');
const demandasRegistrosCount = document.getElementById('demandas-registros-count');
const dataSearchWrap = document.getElementById('data-search-wrap');
const textSearchWrap = document.getElementById('text-search-wrap');
const slotDataSearch = document.getElementById('slot-data-search');
const slotTextSearch = document.getElementById('slot-text-search');
const dataSearchStart = document.getElementById('data-search-start');
const dataSearchEnd = document.getElementById('data-search-end');
const textSearchInput = document.getElementById('text-search-input');
const ADMIN_AVATAR_SRC = './img/admin.png?v=20260226';
const SILENT_REFRESH_MS = 3000;
let refreshInFlight = false;
const adminAvatar = document.getElementById('admin-avatar');
if (adminAvatar) {
  adminAvatar.src = ADMIN_AVATAR_SRC;
  adminAvatar.onerror = () => attachAvatar(adminAvatar, 'admin');
}

function showMsg(text) {
  msgEl.textContent = text || '';
}

function openModal(el) { el.classList.add('open'); }
function closeModal(el) { el.classList.remove('open'); }

function collapseDemandasRegistrosSearch() {
  if (dataSearchWrap) dataSearchWrap.classList.remove('open');
  if (textSearchWrap) textSearchWrap.classList.remove('open');
  if (slotDataSearch) slotDataSearch.classList.remove('is-open');
  if (slotTextSearch) slotTextSearch.classList.remove('is-open');
}

function clearDemandasRegistrosInputs() {
  state.demandasRegistrosFilters = { dataInicio: '', dataFim: '', texto: '' };
  if (dataSearchStart) dataSearchStart.value = '';
  if (dataSearchEnd) dataSearchEnd.value = '';
  if (textSearchInput) textSearchInput.value = '';
  if (demandasRegistrosCount) {
    demandasRegistrosCount.textContent = '';
    demandasRegistrosCount.classList.add('hidden');
  }
  collapseDemandasRegistrosSearch();
}

function clearNovoColabInputs() {
  const form = document.getElementById('form-novo-colab');
  if (form) form.reset();
}

function clearSolicitacaoInputs() {
  const desc = document.getElementById('sol-descricao');
  if (desc) desc.value = '';
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightMatch(value, term) {
  const raw = String(value ?? '');
  const cleanTerm = String(term || '').trim();
  if (!cleanTerm) return escapeHtml(raw || '-');
  const pattern = new RegExp(`(${escapeRegex(cleanTerm)})`, 'gi');
  return escapeHtml(raw || '-').replace(pattern, '<mark class="search-hit">$1</mark>');
}

function parseBrDate(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]) - 1;
  const year = Number(match[3]);
  const date = new Date(year, month, day);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDateBr(value) {
  const raw = String(value || '').trim();
  if (!raw) return '-';

  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) {
    const day = String(Number(br[1])).padStart(2, '0');
    const month = String(Number(br[2])).padStart(2, '0');
    return `${day}/${month}/${br[3]}`;
  }

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (iso) {
    return `${iso[3]}/${iso[2]}/${iso[1]}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const day = String(parsed.getDate()).padStart(2, '0');
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const year = parsed.getFullYear();
    return `${day}/${month}/${year}`;
  }

  return raw;
}

function parseInputDate(value) {
  const text = String(value || '').trim();
  if (!text) return null;

  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) {
    const day = Number(br[1]);
    const month = Number(br[2]) - 1;
    const year = Number(br[3]);
    const date = new Date(year, month, day);
    if (Number.isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date;
  }

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]) - 1;
    const day = Number(iso[3]);
    const date = new Date(year, month, day);
    if (Number.isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date;
  }

  return null;
}

function getDraftsForSelected() {
  return state.draftSolicitacoesByAtendente[state.selectedAtendente] || [];
}

function setDraftsForSelected(drafts) {
  state.draftSolicitacoesByAtendente[state.selectedAtendente] = drafts;
}

function getRecentlyAssignedForSelected() {
  return state.recentlyAssignedByAtendente[state.selectedAtendente] || {};
}

function markRecentlyAssigned(id) {
  const now = Date.now();
  const hiddenUntil = now + 120000;
  const current = { ...getRecentlyAssignedForSelected() };
  current[id] = hiddenUntil;
  state.recentlyAssignedByAtendente[state.selectedAtendente] = current;
}

function cleanupRecentlyAssigned() {
  const now = Date.now();
  const current = { ...getRecentlyAssignedForSelected() };
  Object.keys(current).forEach((id) => {
    if (current[id] <= now) {
      delete current[id];
    }
  });
  state.recentlyAssignedByAtendente[state.selectedAtendente] = current;
}

function enabledActivitiesMap(card) {
  return ACTIVITIES.filter((a) => card.atividades?.[a.key] === 'Sim').slice(0, 3);
}

function formatPercent(value) {
  const num = Number(value || 0);
  const fixed = Number.isInteger(num) ? String(num) : num.toFixed(1).replace('.', ',');
  return `${fixed}%`;
}

function inferCategoryFromMeta(meta) {
  const val = Number(meta || 0);
  if (val >= 5) return 'Urgente';
  if (val >= 3) return 'Médio';
  return 'Baixo';
}

function resolveMood(card) {
  const percentual = Number(card.percentual || 0);
  if (percentual < 30) return { label: 'Leve', className: 'mood-leve' };
  if (percentual < 50) return { label: 'Média', className: 'mood-bom' };
  if (percentual < 80) return { label: 'Alta', className: 'mood-atencao' };
  return { label: 'Sobrecarga', className: 'mood-critico' };
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
    const mood = resolveMood(card);
    const percentualRaw = Number(card.percentual || 0);
    const percentualCapped = Math.min(percentualRaw, 100);
    const overLimit = percentualRaw > 100;
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
        <div class="mood-badge ${mood.className}" title="Humor baseado no volume de atividades">${mood.label}</div>
        <div class="progress-wrap">
          <div class="progress-green" style="width:${percentualCapped}%"></div>
          <div class="progress-text">${formatPercent(percentualCapped)}</div>
        </div>
        ${overLimit ? '<div class="card-limit-warning">Atendente ultrapassou o limite de atividades</div>' : ''}
        ${card.staleOver48h ? '<div class="card-stale-warning">Existem demandas paradas a mais de 48h</div>' : ''}
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
  const thDataRegistro = document.getElementById('th-data-registro');
  const card = state.cards.find((c) => c.nome === state.selectedAtendente);
  const showDataRegistro = card?.atividades?.Registrosiga === 'Sim';
  body.innerHTML = '';
  thDataRegistro.style.display = showDataRegistro ? '' : 'none';

  if (!state.selectedSolicitacoes.length) {
    body.innerHTML = `<tr><td colspan="${showDataRegistro ? 7 : 6}">Nenhuma solicitação para este atendente. Use "Adicionar solicitação".</td></tr>`;
    return;
  }

  state.selectedSolicitacoes.forEach((row) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.id}</td>
      <td>${row.area}</td>
      ${showDataRegistro ? `<td>${row.dataRegistro || '-'}</td>` : ''}
      <td>${row.categoria || '-'}</td>
      <td>${Number(row.meta).toFixed(2)}%</td>
      <td>${row.descricao}</td>
      <td class="actions-cell">
        <button data-edit-sol="${row.id}" title="Editar">✏</button>
        <button data-del-sol="${row.id}" title="Excluir">❌</button>
        <button data-assign-sol="${row.id}" class="btn-assign-sol" title="Atribuir"><i class="bi bi-send-fill"></i></button>
      </td>
    `;
    body.appendChild(tr);
  });

  body.querySelectorAll('[data-edit-sol]').forEach((btn) => btn.addEventListener('click', () => openSolicitacao(btn.dataset.editSol)));
  body.querySelectorAll('[data-del-sol]').forEach((btn) => btn.addEventListener('click', async () => {
    const row = state.selectedSolicitacoes.find((item) => item.id === btn.dataset.delSol);
    if (row?.isDraft) {
      setDraftsForSelected(getDraftsForSelected().filter((item) => item.id !== row.id));
      await loadSelectedSolicitacoes();
      renderSolicitacoesSelecionado();
      return;
    }
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
    const row = state.selectedSolicitacoes.find((item) => item.id === btn.dataset.assignSol);
    if (row?.isDraft) {
      try {
        await runAction('atribuir solicitação', 'Atribuindo solicitação...', 'atribuido', 'Solicitação atribuída', async () => {
          const created = await api('/api/solicitacoes', {
            method: 'POST',
            body: JSON.stringify({
              area: row.area,
              categoria: row.categoria,
              meta: Number(row.meta),
              descricao: row.descricao,
              atendenteNome: state.selectedAtendente
            })
          });
          if (created?.id) {
            markRecentlyAssigned(created.id);
          }
          setDraftsForSelected(getDraftsForSelected().filter((item) => item.id !== row.id));
          await loadSelectedSolicitacoes();
          await loadAdminData();
          renderSolicitacoesSelecionado();
          renderCards();
        });
      } catch (_e) {}
      return;
    }
    try {
      await runAction('atribuir solicitação', 'Atribuindo solicitação...', 'atribuido', 'Solicitação atribuída', async () => {
        await api(`/api/solicitacoes/${encodeURIComponent(btn.dataset.assignSol)}/atribuir`, {
          method: 'POST',
          body: JSON.stringify({ atendenteNome: state.selectedAtendente })
        });
        markRecentlyAssigned(btn.dataset.assignSol);
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
  const categoria = document.getElementById('sol-categoria');
  area.innerHTML = AREA_OPTIONS.map((item) => `<option value="${item}">${item}</option>`).join('');
  meta.innerHTML = META_OPTIONS.map((m) => `<option value="${m}">${m.toFixed(2)}%</option>`).join('');
  categoria.innerHTML = CATEGORY_OPTIONS.map((c) => `<option value="${c}">${c}</option>`).join('');
  meta.addEventListener('change', () => {
    categoria.value = inferCategoryFromMeta(meta.value);
  });
  categoria.value = inferCategoryFromMeta(meta.value);
}

function openSolicitacao(id = null) {
  state.editingId = id;
  document.getElementById('sol-id').value = id || 'Gerado automaticamente no salvar';
  document.getElementById('sol-title').textContent = id ? 'Editar Solicitação' : `Nova Solicitação - ${state.selectedAtendente}`;
  document.getElementById('sol-descricao').value = '';
  document.getElementById('sol-categoria').value = inferCategoryFromMeta(document.getElementById('sol-meta').value);

  if (id) {
    const row = state.selectedSolicitacoes.find((p) => p.id === id);
    if (row) {
      document.getElementById('sol-area').value = row.area;
      document.getElementById('sol-meta').value = String(row.meta);
      document.getElementById('sol-categoria').value = row.categoria || inferCategoryFromMeta(row.meta);
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

  const data = await api('/api/solicitacoes?pendentes=true&minhas=true');
  cleanupRecentlyAssigned();
  const recentlyAssigned = getRecentlyAssignedForSelected();
  const persisted = (data.solicitacoes || []).map((item) => ({
    id: item.id,
    area: item.area,
    dataRegistro: item.dataRegistro,
    categoria: item.categoria || '',
    descricao: item.descricao,
    meta: item.meta || 0,
    finalizado: item.finalizado,
    atribuidaPara: item.atribuidaPara,
    isDraft: false
  })).filter((item) => !recentlyAssigned[item.id]);
  state.selectedSolicitacoes = [...getDraftsForSelected(), ...persisted];
  console.log(`[Admin] solicitações do colaborador ${state.selectedAtendente}: ${state.selectedSolicitacoes.length}`);
}

function renderHistoricoSelecionado() {
  const body = document.getElementById('tbody-historico');
  body.innerHTML = '';
  if (!state.selectedHistorico.length) {
    body.innerHTML = '<tr><td colspan="9">Nenhuma demanda concluída para este atendente.</td></tr>';
    return;
  }

  state.selectedHistorico.forEach((row) => {
    const canReopen = Number(row.demandaReabertaQtd || 0) < 1;
    const dataAtribuicao = formatDateBr(row.dataRegistro);
    const dataConclusao = parseBrDate(row.finalizado) ? formatDateBr(row.finalizado) : (row.finalizado || '-');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.id}</td>
      <td>${row.area}</td>
      <td>${row.descricao}</td>
      <td><button data-reopen="${row.id}" title="Reabrir" ${canReopen ? '' : 'disabled'}>↺</button></td>
      <td>${row.medidasAdotadas || '-'}</td>
      <td>${row.motivoReabertura || '-'}</td>
      <td>${row.respostaFinal || '-'}</td>
      <td>${dataAtribuicao}</td>
      <td>${dataConclusao}</td>
    `;
    body.appendChild(tr);
  });

  body.querySelectorAll('[data-reopen]').forEach((btn) => btn.addEventListener('click', async () => {
    const motivo = await promptText({
      title: 'Reabrir demanda',
      message: 'Informe o motivo da reabertura:',
      placeholder: 'Digite o motivo',
      required: true,
      confirmLabel: 'Reabrir'
    });
    if (!motivo || !motivo.trim()) return;
    try {
      await runAction('reabrir demanda', 'Reabrindo demanda...', 'salvo', 'Demanda reaberta', async () => {
        await api(`/api/solicitacoes/${encodeURIComponent(btn.dataset.reopen)}/reabrir`, {
          method: 'POST',
          body: JSON.stringify({ motivoReabertura: motivo.trim() })
        });
        await loadSelectedHistorico();
        await loadAdminData();
        renderHistoricoSelecionado();
        renderCards();
      });
    } catch (_e) {}
  }));
}

async function loadSelectedHistorico() {
  if (!state.selectedAtendente) {
    state.selectedHistorico = [];
    return;
  }
  const data = await api(`/api/solicitacoes?historico=true&atendente=${encodeURIComponent(state.selectedAtendente)}`);
  state.selectedHistorico = data.solicitacoes || [];
}

function isWithinDateRange(dataRegistroBr, finalizadoBr, inicioInput, fimInput) {
  const inicio = parseInputDate(inicioInput);
  const fim = parseInputDate(fimInput);
  const dataRegistro = parseBrDate(dataRegistroBr);
  const dataFinalizado = parseBrDate(finalizadoBr);

  if (inicio) {
    if (!dataRegistro) return false;
    if (dataRegistro < inicio) return false;
  }
  if (fim) {
    if (!dataFinalizado) return false;
    if (dataFinalizado > fim) return false;
  }
  return true;
}

function renderDemandasRegistros() {
  if (!demandasRegistrosBody) return;
  const { dataInicio, dataFim, texto } = state.demandasRegistrosFilters;
  const hasCriteria = !!(String(dataInicio || '').trim() || String(dataFim || '').trim() || String(texto || '').trim());
  if (!hasCriteria) {
    demandasRegistrosBody.innerHTML = '<tr><td colspan="9">Use a busca por data/período ou texto para listar resultados.</td></tr>';
    if (demandasRegistrosCount) {
      demandasRegistrosCount.textContent = '';
      demandasRegistrosCount.classList.add('hidden');
    }
    return;
  }

  const termo = normalizeText(texto);
  const filtered = state.demandasRegistros.filter((row) => {
    if ((dataInicio || dataFim) && !isWithinDateRange(row.dataRegistro, row.finalizado, dataInicio, dataFim)) {
      return false;
    }
    if (!termo) {
      return true;
    }
    const bag = [
      row.id,
      row.assunto,
      row.descricao,
      row.dataRegistro,
      row.finalizado,
      row.atribuidaPara,
      row.registradorPor,
      row.finalizadoPor,
      row.origem
    ].map(normalizeText).join(' ');
    return bag.includes(termo);
  });

  demandasRegistrosBody.innerHTML = '';
  if (demandasRegistrosCount) {
    if (termo) {
      const total = filtered.length;
      demandasRegistrosCount.textContent = `${total} resultado${total === 1 ? '' : 's'} encontrado${total === 1 ? '' : 's'}.`;
      demandasRegistrosCount.classList.remove('hidden');
    } else {
      demandasRegistrosCount.textContent = '';
      demandasRegistrosCount.classList.add('hidden');
    }
  }
  if (!filtered.length) {
    demandasRegistrosBody.innerHTML = '<tr><td colspan="9">Nenhum registro encontrado.</td></tr>';
    return;
  }

  filtered.forEach((row) => {
    const dataRegistro = formatDateBr(row.dataRegistro);
    const finalizado = parseBrDate(row.finalizado) ? formatDateBr(row.finalizado) : (row.finalizado || '-');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${highlightMatch(row.id || '-', termo)}</td>
      <td>${highlightMatch(row.assunto || '-', termo)}</td>
      <td>${highlightMatch(row.descricao || '-', termo)}</td>
      <td>${highlightMatch(dataRegistro, termo)}</td>
      <td>${highlightMatch(finalizado, termo)}</td>
      <td>${highlightMatch(row.atribuidaPara || '-', termo)}</td>
      <td>${highlightMatch(row.registradorPor || '-', termo)}</td>
      <td>${highlightMatch(row.finalizadoPor || '-', termo)}</td>
      <td>${highlightMatch(row.origem || '-', termo)}</td>
    `;
    demandasRegistrosBody.appendChild(tr);
  });
}

async function loadDemandasRegistros() {
  const data = await api('/api/solicitacoes');
  state.demandasRegistros = (data.solicitacoes || []).map((row) => ({
    id: row.id,
    assunto: row.area,
    descricao: row.descricao,
    dataRegistro: row.dataRegistro,
    finalizado: row.finalizado,
    atribuidaPara: row.atribuidaPara,
    registradorPor: row.registradoPor,
    finalizadoPor: row.finalizadoPor,
    origem: row.origem
  }));
}

async function openDemandasRegistros() {
  clearDemandasRegistrosInputs();
  state.demandasRegistros = [];
  state.demandasRegistrosLoaded = false;

  try {
    renderDemandasRegistros();
    openModal(modalDemandasRegistros);
  } catch (_e) {}
}

async function applyDemandasRegistrosSearch() {
  const { dataInicio, dataFim, texto } = state.demandasRegistrosFilters;
  const hasCriteria = !!(String(dataInicio || '').trim() || String(dataFim || '').trim() || String(texto || '').trim());
  if (!hasCriteria) {
    renderDemandasRegistros();
    return;
  }

  const inicioInvalido = String(dataInicio || '').trim() && !parseInputDate(dataInicio);
  const fimInvalido = String(dataFim || '').trim() && !parseInputDate(dataFim);
  if (inicioInvalido || fimInvalido) {
    demandasRegistrosBody.innerHTML = '<tr><td colspan="9">Data inválida. Use o formato dd/mm/aaaa.</td></tr>';
    return;
  }

  if (!state.demandasRegistrosLoaded) {
    state.demandasRegistrosLoaded = true;
    try {
      await loadDemandasRegistros();
    } catch (error) {
      state.demandasRegistrosLoaded = false;
      showMsg(error.message || 'Falha ao carregar demandas e registros.');
      demandasRegistrosBody.innerHTML = '<tr><td colspan="9">Falha ao carregar dados.</td></tr>';
      return;
    }
  }
  renderDemandasRegistros();
}

async function openConfig(nome) {
  state.selectedAtendente = nome;
  document.getElementById('cfg-user-name').textContent = nome;

  try {
    await runAction('abrir configurações', 'Carregando configurações...', null, null, async () => {
      await loadSelectedSolicitacoes();
      await loadSelectedHistorico();
      renderAtividades();
      renderSolicitacoesSelecionado();
      renderHistoricoSelecionado();
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
  if (document.hidden || refreshInFlight) return;
  refreshInFlight = true;
  try {
    await loadAdminData();
    renderCards();
    if (state.selectedAtendente) {
      await Promise.all([loadSelectedSolicitacoes(), loadSelectedHistorico()]);
      renderSolicitacoesSelecionado();
      renderHistoricoSelecionado();
    }
  } catch (error) {
    console.error('[Admin] polling erro:', error.message);
  } finally {
    refreshInFlight = false;
  }
}

document.getElementById('btn-dashboard').addEventListener('click', () => window.open(state.dashboardUrl, '_blank'));

document.getElementById('btn-logout').addEventListener('click', async () => {
  clearSession();
  await showStatus('excluido', 'Sessão encerrada');
  window.location.href = 'login.html';
});

document.getElementById('btn-close-config').addEventListener('click', () => closeModal(modalConfig));
document.getElementById('btn-close-sol').addEventListener('click', () => {
  clearSolicitacaoInputs();
  closeModal(modalSolicitacao);
});
document.getElementById('btn-close-colab').addEventListener('click', () => {
  clearNovoColabInputs();
  closeModal(modalNovoColab);
});
document.getElementById('btn-close-delete').addEventListener('click', () => closeModal(modalConfirmDelete));
document.getElementById('btn-open-demandas-registros').addEventListener('click', () => {
  void openDemandasRegistros();
});
document.getElementById('btn-close-demandas-registros').addEventListener('click', () => {
  clearDemandasRegistrosInputs();
  closeModal(modalDemandasRegistros);
});
modalDemandasRegistros.addEventListener('click', (event) => {
  if (event.target === modalDemandasRegistros) {
    clearDemandasRegistrosInputs();
  }
});
document.getElementById('btn-toggle-data-search').addEventListener('click', () => {
  dataSearchWrap.classList.toggle('open');
  slotDataSearch.classList.toggle('is-open');
  if (dataSearchWrap.classList.contains('open')) {
    dataSearchStart.focus();
  }
});
document.getElementById('btn-toggle-text-search').addEventListener('click', () => {
  textSearchWrap.classList.toggle('open');
  slotTextSearch.classList.toggle('is-open');
  if (textSearchWrap.classList.contains('open')) {
    textSearchInput.focus();
  }
});
dataSearchStart.addEventListener('change', () => {
  state.demandasRegistrosFilters.dataInicio = dataSearchStart.value || '';
  void applyDemandasRegistrosSearch();
});
dataSearchEnd.addEventListener('change', () => {
  state.demandasRegistrosFilters.dataFim = dataSearchEnd.value || '';
  void applyDemandasRegistrosSearch();
});
dataSearchStart.addEventListener('input', () => {
  state.demandasRegistrosFilters.dataInicio = dataSearchStart.value || '';
  void applyDemandasRegistrosSearch();
});
dataSearchEnd.addEventListener('input', () => {
  state.demandasRegistrosFilters.dataFim = dataSearchEnd.value || '';
  void applyDemandasRegistrosSearch();
});
textSearchInput.addEventListener('input', () => {
  state.demandasRegistrosFilters.texto = textSearchInput.value || '';
  void applyDemandasRegistrosSearch();
});

document.querySelectorAll('[data-tab]').forEach((btn) => btn.addEventListener('click', () => {
  document.querySelectorAll('.tab-content').forEach((el) => el.classList.remove('active'));
  document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
}));

document.getElementById('btn-new-solicitacao').addEventListener('click', () => openSolicitacao());
document.getElementById('btn-assign-all').addEventListener('click', async () => {
  if (!state.selectedSolicitacoes.length) return;
  try {
    await runAction('atribuir todas solicitações', 'Atribuindo todas as solicitações...', 'atribuido', 'Solicitações atribuídas', async () => {
      for (const row of state.selectedSolicitacoes) {
        if (row.isDraft) {
          const created = await api('/api/solicitacoes', {
            method: 'POST',
            body: JSON.stringify({
              area: row.area,
              categoria: row.categoria,
              meta: Number(row.meta),
              descricao: row.descricao,
              atendenteNome: state.selectedAtendente
            })
          });
          if (created?.id) markRecentlyAssigned(created.id);
        } else {
          await api(`/api/solicitacoes/${encodeURIComponent(row.id)}/atribuir`, {
            method: 'POST',
            body: JSON.stringify({ atendenteNome: state.selectedAtendente })
          });
          markRecentlyAssigned(row.id);
        }
      }
      setDraftsForSelected([]);
      await loadSelectedSolicitacoes();
      await loadAdminData();
      renderSolicitacoesSelecionado();
      renderCards();
    });
  } catch (_e) {}
});

document.getElementById('form-solicitacao').addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    area: document.getElementById('sol-area').value,
    categoria: document.getElementById('sol-categoria').value,
    meta: Number(document.getElementById('sol-meta').value),
    descricao: document.getElementById('sol-descricao').value.trim()
  };

  try {
    await runAction('salvar solicitação', 'Salvando solicitação...', 'salvo', 'Solicitação salva', async () => {
      if (state.editingId) {
        const draft = getDraftsForSelected().find((item) => item.id === state.editingId);
        if (draft) {
          draft.area = payload.area;
          draft.categoria = payload.categoria;
          draft.meta = payload.meta;
          draft.descricao = payload.descricao;
          setDraftsForSelected([...getDraftsForSelected()]);
        } else {
          await api(`/api/solicitacoes/${encodeURIComponent(state.editingId)}`, {
            method: 'PUT',
            body: JSON.stringify(payload)
          });
        }
      } else {
        const draftId = `RASC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const drafts = getDraftsForSelected();
        drafts.unshift({
          id: draftId,
          area: payload.area,
          categoria: payload.categoria,
          descricao: payload.descricao,
          meta: payload.meta,
          dataRegistro: '',
          finalizado: '',
          atribuidaPara: '',
          isDraft: true
        });
        setDraftsForSelected(drafts);
        console.log('[Admin] solicitação salva como rascunho local; aguardando atribuição');
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

