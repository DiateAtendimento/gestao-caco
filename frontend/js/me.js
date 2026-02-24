import { api, requireAuth, clearSession, toggleTheme } from './auth.js';
import { ACTIVITIES } from './data.js';

const user = requireAuth('colaborador');
if (!user) throw new Error('Sessão inválida');

const state = {
  profile: null,
  demandas: []
};

const atividadesEl = document.getElementById('atividades');
const demandasEl = document.getElementById('demandas');
const msgEl = document.getElementById('msg');

function showMsg(text) {
  msgEl.textContent = text || '';
}

function avatarByName(nome) {
  return nome?.trim().toLowerCase().endsWith('a') ? 'assets/icons/perfil-feminino.svg' : 'assets/icons/perfil-masculino.svg';
}

function renderAtividades() {
  atividadesEl.innerHTML = '';

  if (!state.profile?.atividades?.length) {
    atividadesEl.innerHTML = '<p>Nenhuma atividade vinculada</p>';
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
    demandasEl.innerHTML = '<tr><td colspan="4">Nenhuma demanda atribuída</td></tr>';
    return;
  }

  abertas.forEach((d) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${d.id}</td>
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

async function updateStatus(id, status) {
  try {
    await api(`/api/demandas/${encodeURIComponent(id)}/status`, {
      method: 'POST',
      body: JSON.stringify({ status })
    });
    await loadData();
    renderDemandas();
  } catch (error) {
    showMsg(error.message);
  }
}

function setupWhatsapp() {
  const block = document.getElementById('whatsapp-block');
  if (state.profile?.flags?.Whatsapp !== 'Sim') {
    block.classList.add('hidden');
    return;
  }

  block.classList.remove('hidden');

  document.getElementById('form-whatsapp').addEventListener('submit', async (event) => {
    event.preventDefault();

    try {
      await api('/api/demandas/registro-whatsapp', {
        method: 'POST',
        body: JSON.stringify({
          assunto: document.getElementById('wpp-assunto').value.trim(),
          descricao: document.getElementById('wpp-descricao').value.trim()
        })
      });
      event.target.reset();
      showMsg('Registro WhatsApp salvo.');
    } catch (error) {
      showMsg(error.message);
    }
  });
}

async function loadData() {
  const [profile, demandas] = await Promise.all([
    api('/api/profile/me'),
    api(`/api/demandas?atendente=${encodeURIComponent(user.nome)}`)
  ]);

  state.profile = profile;
  state.demandas = demandas.demandas || [];

  document.getElementById('welcome').textContent = user.nome;
  document.getElementById('profile-nome').textContent = `Nome: ${profile.nome}`;
  document.getElementById('profile-ramal').textContent = `Ramal: ${profile.ramal || '-'}`;
  document.getElementById('me-avatar').src = avatarByName(profile.nome);
}

document.getElementById('btn-logout').addEventListener('click', () => {
  clearSession();
  window.location.href = 'login.html';
});
document.getElementById('btn-theme').addEventListener('click', toggleTheme);

loadData()
  .then(() => {
    renderAtividades();
    renderDemandas();
    setupWhatsapp();
  })
  .catch((error) => showMsg(error.message));
