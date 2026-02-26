import { api, setSession, clearSession, initThemeIcon } from './auth.js';
import { showLoading, showStatus } from './feedback.js';

initThemeIcon();
let loginInFlight = false;

function openPrimeiroAcesso() {
  document.getElementById('modal-primeiro-acesso').classList.add('open');
}

function closePrimeiroAcesso() {
  document.getElementById('modal-primeiro-acesso').classList.remove('open');
}

document.getElementById('toggle-senha').addEventListener('click', () => {
  const senha = document.getElementById('senha');
  const current = senha.getAttribute('type');
  senha.setAttribute('type', current === 'password' ? 'text' : 'password');
});

document.getElementById('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (loginInFlight) {
    return;
  }

  const nome = document.getElementById('nome').value.trim();
  const senha = document.getElementById('senha').value.trim();
  const msg = document.getElementById('msg');
  const submitBtn = document.querySelector('#login-form button[type="submit"]');

  if (!nome || !senha) {
    msg.textContent = 'Informe nome e senha.';
    await showStatus('erro', 'Informe nome e senha');
    return;
  }

  loginInFlight = true;
  if (submitBtn) submitBtn.disabled = true;
  const loading = await showLoading('Validando acesso...');
  console.log('[Login] iniciando autenticação para:', nome);

  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ nome, senha })
    });

    setSession(data.token, data.user);
    console.log('[Login] sucesso, redirecionando para role:', data.user.role);
    await showStatus('salvo', 'Login realizado com sucesso');
    window.location.href = data.user.role === 'admin' ? 'admin.html' : 'me.html';
  } catch (error) {
    msg.textContent = error.message;
    console.error('[Login] falha:', error.message);
    await showStatus('erro', `Erro no login: ${error.message}`);
  } finally {
    loading.close();
    loginInFlight = false;
    if (submitBtn) submitBtn.disabled = false;
  }
});

document.getElementById('btn-clear').addEventListener('click', async () => {
  clearSession();
  document.getElementById('msg').textContent = 'Sessão limpa.';
  await showStatus('excluido', 'Sessão removida');
  console.log('[Login] sessão limpa manualmente');
});

document.getElementById('btn-primeiro-acesso').addEventListener('click', () => {
  openPrimeiroAcesso();
});

document.getElementById('btn-close-primeiro-acesso').addEventListener('click', () => {
  closePrimeiroAcesso();
});

document.getElementById('form-primeiro-acesso').addEventListener('submit', async (event) => {
  event.preventDefault();

  const nome = document.getElementById('pa-nome').value.trim();
  const senha = document.getElementById('pa-senha').value.trim();
  const confirmarSenha = document.getElementById('pa-senha2').value.trim();
  const msg = document.getElementById('msg');

  if (!nome || !senha || !confirmarSenha) {
    msg.textContent = 'Preencha todos os campos do primeiro acesso.';
    await showStatus('erro', 'Preencha todos os campos');
    return;
  }

  const loading = await showLoading('Configurando primeiro acesso...');
  try {
    await api('/api/auth/primeiro-acesso', {
      method: 'POST',
      body: JSON.stringify({ nome, senha, confirmarSenha })
    });
    msg.textContent = 'Primeiro acesso concluído. Agora faça login.';
    await showStatus('salvo', 'Senha cadastrada com sucesso');
    event.target.reset();
    closePrimeiroAcesso();
  } catch (error) {
    msg.textContent = error.message;
    await showStatus('erro', error.message);
  } finally {
    loading.close();
  }
});

