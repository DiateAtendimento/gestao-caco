function sanitizeName(name) {
  return String(name || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function candidates(name) {
  const raw = String(name || '').trim();
  const clean = sanitizeName(raw);
  const firstRaw = raw.split(/\s+/)[0] || '';
  const firstClean = clean.split(/\s+/)[0] || '';
  const compact = clean.replace(/\s+/g, '');
  const compactFirst = firstClean.replace(/\s+/g, '');
  const title = compact ? `${compact.charAt(0).toUpperCase()}${compact.slice(1).toLowerCase()}` : '';
  const titleFirst = compactFirst ? `${compactFirst.charAt(0).toUpperCase()}${compactFirst.slice(1).toLowerCase()}` : '';
  const base = ['img'];
  const exts = ['png', 'jpg', 'jpeg', 'webp', 'svg'];
  const vars = [...new Set([
    raw,
    clean,
    firstRaw,
    firstClean,
    compact,
    compactFirst,
    raw.toLowerCase(),
    clean.toLowerCase(),
    firstRaw.toLowerCase(),
    firstClean.toLowerCase(),
    compact.toLowerCase(),
    compactFirst.toLowerCase(),
    title,
    titleFirst
  ])];

  const manualAliases = [];
  const norm = clean.toLowerCase();
  if (norm.includes('wagner')) manualAliases.push('Wagner', 'wagner');
  if (norm.includes('cobertura')) manualAliases.push('cobertura', 'Cobertura');
  if (norm.includes('thayna')) manualAliases.push('Thayna', 'thayna', 'Thayná', 'thayná');

  const list = [];
  [...vars, ...manualAliases].forEach((v) => {
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
