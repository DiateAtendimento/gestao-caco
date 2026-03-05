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
    enteCompareceu: '',
    participants: []
  },
  webconfFilters: {
    dataInicio: '',
    dataFim: '',
    texto: ''
  },
  redirectReceived: [],
  redirectSent: [],
  redirectContext: null,
  selectedRedirectTarget: ''
};

const atividadesEl = document.getElementById('atividades');
const demandasEl = document.getElementById('demandas');
const sigaBodyEl = document.getElementById('registros-siga-body');
const sigaBlockEl = document.getElementById('siga-block');
const webconfBlockEl = document.getElementById('webconf-block');
const webconfBodyEl = document.getElementById('webconf-body');
const modalWebconfWizard = document.getElementById('modal-webconf-wizard');
const modalWebconfParticipantes = document.getElementById('modal-webconf-participantes');
const modalWebconfEditParticipante = document.getElementById('modal-webconf-edit-participante');
const modalDemandaDetalhe = document.getElementById('modal-demanda-detalhe');
const modalRedir = document.getElementById('modal-redir');
const modalRedirCriar = document.getElementById('modal-redir-criar');
const demandaDetalheContent = document.getElementById('demanda-detalhe-content');
const redirBadgeEl = document.getElementById('redir-badge');
const redirRecebidasBodyEl = document.getElementById('redir-recebidas-body');
const redirEnviadasBodyEl = document.getElementById('redir-enviadas-body');
const redirObservacoesEl = document.getElementById('redir-observacoes');
const redirFromAvatarEl = document.getElementById('redir-from-avatar');
const redirFromNameEl = document.getElementById('redir-from-name');
const redirToAvatarEl = document.getElementById('redir-to-avatar');
const redirToNameEl = document.getElementById('redir-to-name');
const redirToPickerEl = document.getElementById('redir-to-picker');
const redirToListEl = document.getElementById('redir-to-list');
const redirTabRecebidasEl = document.getElementById('redir-tab-recebidas');
const redirTabEnviadasEl = document.getElementById('redir-tab-enviadas');
const redirPaneRecebidasEl = document.getElementById('redir-pane-recebidas');
const redirPaneEnviadasEl = document.getElementById('redir-pane-enviadas');
const webconfRegistrosCountEl = document.getElementById('webconf-registros-count');
const slotWebconfDataSearch = document.getElementById('slot-webconf-data-search');
const slotWebconfTextSearch = document.getElementById('slot-webconf-text-search');
const webconfDataSearchWrap = document.getElementById('webconf-data-search-wrap');
const webconfTextSearchWrap = document.getElementById('webconf-text-search-wrap');
const webconfDataSearchStart = document.getElementById('webconf-data-search-start');
const webconfDataSearchEnd = document.getElementById('webconf-data-search-end');
const webconfTextSearchInput = document.getElementById('webconf-text-search-input');
const msgEl = document.getElementById('msg');
const seenDemandasKey = `seenDemandas:${user.nome}`;
const SILENT_REFRESH_MS = 3000;
let refreshInFlight = false;
let webconfStep = 1;
let webconfEditIndex = -1;
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
const ACTIVITY_LINKS = {
  Webconferencia: 'https://outlook.office.com/bookings/calendar',
  Registrosiga: 'https://siga-rpps.sistema.gov.br/dashboard-mps/solicitacao/lista',
  Sei: 'https://colaboragov.sei.gov.br/sip/modulos/MF/login_especial/login_especial.php?sigla_orgao_sistema=MGI&sigla_sistema=SEI',
  Gescon: 'https://novogescon.previdencia.gov.br/gescon/',
  Taxigov: 'https://auth.wexp.com.br/account/login?returnUrl=%2Fconnect%2Fauthorize%2Fcallback%3Fclient_id%3Dmvc%26redirect_uri%3Dhttps%253A%252F%252Fmobgov.wexp.com.br%252Fsignin-oidc%26response_type%3Dcode%2520id_token%26scope%3Dopenid%2520profile%2520wExpoPublicAPI%26response_mode%3Dform_post%26nonce%3D639082430395886225.MDc1YzM0Y2EtZmM3OC00ZGRhLWJkYTItZjU0ZjEwZTBjMTcwNjg3MTljMmMtNjQzMi00ZjdiLTljM2UtOWI3ZjMxNjMwNTUy%26state%3DCfDJ8OjS9ljEBdxDjFgdWE_ng_qA7trVo1hWSqhL_-8aV-Ix6SAnKNVBDh8AemhJgzDa0wCIlQB_f4PkkxPqJBlMDXFMIpydFB1MrJ8hqxpct1B1IGjjHYmc0regbOvrChKLLOb_r_PZk7h1FSQqHaJqN54JIZMuMldHGdOalaCPDwvSyF0RgjhOk7Tv6ClSz8RFkaSVX5rF6nygMeS8DtsCQ8ebVXIqV5JigloqU335r8EzTkSbRJBenWSQtnzDsVpixEmCFRPuD7tzhXGmvWF52b_tnTrUq9jwlmqLwfA4GbSfIrTzfTJH-NJvxLzaV56xBdiY8O_SU6HGkFtmDUh5EX0%26x-client-SKU%3DID_NETSTANDARD1_4%26x-client-ver%3D5.2.0.0',
  Phplist: 'https://maillist-listas.trabalho.gov.br/lists/admin/?page=logout&err=1'
};

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

