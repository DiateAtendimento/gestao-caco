import { api, setSession, clearSession, applyTheme, toggleTheme } from './auth.js';

applyTheme();

document.getElementById('btn-theme').addEventListener('click', toggleTheme);

document.getElementById('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const nome = document.getElementById('nome').value.trim();
  const msg = document.getElementById('msg');

  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ nome })
    });

    setSession(data.token, data.user);
    window.location.href = data.user.role === 'admin' ? 'admin.html' : 'me.html';
  } catch (error) {
    msg.textContent = error.message;
  }
});

document.getElementById('btn-clear').addEventListener('click', () => {
  clearSession();
  document.getElementById('msg').textContent = 'Sessão limpa.';
});
