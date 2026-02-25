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

export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'light' ? 'dark' : 'light';
  localStorage.setItem('theme', next);
  applyTheme();
}

export function initThemeIcon() {
  applyTheme();
  let btn = document.getElementById('theme-floating-btn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'theme-floating-btn';
    btn.className = 'theme-floating-btn';
    btn.type = 'button';
    btn.title = 'Alternar modo escuro';
    btn.innerHTML = '<i class="bi bi-moon-stars-fill"></i>';
    document.body.appendChild(btn);
  }
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