function normalizeTextValue(value) {
  return String(value || '').trim().toLowerCase();
}

function truncateText(value, size = 90) {
  const text = String(value || '').trim();
  if (text.length <= size) return text;
  return `${text.slice(0, size)}...`;
}

function parseBrDate(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function parseInputDate(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!br) return null;
  const date = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function webconfMatchesDateRange(dateText, startInput, endInput) {
  const date = parseBrDate(dateText);
  const start = parseInputDate(startInput);
  const end = parseInputDate(endInput);
  if (start) {
    if (!date || date < start) return false;
  }
  if (end) {
    if (!date || date > end) return false;
  }
  return true;
}

function getFilteredWebconfRegistros() {
  const { dataInicio, dataFim, texto } = state.webconfFilters;
  const term = normalizeTextValue(texto);
  const hasDateFilter = !!(String(dataInicio || '').trim() || String(dataFim || '').trim());
  const hasTextFilter = !!term;
  const hasCriteria = hasDateFilter || hasTextFilter;

  if (!hasCriteria) {
    return { hasCriteria, filtered: state.webconfRegistros };
  }

  const filtered = state.webconfRegistros.filter((row) => {
    const matchesDate = !hasDateFilter || webconfMatchesDateRange(row.data, dataInicio, dataFim);
    const bag = [
      row.id,
      row.qualWebconferencia,
      row.data,
      row.horario,
      row.atendente,
      row.enteCompareceu,
      row.enteNaoCompareceu,
      row.quantidadeAtendida,
      row.participantes
    ].map(normalizeTextValue).join(' ');
    const matchesText = !hasTextFilter || bag.includes(term);
    return matchesDate && matchesText;
  });
  return { hasCriteria, filtered };
}

async function runAction(actionName, loadingText, successType, successText, fn) {
  const started = performance.now();
  let loading = null;
  let loadingShown = false;
  const loadingDelayMs = 450;
  const loadingTimer = window.setTimeout(async () => {
    loadingShown = true;
    loading = await showLoading(loadingText);
  }, loadingDelayMs);
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
    window.clearTimeout(loadingTimer);
    if (loadingShown && loading?.close) {
      loading.close();
    }
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
    const link = ACTIVITY_LINKS[key] || '';
    const chip = document.createElement('div');
    chip.className = `activity-chip ${link ? 'linked' : ''}`;
    chip.innerHTML = `
      <img src="${activity?.icon || 'assets/icons/ti.svg'}" alt="${activity?.label || key}" />
      <div>${activity?.label || key}</div>
    `;
    if (link) {
      chip.title = 'Abrir em nova aba';
      chip.tabIndex = 0;
      chip.addEventListener('click', () => window.open(link, '_blank', 'noopener,noreferrer'));
      chip.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          window.open(link, '_blank', 'noopener,noreferrer');
        }
      });
    }
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
    const descricaoPreview = String(d.descricao || '').trim();
    tr.innerHTML = `
      <td>${andamentoDot}${d.id}</td>
      <td>${d.area}</td>
      <td><span class="cat-badge ${categoriaClass}">${d.categoria || '-'}</span></td>
      <td>
        <div class="demand-desc-wrap">
          <div class="demand-desc-preview">${descricaoPreview || '-'}</div>
        </div>
      </td>
      <td>
        <div class="status-actions">
          <button class="detail-inline-btn" data-detail="${d.id}" data-row-index="${d.rowIndex || ''}" type="button" title="Ver detalhamento">
            <i class="bi bi-eye-fill" aria-hidden="true"></i>
          </button>
          <button class="detail-inline-btn redirect-btn" data-redirect="${d.id}" data-row-index="${d.rowIndex || ''}" type="button" title="Redirecionar demanda">
            <i class="bi bi-arrow-left-right" aria-hidden="true"></i>
          </button>
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
  demandasEl.querySelectorAll('[data-detail]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.detail;
      const rowIndex = Number(btn.dataset.rowIndex || 0) || null;
      const demanda = abertas.find((d) => d.id === id && (rowIndex ? Number(d.rowIndex) === rowIndex : true))
        || abertas.find((d) => d.id === id);
      if (!demanda || !demandaDetalheContent) return;
      const text = `${demanda.descricao || '-'}`;
      demandaDetalheContent.textContent = text;
      openModal(modalDemandaDetalhe);
    });
  });
  demandasEl.querySelectorAll('[data-redirect]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.redirect;
      const rowIndex = Number(btn.dataset.rowIndex || 0) || null;
      const demanda = abertas.find((d) => d.id === id && (rowIndex ? Number(d.rowIndex) === rowIndex : true))
        || abertas.find((d) => d.id === id);
      if (!demanda) return;
      void openRedirectCreateModal(demanda);
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
  const { hasCriteria, filtered } = getFilteredWebconfRegistros();
  if (webconfRegistrosCountEl) {
    if (hasCriteria) {
      const total = filtered.length;
      webconfRegistrosCountEl.textContent = `${total} resultado${total === 1 ? '' : 's'} encontrado${total === 1 ? '' : 's'}.`;
      webconfRegistrosCountEl.classList.remove('hidden');
    } else {
      webconfRegistrosCountEl.textContent = '';
      webconfRegistrosCountEl.classList.add('hidden');
    }
  }

  if (!filtered.length) {
    webconfBodyEl.innerHTML = '<tr><td colspan=\"8\">Nenhum registro de webconferência encontrado.</td></tr>';
    return;
  }

  filtered.forEach((row, index) => {
    const webconfKey = row.id || `legacy-${index}`;
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
      <td>${row.enteCompareceu || row.enteNaoCompareceu || '-'}</td>
      <td>${Number(row.quantidadeAtendida || 0)}</td>
      <td>
        <button class=\"detail-inline-btn table-eye-btn\" data-webconf-participantes=\"${webconfKey}\" type=\"button\" title=\"Ver participantes\">
          <i class=\"bi bi-eye-fill\" aria-hidden=\"true\"></i>
        </button>
      </td>
    `;
    tr.dataset.webconfKey = webconfKey;
    webconfBodyEl.appendChild(tr);
  });

  webconfBodyEl.querySelectorAll('[data-webconf-avatar]').forEach((img) => {
    attachAvatar(img, img.dataset.webconfAvatar || '');
  });

  webconfBodyEl.querySelectorAll('[data-webconf-participantes]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tr = btn.closest('tr');
      const key = tr?.dataset.webconfKey || btn.dataset.webconfParticipantes;
      const row = filtered.find((r, idx) => (r.id || `legacy-${idx}`) === key);
      document.getElementById('webconf-participantes-preview').textContent = row?.participantes || 'Sem participantes';
      openModal(modalWebconfParticipantes);
    });
  });
}

