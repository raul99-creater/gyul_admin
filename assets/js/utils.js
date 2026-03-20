export function qs(sel, root = document) { return root.querySelector(sel); }
export function qsa(sel, root = document) { return [...root.querySelectorAll(sel)]; }
export function escapeHtml(v = '') { return String(v).replace(/[&<>\"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
export function phoneDigits(v = '') { return String(v).replace(/\D/g, ''); }
export function formatDateTime(v) {
  if (!v) return '-';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
export function formatDate(v) {
  if (!v) return '-';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
}
export function eventBucket(event) {
  const now = new Date();
  const openAt = event.registration_open_at ? new Date(event.registration_open_at) : null;
  const closeAt = event.registration_close_at ? new Date(event.registration_close_at) : null;
  if (openAt && openAt > now) return 'upcoming';
  if (closeAt && closeAt < now) return 'closed';
  if (event.status === 'closed') return 'closed';
  return 'open';
}
export function setMessage(el, message, type = 'ok') {
  if (!el) return;
  if (!message) { el.className = 'status-bar hidden'; el.textContent = ''; return; }
  el.className = `status-bar ${type === 'error' ? 'err' : 'ok'}`;
  el.textContent = message;
}
export function saveSession(key, token) { localStorage.setItem(key, token); }
export function loadSession(key) { return localStorage.getItem(key) || ''; }
export function clearSession(key) { localStorage.removeItem(key); }
export function groupBy(list, keyFn) {
  return list.reduce((acc, item) => {
    const key = keyFn(item);
    acc[key] = acc[key] || [];
    acc[key].push(item);
    return acc;
  }, {});
}
export function buildCalendar(events = []) {
  const today = new Date();
  const view = new Date(today.getFullYear(), today.getMonth(), 1);
  const firstDay = new Date(view.getFullYear(), view.getMonth(), 1);
  const lastDay = new Date(view.getFullYear(), view.getMonth()+1, 0);
  const startWeekday = firstDay.getDay();
  const days = [];
  for (let i=0;i<startWeekday;i++) days.push(null);
  for (let d=1; d<=lastDay.getDate(); d++) {
    const date = new Date(view.getFullYear(), view.getMonth(), d);
    const key = date.toISOString().slice(0,10);
    days.push({
      date,
      key,
      items: events.filter((item) => (item.starts_at || '').slice(0,10) === key).slice(0,3)
    });
  }
  return { year: view.getFullYear(), month: view.getMonth()+1, days };
}
