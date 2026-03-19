
export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function uid(prefix = 'id') {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${random}`;
}

export function fmtDate(value, options = {}) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  const withTime = options.withTime ?? true;
  const formatOptions = withTime
    ? { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }
    : { year: 'numeric', month: '2-digit', day: '2-digit' };
  return new Intl.DateTimeFormat('ko-KR', formatOptions).format(date);
}

export function fmtShortDate(value) {
  return fmtDate(value, { withTime: false });
}

export function toDatetimeLocal(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

export function slugify(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export function groupBy(list, keyGetter) {
  return list.reduce((acc, item) => {
    const key = keyGetter(item);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

export function sortByDate(list, key) {
  return [...list].sort((a, b) => new Date(a[key] || 0) - new Date(b[key] || 0));
}

export function parseQuery() {
  return new URLSearchParams(window.location.search);
}

export function isBetween(now, start, end) {
  const current = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const s = start ? new Date(start).getTime() : Number.NEGATIVE_INFINITY;
  const e = end ? new Date(end).getTime() : Number.POSITIVE_INFINITY;
  return current >= s && current <= e;
}

export function downloadTextFile(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}