function renderRedirectBadge() {
  if (!redirBadgeEl) return;
  const total = state.redirectReceived.length;
  redirBadgeEl.textContent = String(total);
  redirBadgeEl.classList.toggle('hidden', total <= 0);
}

function renderRedirectReceived() {
  if (!redirRecebidasBodyEl) return;
  redirRecebidasBodyEl.innerHTML = '';
  if (!state.redirectReceived.length) {
    redirRecebidasBodyEl.innerHTML = '<tr><td colspan="5">Nenhuma demanda redirecionada pendente.</td></tr>';
    return;
  }
  state.redirectReceived.forEach((item) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.idDemanda || '-'}</td>
      <td>${item.area || '-'}</td>
      <td>
        <div class="redir-mini-person">
          <img data-redir-avatar="${item.deColaborador || ''}" alt="${item.deColaborador || 'Colaborador'}" />
          <span>${item.deColaborador || '-'}</span>
        </div>
      </td>
      <td>${truncateText(item.descricaoSnapshot || '-', 120)}</td>
      <td>
        <div class="status-actions">
          <button class="btn-status concluido" data-redir-accept="${item.idRedirecionamento}" type="button">Aceitar</button>
          <button class="btn-status andamento" data-redir-return="${item.idRedirecionamento}" type="button">Devolver</button>
        </div>
      </td>
    `;
    redirRecebidasBodyEl.appendChild(tr);
  });

  redirRecebidasBodyEl.querySelectorAll('[data-redir-avatar]').forEach((img) => {
    attachAvatar(img, img.dataset.redirAvatar || '');
  });
  redirRecebidasBodyEl.querySelectorAll('[data-redir-accept]').forEach((btn) => {
    btn.addEventListener('click', () => void acceptRedirect(btn.dataset.redirAccept));
  });
  redirRecebidasBodyEl.querySelectorAll('[data-redir-return]').forEach((btn) => {
    btn.addEventListener('click', () => void returnRedirect(btn.dataset.redirReturn));
  });
}

function renderRedirectSent() {
  if (!redirEnviadasBodyEl) return;
  redirEnviadasBodyEl.innerHTML = '';
  if (!state.redirectSent.length) {
    redirEnviadasBodyEl.innerHTML = '<tr><td colspan="5">Nenhuma demanda devolvida no momento.</td></tr>';
    return;
  }
  state.redirectSent.forEach((item) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.idDemanda || '-'}</td>
      <td>
        <div class="redir-mini-person">
          <img data-redir-avatar="${item.paraColaborador || ''}" alt="${item.paraColaborador || 'Colaborador'}" />
          <span>${item.paraColaborador || '-'}</span>
        </div>
      </td>
      <td><span class="cat-badge urgente">${item.status || '-'}</span></td>
      <td>${item.motivoDevolucao || '-'}</td>
      <td>
        <div class="status-actions">
          <button class="btn-status concluido" data-redir-accept-return="${item.idRedirecionamento}" type="button">Aceitar</button>
          <button class="btn-status andamento" data-redir-refuse-return="${item.idRedirecionamento}" type="button">Recusar</button>
        </div>
      </td>
    `;
    redirEnviadasBodyEl.appendChild(tr);
  });

  redirEnviadasBodyEl.querySelectorAll('[data-redir-avatar]').forEach((img) => {
    attachAvatar(img, img.dataset.redirAvatar || '');
  });
  redirEnviadasBodyEl.querySelectorAll('[data-redir-accept-return]').forEach((btn) => {
    btn.addEventListener('click', () => void acceptReturnedRedirect(btn.dataset.redirAcceptReturn));
  });
  redirEnviadasBodyEl.querySelectorAll('[data-redir-refuse-return]').forEach((btn) => {
    btn.addEventListener('click', () => void refuseReturnedRedirect(btn.dataset.redirRefuseReturn));
  });
}

