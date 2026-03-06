function sanitizeName(name) {
  return String(name || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const AVATAR_BASE_URL = new URL('../img/', import.meta.url);
const ICONS_BASE_URL = new URL('../assets/icons/', import.meta.url);

const AVATAR_FILES = [
  'admin.png',
  'Alexandre.png',
  'Aline.svg',
  'Allex Rodrigues.svg',
  'Andre.png',
  'Carina.png',
  'Carlos.png',
  'Charles.svg',
  'Claudia Iten.svg',
  'cobertura.png',
  'Elceane.svg',
  'Fabricia Padilha.svg',
  'Francisca.png',
  'Hildiene.svg',
  'Hugo.svg',
  'Ilusca.svg',
  'Jessiane.svg',
  'Joelma.png',
  'Leonardo Coimbra.svg',
  'Lourdes.png',
  'Luciana.svg',
  'Luiz Alves.svg',
  'Mateus.png',
  'Samara.png',
  'Thayna.png',
  'Vanderleia.png',
  'Wagner.png'
];

function toKey(value) {
  return sanitizeName(value).toLowerCase();
}

function keyVariants(name) {
  const key = toKey(name);
  const compact = key.replace(/\s+/g, '');
  const first = key.split(/\s+/)[0] || '';
  return [...new Set([key, compact, first])].filter(Boolean);
}

function buildAvatarNameMap() {
  const map = new Map();

  AVATAR_FILES.forEach((file) => {
    const baseName = file.replace(/\.[^.]+$/, '');
    const full = toKey(baseName);
    const compact = full.replace(/\s+/g, '');
    const first = full.split(/\s+/)[0] || '';

    [full, compact, first].forEach((key) => {
      if (!key || map.has(key)) return;
      map.set(key, file);
    });
  });

  return map;
}

const AVATAR_NAME_MAP = buildAvatarNameMap();

function resolveAvatarUrl(name) {
  const keys = keyVariants(name);

  for (const key of keys) {
    const file = AVATAR_NAME_MAP.get(key);
    if (file) return new URL(file, AVATAR_BASE_URL).href;
  }

  return '';
}

export function isLikelyFemale(name) {
  return String(name || '').trim().toLowerCase().endsWith('a');
}

export function attachAvatar(imgElement, name) {
  if (!imgElement) return;

  const fallback = isLikelyFemale(name)
    ? new URL('perfil-feminino.svg', ICONS_BASE_URL).href
    : new URL('perfil-masculino.svg', ICONS_BASE_URL).href;

  const resolved = resolveAvatarUrl(name);

  imgElement.onerror = () => {
    imgElement.onerror = null;
    imgElement.src = fallback;
  };

  imgElement.src = resolved || fallback;
}
