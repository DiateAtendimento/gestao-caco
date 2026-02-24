const LOTTIE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/bodymovin/5.12.2/lottie.min.js';

const LOTTIES = {
  login: 'assets/lotties/login.json',
  carregando: 'assets/lotties/carregando.json',
  salvo: 'assets/lotties/Salvo.json',
  excluido: 'assets/lotties/excluido.json',
  atribuido: 'assets/lotties/atribuido.json',
  erro: 'assets/lotties/Error.json'
};

let lottieReadyPromise = null;
let uiMounted = false;
let loadingAnimation = null;
let toastAnimation = null;

function ensureUi() {
  if (uiMounted) return;

  const overlay = document.createElement('div');
  overlay.id = 'feedback-loading';
  overlay.className = 'feedback-overlay hidden';
  overlay.innerHTML = `
    <div class="feedback-card">
      <div id="feedback-loading-lottie" class="feedback-lottie"></div>
      <p id="feedback-loading-text">Carregando...</p>
    </div>
  `;

  const toast = document.createElement('div');
  toast.id = 'feedback-toast';
  toast.className = 'feedback-toast hidden';
  toast.innerHTML = `
    <div class="feedback-card">
      <div id="feedback-toast-lottie" class="feedback-lottie"></div>
      <p id="feedback-toast-text"></p>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(toast);
  uiMounted = true;
}

function ensureLottieLoaded() {
  if (window.lottie) {
    return Promise.resolve(window.lottie);
  }

  if (lottieReadyPromise) {
    return lottieReadyPromise;
  }

  lottieReadyPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = LOTTIE_URL;
    script.async = true;
    script.onload = () => resolve(window.lottie);
    script.onerror = () => reject(new Error('Falha ao carregar biblioteca Lottie'));
    document.head.appendChild(script);
  });

  return lottieReadyPromise;
}

async function playAnimation(container, path, loop = false) {
  const lottie = await ensureLottieLoaded();
  return lottie.loadAnimation({
    container,
    renderer: 'svg',
    loop,
    autoplay: true,
    path
  });
}

export async function mountLoginLottie(containerId) {
  const host = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
  if (!host) return;

  host.innerHTML = '';
  const slot = document.createElement('div');
  slot.className = 'login-lottie';
  host.appendChild(slot);

  try {
    await playAnimation(slot, LOTTIES.login, true);
    console.log('[Lottie] login carregado');
  } catch (error) {
    console.error('[Lottie] erro no login:', error.message);
  }
}

export async function showLoading(message = 'Carregando...') {
  ensureUi();
  const overlay = document.getElementById('feedback-loading');
  const lottieContainer = document.getElementById('feedback-loading-lottie');
  const text = document.getElementById('feedback-loading-text');
  text.textContent = message;
  overlay.classList.remove('hidden');

  try {
    if (loadingAnimation) loadingAnimation.destroy();
    loadingAnimation = await playAnimation(lottieContainer, LOTTIES.carregando, true);
  } catch (error) {
    console.error('[Lottie] erro carregando.json:', error.message);
  }

  return {
    close() {
      overlay.classList.add('hidden');
      if (loadingAnimation) {
        loadingAnimation.destroy();
        loadingAnimation = null;
      }
    }
  };
}

export async function showStatus(type, message, duration = 2200) {
  ensureUi();
  const toast = document.getElementById('feedback-toast');
  const lottieContainer = document.getElementById('feedback-toast-lottie');
  const text = document.getElementById('feedback-toast-text');
  text.textContent = message;
  toast.classList.remove('hidden');

  const file = LOTTIES[type] || LOTTIES.erro;
  try {
    if (toastAnimation) toastAnimation.destroy();
    toastAnimation = await playAnimation(lottieContainer, file, false);
  } catch (error) {
    console.error(`[Lottie] erro ${type}:`, error.message);
  }

  window.setTimeout(() => {
    toast.classList.add('hidden');
    if (toastAnimation) {
      toastAnimation.destroy();
      toastAnimation = null;
    }
  }, duration);
}