function renderRedirectCandidateList(candidates) {
  if (!redirToListEl) return;
  redirToListEl.innerHTML = '';
  if (!candidates.length) {
    redirToListEl.innerHTML = '<div class="empty-state-box"><p>Nenhum colaborador compatível encontrado.</p></div>';
    return;
  }
  candidates.forEach((colab) => {
    const btn = document.createElement('button');
    btn.className = 'redir-candidate-item';
    btn.type = 'button';
    btn.dataset.redirCandidate = colab.nome;
    btn.innerHTML = `
      <img data-redir-candidate-avatar="${colab.nome}" alt="${colab.nome}" />
      <span>${colab.nome}${colab.ramal ? ` - Ramal ${colab.ramal}` : ''}</span>
    `;
    redirToListEl.appendChild(btn);
  });
  redirToListEl.querySelectorAll('[data-redir-candidate-avatar]').forEach((img) => {
    attachAvatar(img, img.dataset.redirCandidateAvatar || '');
  });
  redirToListEl.querySelectorAll('[data-redir-candidate]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nome = String(btn.dataset.redirCandidate || '').trim();
      state.selectedRedirectTarget = nome;
      if (redirToNameEl) redirToNameEl.textContent = nome || 'Selecione';
      attachAvatar(redirToAvatarEl, nome);
      redirToListEl.classList.remove('open');
    });
  });
}

async function openRedirectCreateModal(demanda) {
  try {
    const query = demanda.rowIndex ? `?rowIndex=${encodeURIComponent(demanda.rowIndex)}` : '';
    const data = await api(`/api/demandas/redirecionaveis/${encodeURIComponent(demanda.id)}${query}`);
    const candidates = Array.isArray(data?.colaboradores) ? data.colaboradores : [];
    state.redirectContext = {
      demandaId: demanda.id,
      rowIndex: demanda.rowIndex || null,
      candidates
    };
    state.selectedRedirectTarget = '';
    renderRedirectCandidateList(candidates);
    if (redirObservacoesEl) redirObservacoesEl.value = '';
    if (redirFromNameEl) redirFromNameEl.textContent = user.nome;
    if (redirToNameEl) redirToNameEl.textContent = 'Selecione';
    if (redirToListEl) redirToListEl.classList.remove('open');
    attachAvatar(redirFromAvatarEl, user.nome);
    attachAvatar(redirToAvatarEl, '');
    openModal(modalRedirCriar);
    if (!candidates.length) {
      await showStatus('erro', 'Nenhum colaborador compatível para redirecionar esta demanda');
    }
  } catch (error) {
    await showStatus('erro', `Erro ao carregar colaboradores: ${error.message}`);
  }
}

async function sendRedirect() {
  if (!state.redirectContext) return;
  const paraColaborador = String(state.selectedRedirectTarget || '').trim();
  if (!paraColaborador) {
    await showStatus('erro', 'Selecione o colaborador de destino');
    return;
  }
  try {
    await runAction('redirecionar demanda', 'Enviando redirecionamento...', 'atribuido', 'Demanda redirecionada', async () => {
      await api(`/api/demandas/${encodeURIComponent(state.redirectContext.demandaId)}/redirecionar`, {
        method: 'POST',
        body: JSON.stringify({
          rowIndex: Number(state.redirectContext?.rowIndex || 0) || null,
          paraColaborador,
          observacoes: String(redirObservacoesEl?.value || '').trim()
        })
      });
      closeModal(modalRedirCriar);
      await loadData();
      renderDemandas();
      renderRedirectBadge();
      renderRedirectReceived();
      renderRedirectSent();
    });
  } catch (_e) {}
}

async function acceptRedirect(redirectId) {
  try {
    await runAction('aceitar redirecionamento', 'Aceitando demanda...', 'atribuido', 'Demanda aceita', async () => {
      await api(`/api/demandas/redirecionadas/${encodeURIComponent(redirectId)}/aceitar`, { method: 'POST' });
      await loadData();
      renderDemandas();
      renderRedirectBadge();
      renderRedirectReceived();
      renderRedirectSent();
    });
  } catch (_e) {}
}

async function returnRedirect(redirectId) {
  const motivo = await promptText({
    title: 'Motivo da devolução',
    message: 'Informe o motivo para devolver a demanda:',
    placeholder: 'Descreva o motivo',
    required: false,
    confirmLabel: 'Devolver'
  });
  if (motivo === null) return;
  try {
    await runAction('devolver redirecionamento', 'Devolvendo demanda...', 'salvo', 'Demanda devolvida', async () => {
      await api(`/api/demandas/redirecionadas/${encodeURIComponent(redirectId)}/devolver`, {
        method: 'POST',
        body: JSON.stringify({ motivoDevolucao: motivo })
      });
      await loadData();
      renderRedirectBadge();
      renderRedirectReceived();
      renderRedirectSent();
    });
  } catch (_e) {}
}

