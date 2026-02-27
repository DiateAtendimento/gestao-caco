const LOTTIE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/bodymovin/5.12.2/lottie.min.js';

const LOTTIES = {
  login: 'assets/lotties/login.json',
  carregando: 'assets/lotties/carregando.json',
  salvo: 'assets/lotties/Salvo.json',
  excluido: 'assets/lotties/excluido.json',
  atribuido: 'assets/lotties/atribuido.json',
  erro: 'assets/lotties/Error.json',
  sem_atividade: 'assets/lotties/sem-atividade.json',
  sem_atribuicao: 'assets/lotties/sem-atribuicao.json',
  atribuicao_recebida: 'assets/lotties/Rocket Lunch.json'
};

let lottieReadyPromise = null;
let uiMounted = false;
let dialogMounted = false;
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

function ensureDialogUi() {
  if (dialogMounted) return;

  const overlay = document.createElement('div');
  overlay.id = 'feedback-dialog-overlay';
  overlay.className = 'feedback-dialog-overlay hidden';
  overlay.innerHTML = `
    <div class="feedback-dialog">
      <h3 id="feedback-dialog-title"></h3>
      <p id="feedback-dialog-message"></p>
      <input id="feedback-dialog-input" class="hidden" type="text" />
      <div class="feedback-dialog-actions">
        <button id="feedback-dialog-cancel" type="button" class="btn-danger">Cancelar</button>
        <button id="feedback-dialog-confirm" type="button" class="btn-main">Confirmar</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  dialogMounted = true;
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

function lottiePath(type) {
  return LOTTIES[type] || LOTTIES.erro;
}

function waitDialogResult(setup) {
  ensureDialogUi();
  const overlay = document.getElementById('feedback-dialog-overlay');
  const titleEl = document.getElementById('feedback-dialog-title');
  const messageEl = document.getElementById('feedback-dialog-message');
  const inputEl = document.getElementById('feedback-dialog-input');
  const cancelBtn = document.getElementById('feedback-dialog-cancel');
  const confirmBtn = document.getElementById('feedback-dialog-confirm');

  return new Promise((resolve) => {
    const cleanup = () => {
      overlay.classList.add('hidden');
      cancelBtn.removeEventListener('click', onCancel);
      confirmBtn.removeEventListener('click', onConfirm);
      overlay.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKeyDown);
      inputEl.oninput = null;
      confirmBtn.disabled = false;
      cancelBtn.classList.remove('hidden');
    };

    const onCancel = () => {
      cleanup();
      resolve({ confirmed: false, value: null });
    };

    const onConfirm = () => {
      const value = inputEl.classList.contains('hidden') ? null : inputEl.value;
      cleanup();
      resolve({ confirmed: true, value });
    };

    const onBackdrop = (event) => {
      if (event.target === overlay) onCancel();
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') onCancel();
      if (event.key === 'Enter' && !confirmBtn.disabled) onConfirm();
    };

    setup({ titleEl, messageEl, inputEl, cancelBtn, confirmBtn });
    overlay.classList.remove('hidden');
    cancelBtn.addEventListener('click', onCancel);
    confirmBtn.addEventListener('click', onConfirm);
    overlay.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKeyDown);
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

  const file = lottiePath(type);
  try {
    if (toastAnimation) toastAnimation.destroy();
    toastAnimation = await playAnimation(lottieContainer, file, false);
  } catch (error) {
    console.error(`[Lottie] erro ${type}:`, error.message);
  }

  const minDurationByType = {
    atribuido: 3500,
    excluido: 3500
  };
  const finalDuration = Math.max(duration, minDurationByType[type] || 0);

  window.setTimeout(() => {
    toast.classList.add('hidden');
    if (toastAnimation) {
      toastAnimation.destroy();
      toastAnimation = null;
    }
  }, finalDuration);
}

export async function mountInlineLottie(containerIdOrElement, type, loop = true) {
  const host = typeof containerIdOrElement === 'string'
    ? document.getElementById(containerIdOrElement)
    : containerIdOrElement;
  if (!host) return null;

  host.innerHTML = '';
  const slot = document.createElement('div');
  slot.className = 'feedback-lottie-inline';
  host.appendChild(slot);

  try {
    return await playAnimation(slot, lottiePath(type), loop);
  } catch (error) {
    console.error(`[Lottie] erro inline ${type}:`, error.message);
    return null;
  }
}

export async function showAtribuicaoRecebida(nomeUsuario, duration = 5000) {
  let bubble = document.getElementById('atrib-recebida-bubble');
  if (!bubble) {
    bubble = document.createElement('div');
    bubble.id = 'atrib-recebida-bubble';
    bubble.className = 'atrib-bubble';
    bubble.innerHTML = `
      <div class="atrib-bubble-text"></div>
      <div class="atrib-bubble-lottie"></div>
    `;
    document.body.appendChild(bubble);
  }

  bubble.querySelector('.atrib-bubble-text').textContent = `${nomeUsuario}, voce recebeu uma nova atribuicao`;
  bubble.classList.remove('hidden');

  await mountInlineLottie(bubble.querySelector('.atrib-bubble-lottie'), 'atribuicao_recebida', true);

  window.setTimeout(() => {
    bubble.classList.add('hidden');
  }, duration);
}

export async function promptText(options = {}) {
  const {
    title = 'Confirmacao',
    message = '',
    placeholder = '',
    defaultValue = '',
    required = false,
    confirmLabel = 'Confirmar',
    cancelLabel = 'Cancelar'
  } = options;

  const result = await waitDialogResult(({ titleEl, messageEl, inputEl, cancelBtn, confirmBtn }) => {
    titleEl.textContent = title;
    messageEl.textContent = message;
    inputEl.classList.remove('hidden');
    inputEl.placeholder = placeholder;
    inputEl.value = defaultValue;
    cancelBtn.textContent = cancelLabel;
    confirmBtn.textContent = confirmLabel;
    confirmBtn.disabled = required && !String(inputEl.value || '').trim();
    inputEl.focus();
    inputEl.select();
    inputEl.oninput = () => {
      confirmBtn.disabled = required && !String(inputEl.value || '').trim();
    };
  });

  if (!result.confirmed) return null;
  return String(result.value || '').trim();
}

export async function showMessageDialog(options = {}) {
  const {
    title = 'Mensagem',
    message = '',
    closeLabel = 'Fechar'
  } = options;

  await waitDialogResult(({ titleEl, messageEl, inputEl, cancelBtn, confirmBtn }) => {
    titleEl.textContent = title;
    messageEl.textContent = message;
    inputEl.classList.add('hidden');
    inputEl.value = '';
    cancelBtn.classList.add('hidden');
    confirmBtn.textContent = closeLabel;
    confirmBtn.disabled = false;
    confirmBtn.focus();
  });
}
