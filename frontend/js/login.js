import { api, setSession, clearSession, applyTheme, toggleTheme } from './auth.js';
import { showLoading, showStatus } from './feedback.js';

applyTheme();
let loginInFlight = false;

document.getElementById('btn-theme').addEventListener('click', toggleTheme);
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