async function acceptReturnedRedirect(redirectId) {
  try {
    await runAction('aceitar devolução', 'Confirmando devolução...', 'salvo', 'Devolução aceita', async () => {
      await api(`/api/demandas/redirecionadas/${encodeURIComponent(redirectId)}/aceitar-devolucao`, { method: 'POST' });
      await loadData();
      renderRedirectBadge();
      renderRedirectReceived();
      renderRedirectSent();
    });
  } catch (_e) {}
}

async function refuseReturnedRedirect(redirectId) {
  try {
    await runAction('recusar devolução', 'Reenviando demanda...', 'atribuido', 'Demanda reenviada', async () => {
      await api(`/api/demandas/redirecionadas/${encodeURIComponent(redirectId)}/recusar-devolucao`, { method: 'POST' });
      await loadData();
      renderRedirectBadge();
      renderRedirectReceived();
      renderRedirectSent();
    });
  } catch (_e) {}
}

function resetWebconfDraft() {
  state.webconfDraft = {
    qualWebconferencia: '',
    data: '',
    horario: '',
    enteCompareceu: 'Não',
    participants: []
  };
}

function syncWebconfParticipantTable() {
  const body = document.getElementById('webconf-participantes-body');
  body.innerHTML = '';
  if (!state.webconfDraft.participants.length) {
    body.innerHTML = '<tr><td colspan=\"6\">Nenhum participante adicionado.</td></tr>';
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
      <td class="webconf-actions-cell">
        <button class="btn-soft btn-mini" type="button" data-webconf-edit="${idx}">Editar</button>
        <button class="btn-danger btn-mini" type="button" data-webconf-remove="${idx}">Remover</button>
      </td>
    `;
    body.appendChild(tr);
  });

  body.querySelectorAll('[data-webconf-remove]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const idx = Number(btn.dataset.webconfRemove);
      if (!Number.isInteger(idx) || idx < 0 || idx >= state.webconfDraft.participants.length) return;
      state.webconfDraft.participants.splice(idx, 1);
      syncWebconfParticipantTable();
      await showStatus('excluido', 'Participante removido');
    });
  });

  body.querySelectorAll('[data-webconf-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.webconfEdit);
      const participant = state.webconfDraft.participants[idx];
      if (!participant) return;
      webconfEditIndex = idx;
      document.getElementById('webconf-edit-nome').value = participant.nome || '';
      document.getElementById('webconf-edit-cpf').value = participant.cpf || '';
      document.getElementById('webconf-edit-municipio').value = participant.municipio || '';
      document.getElementById('webconf-edit-uf').value = participant.uf || '';
      document.getElementById('webconf-edit-descricao').value = participant.descricao || '';
      paintCpfHint(document.getElementById('webconf-edit-cpf-hint'), isCpfLengthValid(participant.cpf || ''));
      openModal(modalWebconfEditParticipante);
    });
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

function toLetters(value) {
  return String(value || '').replace(/[^A-Za-zÀ-ÿ\s]/g, '');
}

function isCpfLengthValid(value) {
  return toDigits(value).length === 11;
}

function paintCpfHint(hintEl, isValid) {
  if (!hintEl) return;
  hintEl.textContent = isValid ? 'CPF com 11 dígitos.' : 'CPF deve ter 11 dígitos.';
  hintEl.classList.toggle('ok', isValid);
  hintEl.classList.toggle('error', !isValid);
}

function selectedEnteCompareceuValue() {
  const checked = document.querySelector('input[name="webconf-ente-nao"]:checked');
  return checked?.value || 'Não';
}

async function fillWebconfAgendaDefaults(assunto) {
  try {
    const params = new URLSearchParams();
    if (String(assunto || '').trim()) {
      params.set('assunto', assunto.trim());
    }
    const query = params.toString() ? `?${params.toString()}` : '';
    const data = await api(`/api/webconferencia/agenda${query}`);
    if (data?.horarioInicio) {
      document.getElementById('webconf-horario').value = data.horarioInicio;
      state.webconfDraft.horario = data.horarioInicio;
    }
  } catch (_error) {
    // Mantém o campo de data em branco por definição de UX.
  }
}

function maskDateInput(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function openWebconfWizard() {
  resetWebconfDraft();
  webconfEditIndex = -1;
  setWebconfStep(1);
  document.getElementById('webconf-qual').value = '';
  document.getElementById('webconf-data').value = '';
  document.getElementById('webconf-horario').value = '';
  document.getElementById('webconf-atendente').textContent = user.nome;
  attachAvatar(document.getElementById('webconf-atendente-avatar'), user.nome);
  document.getElementById('webconf-p-nome').value = '';
  document.getElementById('webconf-p-cpf').value = '';
  document.getElementById('webconf-p-municipio').value = '';
  document.getElementById('webconf-p-uf').value = '';
  document.getElementById('webconf-p-descricao').value = '';
  document.querySelectorAll('input[name="webconf-ente-nao"]').forEach((radio) => {
    radio.checked = radio.value === 'Não';
  });
  paintCpfHint(document.getElementById('webconf-p-cpf-hint'), false);
  paintCpfHint(document.getElementById('webconf-edit-cpf-hint'), false);
  const noHistorySuffix = String(Date.now());
  [
    { id: 'webconf-qual', name: `webconf_qual_${noHistorySuffix}` },
    { id: 'webconf-data', name: `webconf_data_${noHistorySuffix}` },
    { id: 'webconf-horario', name: `webconf_horario_${noHistorySuffix}` },
    { id: 'webconf-p-nome', name: `webconf_part_nome_${noHistorySuffix}` },
    { id: 'webconf-p-cpf', name: `webconf_part_cpf_${noHistorySuffix}` },
    { id: 'webconf-p-municipio', name: `webconf_part_municipio_${noHistorySuffix}` },
    { id: 'webconf-p-uf', name: `webconf_part_uf_${noHistorySuffix}` },
    { id: 'webconf-p-descricao', name: `webconf_part_descricao_${noHistorySuffix}` },
    { id: 'webconf-edit-nome', name: `webconf_edit_nome_${noHistorySuffix}` },
    { id: 'webconf-edit-cpf', name: `webconf_edit_cpf_${noHistorySuffix}` },
    { id: 'webconf-edit-municipio', name: `webconf_edit_municipio_${noHistorySuffix}` },
    { id: 'webconf-edit-uf', name: `webconf_edit_uf_${noHistorySuffix}` },
    { id: 'webconf-edit-descricao', name: `webconf_edit_descricao_${noHistorySuffix}` }
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

function setupWebconfSearch() {
  if (!slotWebconfDataSearch || !slotWebconfTextSearch || !webconfDataSearchWrap || !webconfTextSearchWrap) return;

  const noHistorySuffix = String(Date.now());
  [
    { el: webconfDataSearchStart, name: `webconf_inicio_${noHistorySuffix}` },
    { el: webconfDataSearchEnd, name: `webconf_fim_${noHistorySuffix}` },
    { el: webconfTextSearchInput, name: `webconf_texto_${noHistorySuffix}` }
  ].forEach(({ el, name }) => {
    if (!el) return;
    el.setAttribute('name', name);
    el.setAttribute('autocomplete', 'off');
    el.setAttribute('autocorrect', 'off');
    el.setAttribute('autocapitalize', 'off');
    el.setAttribute('spellcheck', 'false');
  });

  const btnToggleDate = document.getElementById('btn-toggle-webconf-data-search');
  const btnToggleText = document.getElementById('btn-toggle-webconf-text-search');
  if (btnToggleDate && !btnToggleDate.dataset.bound) {
    btnToggleDate.dataset.bound = 'true';
    btnToggleDate.addEventListener('click', () => {
      webconfDataSearchWrap.classList.toggle('open');
      slotWebconfDataSearch.classList.toggle('is-open');
      if (webconfDataSearchWrap.classList.contains('open')) {
        webconfDataSearchStart?.focus();
      }
    });
  }
  if (btnToggleText && !btnToggleText.dataset.bound) {
    btnToggleText.dataset.bound = 'true';
    btnToggleText.addEventListener('click', () => {
      webconfTextSearchWrap.classList.toggle('open');
      slotWebconfTextSearch.classList.toggle('is-open');
      if (webconfTextSearchWrap.classList.contains('open')) {
        webconfTextSearchInput?.focus();
      }
    });
  }

  if (webconfDataSearchStart && !webconfDataSearchStart.dataset.bound) {
    webconfDataSearchStart.dataset.bound = 'true';
    webconfDataSearchStart.addEventListener('input', () => {
      state.webconfFilters.dataInicio = webconfDataSearchStart.value || '';
      renderWebconfRegistros();
    });
  }
  if (webconfDataSearchEnd && !webconfDataSearchEnd.dataset.bound) {
    webconfDataSearchEnd.dataset.bound = 'true';
    webconfDataSearchEnd.addEventListener('input', () => {
      state.webconfFilters.dataFim = webconfDataSearchEnd.value || '';
      renderWebconfRegistros();
    });
  }
  if (webconfTextSearchInput && !webconfTextSearchInput.dataset.bound) {
    webconfTextSearchInput.dataset.bound = 'true';
    webconfTextSearchInput.addEventListener('input', () => {
      state.webconfFilters.texto = webconfTextSearchInput.value || '';
      renderWebconfRegistros();
    });
  }
}

function setupWebconfWizard() {
  const openBtn = document.getElementById('btn-open-webconf-modal');
  const closeBtn = document.getElementById('btn-close-webconf-modal');
  const closeParticipantesBtn = document.getElementById('btn-close-webconf-participantes');
  const closeEditBtn = document.getElementById('btn-close-webconf-edit');
  const saveEditBtn = document.getElementById('btn-save-webconf-edit');
  const pNome = document.getElementById('webconf-p-nome');
  const webconfDataInput = document.getElementById('webconf-data');
  const pCpf = document.getElementById('webconf-p-cpf');
  const pMunicipio = document.getElementById('webconf-p-municipio');
  const pUf = document.getElementById('webconf-p-uf');
  const pCpfHint = document.getElementById('webconf-p-cpf-hint');
  const editNome = document.getElementById('webconf-edit-nome');
  const editCpf = document.getElementById('webconf-edit-cpf');
  const editMunicipio = document.getElementById('webconf-edit-municipio');
  const editUf = document.getElementById('webconf-edit-uf');
  const editCpfHint = document.getElementById('webconf-edit-cpf-hint');
  if (!openBtn || !closeBtn || !closeParticipantesBtn || !closeEditBtn || !saveEditBtn) return;

  openBtn.addEventListener('click', () => openWebconfWizard());
  closeBtn.addEventListener('click', () => closeModal(modalWebconfWizard));
  closeParticipantesBtn.addEventListener('click', () => closeModal(modalWebconfParticipantes));
  closeEditBtn.addEventListener('click', () => {
    webconfEditIndex = -1;
    closeModal(modalWebconfEditParticipante);
  });
  // Não fechar ao clicar fora: fechamento somente no botão X.
  modalWebconfWizard.addEventListener('click', () => {});
  modalWebconfParticipantes.addEventListener('click', () => {});
  modalWebconfEditParticipante.addEventListener('click', () => {});

  if (pNome) {
    pNome.addEventListener('input', () => { pNome.value = toLetters(pNome.value); });
  }
  if (webconfDataInput) {
    webconfDataInput.addEventListener('input', () => {
      webconfDataInput.value = maskDateInput(webconfDataInput.value);
    });
  }
  if (pMunicipio) {
    pMunicipio.addEventListener('input', () => { pMunicipio.value = toLetters(pMunicipio.value); });
  }
  if (pUf) {
    pUf.addEventListener('input', () => { pUf.value = toLetters(pUf.value).toUpperCase().slice(0, 2); });
  }
  if (pCpf) {
    pCpf.addEventListener('input', () => {
      pCpf.value = toDigits(pCpf.value).slice(0, 11);
      paintCpfHint(pCpfHint, isCpfLengthValid(pCpf.value));
    });
  }
  if (editNome) {
    editNome.addEventListener('input', () => { editNome.value = toLetters(editNome.value); });
  }
  if (editMunicipio) {
    editMunicipio.addEventListener('input', () => { editMunicipio.value = toLetters(editMunicipio.value); });
  }
  if (editUf) {
    editUf.addEventListener('input', () => { editUf.value = toLetters(editUf.value).toUpperCase().slice(0, 2); });
  }
  if (editCpf) {
    editCpf.addEventListener('input', () => {
      editCpf.value = toDigits(editCpf.value).slice(0, 11);
      paintCpfHint(editCpfHint, isCpfLengthValid(editCpf.value));
    });
  }

  document.getElementById('webconf-next-1').addEventListener('click', async () => {
    state.webconfDraft.qualWebconferencia = document.getElementById('webconf-qual').value.trim();
    await fillWebconfAgendaDefaults(state.webconfDraft.qualWebconferencia);
    setWebconfStep(2);
  });
  document.getElementById('webconf-back-2').addEventListener('click', () => setWebconfStep(1));
  document.getElementById('webconf-next-2').addEventListener('click', () => {
    state.webconfDraft.data = document.getElementById('webconf-data').value.trim();
    state.webconfDraft.horario = document.getElementById('webconf-horario').value.trim();
    state.webconfDraft.enteCompareceu = selectedEnteCompareceuValue();
    setWebconfStep(3);
  });
  document.getElementById('webconf-back-3').addEventListener('click', () => setWebconfStep(2));

  document.getElementById('webconf-add-participante').addEventListener('click', () => {
    if (!isCpfLengthValid(pCpf?.value || '')) {
      void showStatus('erro', 'CPF inválido: informe 11 dígitos');
      paintCpfHint(pCpfHint, false);
      return;
    }
    state.webconfDraft.participants.push({
      nome: toLetters(document.getElementById('webconf-p-nome').value).trim(),
      cpf: toDigits(document.getElementById('webconf-p-cpf').value),
      municipio: toLetters(document.getElementById('webconf-p-municipio').value).trim(),
      uf: toLetters(document.getElementById('webconf-p-uf').value).trim().toUpperCase().slice(0, 2),
      descricao: document.getElementById('webconf-p-descricao').value.trim()
    });
    document.getElementById('webconf-p-nome').value = '';
    document.getElementById('webconf-p-cpf').value = '';
    document.getElementById('webconf-p-municipio').value = '';
    document.getElementById('webconf-p-uf').value = '';
    document.getElementById('webconf-p-descricao').value = '';
    paintCpfHint(pCpfHint, false);
    syncWebconfParticipantTable();
  });

  saveEditBtn.addEventListener('click', async () => {
    if (webconfEditIndex < 0 || webconfEditIndex >= state.webconfDraft.participants.length) return;
    if (!isCpfLengthValid(editCpf?.value || '')) {
      await showStatus('erro', 'CPF inválido: informe 11 dígitos');
      paintCpfHint(editCpfHint, false);
      return;
    }
    state.webconfDraft.participants[webconfEditIndex] = {
      nome: toLetters(document.getElementById('webconf-edit-nome').value).trim(),
      cpf: toDigits(document.getElementById('webconf-edit-cpf').value),
      municipio: toLetters(document.getElementById('webconf-edit-municipio').value).trim(),
      uf: toLetters(document.getElementById('webconf-edit-uf').value).trim().toUpperCase().slice(0, 2),
      descricao: document.getElementById('webconf-edit-descricao').value.trim()
    };
    syncWebconfParticipantTable();
    webconfEditIndex = -1;
    closeModal(modalWebconfEditParticipante);
    await showStatus('salvo', 'Participante atualizado');
  });

  document.getElementById('webconf-save').addEventListener('click', async () => {
    state.webconfDraft.qualWebconferencia = document.getElementById('webconf-qual').value.trim();
    state.webconfDraft.data = document.getElementById('webconf-data').value.trim();
    state.webconfDraft.horario = document.getElementById('webconf-horario').value.trim();
    state.webconfDraft.enteCompareceu = selectedEnteCompareceuValue();

    try {
      await runAction('registrar webconferência', 'Salvando registro...', 'salvo', 'Registro de webconferência salvo', async () => {
        await api('/api/webconferencia/registros', {
          method: 'POST',
          body: JSON.stringify({
            qualWebconferencia: state.webconfDraft.qualWebconferencia,
            data: state.webconfDraft.data,
            horario: state.webconfDraft.horario,
            enteCompareceu: state.webconfDraft.enteCompareceu,
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
  const redirectReceivedPromise = api('/api/demandas/redirecionadas/recebidas').catch(() => ({ registros: [] }));
  const redirectSentPromise = api('/api/demandas/redirecionadas/enviadas').catch(() => ({ registros: [] }));
  const [demandas, siga, webconf, redirectsReceived, redirectsSent] = await Promise.all([
    demandasPromise,
    sigaPromise,
    webconfPromise,
    redirectReceivedPromise,
    redirectSentPromise
  ]);

  const toTime = (dateText) => {
    const match = String(dateText || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return null;
    const parsed = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
    return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
  };
  const sortByRecent = (items, dateKey) => [...items].sort((a, b) => {
    const tb = toTime(b?.[dateKey]);
    const ta = toTime(a?.[dateKey]);
    if (tb !== null && ta !== null && tb !== ta) return tb - ta;
    if (tb !== null && ta === null) return -1;
    if (tb === null && ta !== null) return 1;
    return String(b?.id || '').localeCompare(String(a?.id || ''), 'pt-BR');
  });

  state.profile = profile;
  state.demandas = sortByRecent(demandas.demandas || [], 'dataRegistro');
  state.sigaRegistros = sortByRecent(siga?.registros || [], 'dataRegistro');
  state.webconfRegistros = sortByRecent(webconf?.registros || [], 'data');
  state.redirectReceived = redirectsReceived?.registros || [];
  state.redirectSent = redirectsSent?.registros || [];

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
const btnCloseDemandaDetalhe = document.getElementById('btn-close-demanda-detalhe');
if (btnCloseDemandaDetalhe) {
  btnCloseDemandaDetalhe.addEventListener('click', () => closeModal(modalDemandaDetalhe));
}

function setupRedirectModules() {
  const btnOpenRedir = document.getElementById('btn-open-redir');
  const btnCloseRedir = document.getElementById('btn-close-redir');
  const btnCloseCriar = document.getElementById('btn-close-redir-criar');
  const btnConfirm = document.getElementById('btn-confirm-redir');
  if (!btnOpenRedir || !btnCloseRedir || !btnCloseCriar || !btnConfirm) return;

  const openPane = (pane) => {
    const recebidas = pane !== 'enviadas';
    redirTabRecebidasEl?.classList.toggle('active', recebidas);
    redirTabEnviadasEl?.classList.toggle('active', !recebidas);
    redirPaneRecebidasEl?.classList.toggle('active', recebidas);
    redirPaneEnviadasEl?.classList.toggle('active', !recebidas);
  };

  btnOpenRedir.addEventListener('click', () => {
    renderRedirectReceived();
    renderRedirectSent();
    openPane('recebidas');
    openModal(modalRedir);
  });
  btnCloseRedir.addEventListener('click', () => closeModal(modalRedir));
  btnCloseCriar.addEventListener('click', () => closeModal(modalRedirCriar));
  btnConfirm.addEventListener('click', () => void sendRedirect());
  redirTabRecebidasEl?.addEventListener('click', () => openPane('recebidas'));
  redirTabEnviadasEl?.addEventListener('click', () => openPane('enviadas'));
  redirToPickerEl?.addEventListener('click', () => {
    redirToListEl?.classList.toggle('open');
  });
  document.addEventListener('click', (event) => {
    if (!modalRedirCriar?.classList.contains('open')) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (redirToPickerEl?.contains(target) || redirToListEl?.contains(target)) return;
    redirToListEl?.classList.remove('open');
  });
}


async function refreshSilently() {
  if (document.hidden || refreshInFlight) return;
  refreshInFlight = true;
  try {
    await loadData();
    renderAtividades();
    renderDemandas();
    renderRegistrosSiga();
    renderWebconfRegistros();
    renderRedirectBadge();
    renderRedirectReceived();
    renderRedirectSent();
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
      renderRedirectBadge();
      renderRedirectReceived();
      renderRedirectSent();
      setupWhatsapp();
      setupWebconfSearch();
      setupWebconfWizard();
      setupRedirectModules();
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

