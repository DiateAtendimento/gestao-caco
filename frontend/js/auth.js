import { API_BASE_URL } from './config.js';

export function getToken() {
  return sessionStorage.getItem('token');
}

export function getUser() {
  const raw = sessionStorage.getItem('user');
  return raw ? JSON.parse(raw) : null;
}

export function setSession(token, user) {
  sessionStorage.setItem('token', token);
  sessionStorage.setItem('user', JSON.stringify(user));
}

export function clearSession() {
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('user');
}

export function applyTheme() {
  const theme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', theme);
}

function refreshThemeToggleIcon(btn) {
  if (!btn) return;
  const isDark = (document.documentElement.getAttribute('data-theme') || 'light') === 'dark';
  const icon = btn.querySelector('i');
  const text = btn.querySelector('span');
  if (icon) {
    icon.className = `bi ${isDark ? 'bi-sun-fill' : 'bi-moon-stars-fill'}`;
  } else {
    btn.textContent = isDark ? '☀' : '🌙';
  }
  if (text && btn.classList.contains('dynamic-theme-label')) {
    text.textContent = isDark ? 'Desativar modo escuro' : 'Ativar modo escuro';
  }
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'light' ? 'dark' : 'light';
  localStorage.setItem('theme', next);
  applyTheme();
  refreshThemeToggleIcon(document.getElementById('theme-toggle'));
}

export function initThemeIcon() {
  applyTheme();
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  refreshThemeToggleIcon(btn);
  btn.onclick = toggleTheme;
}

export function requireAuth(role) {
  applyTheme();
  const user = getUser();
  const token = getToken();
  if (!user || !token) {
    window.location.href = 'login.html';
    return null;
  }

  if (role && user.role !== role) {
    window.location.href = user.role === 'admin' ? 'admin.html' : 'me.html';
    return null;
  }

  return user;
}

export async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeoutMs = Number(options.timeoutMs || 20000);
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      cache: 'no-store',
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Tempo de resposta excedido. O backend pode estar iniciando, tente novamente em alguns segundos.');
    }
    throw new Error('Falha de conexão com o backend.');
  } finally {
    clearTimeout(timeoutId);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Erro na API');
  }

  return data;
}
