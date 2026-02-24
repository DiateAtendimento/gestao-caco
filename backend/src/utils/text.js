function normalizeText(value) {
  return String(value || '').trim();
}

function equalsIgnoreCase(a, b) {
  return normalizeText(a).toLowerCase() === normalizeText(b).toLowerCase();
}

module.exports = {
  normalizeText,
  equalsIgnoreCase
};
