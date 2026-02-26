function sanitizeName(name) {
  return String(name || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '');
}

function candidates(name) {
  const raw = String(name || '').trim();
  const clean = sanitizeName(raw);
  const title = clean ? `${clean.charAt(0).toUpperCase()}${clean.slice(1).toLowerCase()}` : '';
  const base = ['img'];
  const exts = ['png', 'jpg', 'jpeg', 'webp', 'svg'];
  const vars = [...new Set([raw, clean, raw.toLowerCase(), clean.toLowerCase(), title])];

  const list = [];
  vars.forEach((v) => {
    if (!v) return;
    exts.forEach((ext) => {
      list.push(`${base[0]}/${v}.${ext}`);
    });
  });
  return list;
}

export function isLikelyFemale(name) {
  return String(name || '').trim().toLowerCase().endsWith('a');
}

export function attachAvatar(imgElement, name) {
  if (!imgElement) return;

  const fallback = isLikelyFemale(name)
    ? 'assets/icons/perfil-feminino.svg'
    : 'assets/icons/perfil-masculino.svg';

  const tries = candidates(name);
  let index = 0;

  function next() {
    if (index >= tries.length) {
      imgElement.onerror = null;
      imgElement.src = fallback;
      return;
    }
    imgElement.src = tries[index];
    index += 1;
  }

  imgElement.onerror = next;
  next();
}
