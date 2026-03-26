const APP_CONFIG = {
  supabaseUrl: 'https://pxmiohzuqoztnhablbfy.supabase.co',
  supabasePublishableKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4bWlvaHp1cW96dG5oYWJsYmZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NTEwNjQsImV4cCI6MjA4OTQyNzA2NH0.vK4ogWq0ksoa3NLFkJp-Z6ez7cszAoGXx68sipLgwC4',
  siteName: '귤귤 일정관리',
  sessionStorageKey: 'gyulgyul_admin_session_v1',
  mainAppUrl: 'https://gyul-main.vercel.app'
};

function qs(sel, root = document) { return root.querySelector(sel); }
function qsa(sel, root = document) { return [...root.querySelectorAll(sel)]; }
function escapeHtml(v = '') { return String(v).replace(/[&<>\"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function phoneDigits(v = '') { return String(v).replace(/\D/g, ''); }
function formatDateTime(v) {
  if (!v) return '-';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function formatDate(v) {
  if (!v) return '-';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
}
function eventBucket(event) {
  const now = new Date();
  const openAt = event.registration_open_at ? new Date(event.registration_open_at) : null;
  const closeAt = event.registration_close_at ? new Date(event.registration_close_at) : null;
  if (openAt && openAt > now) return 'upcoming';
  if (closeAt && closeAt < now) return 'closed';
  if (event.status === 'closed') return 'closed';
  return 'open';
}
function setMessage(el, message, type = 'ok') {
  if (!el) return;
  if (!message) { el.className = 'status-bar hidden'; el.textContent = ''; return; }
  el.className = `status-bar ${type === 'error' ? 'err' : 'ok'}`;
  el.textContent = message;
}
function saveSession(key, token) { localStorage.setItem(key, token); }
function loadSession(key) { return localStorage.getItem(key) || ''; }
function clearSession(key) { localStorage.removeItem(key); }
function groupBy(list, keyFn) {
  return list.reduce((acc, item) => {
    const key = keyFn(item);
    acc[key] = acc[key] || [];
    acc[key].push(item);
    return acc;
  }, {});
}
function buildCalendar(events = []) {
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


async function apiFetch(path, { method = 'GET', body = null, prefer = null } = {}) {
  const headers = {
    'apikey': APP_CONFIG.supabasePublishableKey,
    'Authorization': `Bearer ${APP_CONFIG.supabasePublishableKey}`
  };
  if (body !== null) headers['Content-Type'] = 'application/json';
  if (prefer) headers['Prefer'] = prefer;
  const res = await fetch(`${APP_CONFIG.supabaseUrl}${path}`, {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const message = data?.message || data?.hint || data?.error_description || data?.error || text || `${res.status} ${res.statusText}`;
    throw new Error(message);
  }
  return data;
}

async function rpc(name, params = {}) {
  return apiFetch(`/rest/v1/rpc/${name}`, { method: 'POST', body: params || {} });
}

async function supportTableSelect(courseId) {
  const qp = new URLSearchParams();
  qp.set('select', '*');
  if (courseId) qp.set('course_id', `eq.${courseId}`);
  qp.set('order', 'sort_order.asc,created_at.desc');
  const data = await apiFetch(`/rest/v1/course_support_links?${qp.toString()}`);
  return (data || []).map((row) => ({
    ...row,
    label: row.label || row.title || row.name || row.item || '',
    title: row.title || row.label || row.name || row.item || '',
    url: row.url || row.link || row.openchat_url || ''
  }));
}

async function supportTableInsert(payload) {
  const row = {
    course_id: payload.course_id,
    title: payload.label || payload.title || '',
    label: payload.label || payload.title || '',
    url: payload.url || '',
    sort_order: payload.sort_order || 10
  };
  const data = await apiFetch('/rest/v1/course_support_links?select=id', { method: 'POST', body: row, prefer: 'return=representation' });
  return Array.isArray(data) ? data[0]?.id : data?.id;
}

async function supportTableUpdate(supportId, label, url, sortOrder, courseId = null) {
  const qp = new URLSearchParams();
  qp.set('id', `eq.${supportId}`);
  if (courseId) qp.set('course_id', `eq.${courseId}`);
  await apiFetch(`/rest/v1/course_support_links?${qp.toString()}`, {
    method: 'PATCH',
    body: { title: label, label, url, sort_order: sortOrder || 10 },
    prefer: 'return=minimal'
  });
  return { ok: true };
}

async function supportTableDelete(supportId) {
  const qp = new URLSearchParams();
  qp.set('id', `eq.${supportId}`);
  await apiFetch(`/rest/v1/course_support_links?${qp.toString()}`, { method: 'DELETE', prefer: 'return=minimal' });
  return { ok: true };
}

const api = {
  listCourses() { return rpc('app_public_list_courses'); },
  signIn(login, secret) { return rpc('app_admin_sign_in', { p_login: login, p_secret: secret }); },
  requestSignup(fullName, phone, requestedCourseId, memo) {
    return rpc('app_admin_request_signup', {
      p_full_name: fullName,
      p_phone: phone,
      p_requested_course_id: requestedCourseId || null,
      p_memo: memo || ''
    });
  },
  getBootstrap(sessionToken) { return rpc('app_admin_get_bootstrap', { p_session_token: sessionToken }); },
  saveCourse(sessionToken, payload) { return rpc('app_admin_save_course', { p_session_token: sessionToken, p_course: payload }); },
  saveSchedule(sessionToken, payload) { return rpc('app_admin_save_schedule', { p_session_token: sessionToken, p_item: payload }); },
  saveAssignment(sessionToken, payload) { return rpc('app_admin_save_assignment', { p_session_token: sessionToken, p_item: payload }); },
  saveEvent(sessionToken, payload) { return rpc('app_admin_save_event', { p_session_token: sessionToken, p_item: payload }); },
  saveToken(sessionToken, payload) { return rpc('app_admin_save_token', { p_session_token: sessionToken, p_item: payload }); },
  async listSupportLinks(sessionToken, courseId) {
    const tryCalls = [
      () => rpc('app_admin_list_support_links', { p_session_token: sessionToken, p_course_id: courseId }),
      () => rpc('app_admin_list_support_links', { p_course_id: courseId, p_session_token: sessionToken }),
      () => rpc('app_admin_list_support_links', { p_course_id: courseId }),
      () => rpc('app_admin_list_support_links', courseId ? { course_id: courseId } : {}),
      () => supportTableSelect(courseId)
    ];
    let lastErr;
    for (const fn of tryCalls) {
      try {
        const data = await fn();
        const rows = Array.isArray(data) ? data : (data?.items || data?.data || []);
        return rows.map((row) => ({
          ...row,
          label: row.label || row.title || row.name || row.item || '',
          title: row.title || row.label || row.name || row.item || '',
          url: row.url || row.link || row.openchat_url || ''
        }));
      } catch (e) { lastErr = e; }
    }
    throw lastErr;
  },
  async saveSupportLink(sessionToken, payload) {
    const tryCalls = [
      () => rpc('app_admin_save_support_link', {
        p_session_token: sessionToken,
        p_course_id: payload.course_id,
        p_title: payload.label || payload.title || '',
        p_url: payload.url || '',
        p_sort_order: payload.sort_order || 10
      }),
      () => rpc('app_admin_save_support_link', {
        p_course_id: payload.course_id,
        p_title: payload.label || payload.title || '',
        p_url: payload.url || '',
        p_sort_order: payload.sort_order || 10
      }),
      () => supportTableInsert(payload)
    ];
    let lastErr;
    for (const fn of tryCalls) {
      try {
        const data = await fn();
        return { ok: true, id: data?.id || data };
      } catch (e) { lastErr = e; }
    }
    throw lastErr;
  },
  async updateSupportLink(sessionToken, supportId, label, url, sortOrder, courseId = null) {
    const tryCalls = [
      () => rpc('app_admin_update_support_link', {
        p_session_token: sessionToken,
        p_course_id: courseId,
        p_id: supportId,
        p_title: label,
        p_url: url,
        p_sort_order: sortOrder || 10
      }),
      () => rpc('app_admin_update_support_link', {
        p_session_token: sessionToken,
        p_id: supportId,
        p_title: label,
        p_url: url,
        p_sort_order: sortOrder || 10
      }),
      () => rpc('app_admin_update_support_link', {
        p_support_id: supportId,
        p_label: label,
        p_url: url,
        p_sort_order: sortOrder || 10
      }),
      () => supportTableUpdate(supportId, label, url, sortOrder, courseId)
    ];
    let lastErr;
    for (const fn of tryCalls) {
      try { await fn(); return { ok: true }; } catch (e) { lastErr = e; }
    }
    throw lastErr;
  },
  async deleteSupportLink(sessionToken, supportId) {
    const tryCalls = [
      () => rpc('app_admin_delete_support_link', { p_session_token: sessionToken, p_id: supportId }),
      () => rpc('app_admin_delete_support_link', { p_session_token: sessionToken, p_support_id: supportId }),
      () => rpc('app_admin_delete_support_link', { p_id: supportId }),
      () => supportTableDelete(supportId)
    ];
    let lastErr;
    for (const fn of tryCalls) {
      try { await fn(); return { ok: true }; } catch (e) { lastErr = e; }
    }
    throw lastErr;
  },
  deleteItem(sessionToken, kind, id) { return rpc('app_admin_delete_item', { p_session_token: sessionToken, p_kind: kind, p_id: id }); },
  deleteMembership(sessionToken, courseId, profileId) { return rpc('app_admin_delete_membership', { p_session_token: sessionToken, p_course_id: courseId, p_profile_id: profileId }); },
  upsertMember(sessionToken, courseId, fullName, phone) {
    return rpc('app_admin_upsert_member', {
      p_session_token: sessionToken,
      p_course_id: courseId,
      p_full_name: fullName,
      p_phone: phone
    });
  },
  assignRole(sessionToken, profileId, roleType, courseId) {
    return rpc('app_admin_assign_role', {
      p_session_token: sessionToken,
      p_profile_id: profileId,
      p_role_type: roleType,
      p_course_id: courseId || null
    });
  },
  resolveRequest(sessionToken, requestId, status, courseId) {
    return rpc('app_admin_resolve_request', {
      p_session_token: sessionToken,
      p_request_id: requestId,
      p_status: status,
      p_course_id: courseId || null
    });
  },
  deleteRole(sessionToken, profileId, roleType, courseId) {
    return rpc('app_admin_delete_role', {
      p_session_token: sessionToken,
      p_profile_id: profileId,
      p_role_type: roleType,
      p_course_id: courseId || null
    });
  },
  deleteProfile(sessionToken, profileId) {
    return rpc('app_admin_delete_profile', {
      p_session_token: sessionToken,
      p_profile_id: profileId
    });
  },
  signOut(sessionToken) { return rpc('app_sign_out', { p_session_token: sessionToken }); }
};


const sessionKey = APP_CONFIG.sessionStorageKey;
const sidebarKey = `${APP_CONFIG.sessionStorageKey}:sidebarCollapsed`;
const state = {
  sessionToken: '',
  bootstrap: null,
  publicCourses: [],
  selectedCourseId: '',
  eventQuestions: [],
  editingCourseId: '',
  editingScheduleId: '',
  editingAssignmentId: '',
  editingEventId: '',
  editingTokenId: '',
  responseSchemaMap: {},
  supportLinks: [],
  editingSupportId: '',
  sidebarCollapsed: false
};

function ensureTitle() {
  document.title = APP_CONFIG.siteName;
  qsa('[data-site-name]').forEach((el) => { el.textContent = APP_CONFIG.siteName; });
}


function applyLoginQueryParams() {
  const params = new URLSearchParams(window.location.search);
  const login = params.get('login') || '';
  const secret = params.get('secret') || '';
  const form = qs('#admin-login-form');
  if (!form) return;
  if (login) form.querySelector('[name="login"]').value = login;
  if (secret) form.querySelector('[name="secret"]').value = secret;
}

function mapAuthError(err) {
  const raw = String(err?.message || err || '').trim();
  const msg = raw.toLowerCase();
  if (msg.includes('invalid api key') || msg.includes('apikey') || msg.includes('invalid jwt')) {
    return 'Supabase API 키가 올바르지 않습니다. Settings > API에서 anon 또는 publishable key를 다시 넣어주세요.';
  }
  if (msg.includes('failed to fetch') || msg.includes('network')) {
    return '서버에 연결하지 못했습니다. Vercel 주소, CORS, 인터넷 연결을 확인해주세요.';
  }
  return raw || '요청에 실패했습니다.';
}

function formatCohortLabel(value = '') {
  const v = String(value || '').trim();
  if (!v) return '';
  return /기$/.test(v) ? v : `${v}기`;
}

function buildCourseTitle(instructorName = '', cohortLabel = '') {
  const name = String(instructorName || '').trim();
  const cohort = formatCohortLabel(cohortLabel);
  return [name, cohort].filter(Boolean).join(' ').trim();
}

function buildSignupUrl(token = '') {
  const configured = String(APP_CONFIG.mainAppUrl || '').trim().replace(/\/$/, '');
  if (configured) return `${configured}/signup.html?token=${token}`;
  const guessedOrigin = window.location.origin
    .replace('-admin.vercel.app', '-main.vercel.app')
    .replace('admin.', '');
  return `${guessedOrigin}/signup.html?token=${token}`;
}

function instructorGroups(list = []) {
  return Object.entries(groupBy(list, (item) => item.instructor_name || '기타')).sort((a, b) => a[0].localeCompare(b[0], 'ko'));
}

function getSelectedCourse() {
  return (state.bootstrap?.courses || []).find((c) => c.id === state.selectedCourseId) || null;
}

function scoped(list = []) {
  return list.filter((item) => !state.selectedCourseId || item.course_id === state.selectedCourseId);
}

function selectedMembers() { return scoped(state.bootstrap?.memberships || []); }
function selectedTokens() { return scoped(state.bootstrap?.tokens || []); }
function primaryToken() { return selectedTokens()[0] || null; }
function selectedSupportLinks() { return state.supportLinks || []; }
function eventApplications(eventId) { return (state.bootstrap?.applications || []).filter((item) => item.event_id === eventId); }
function xlsxAvailable() { return typeof window !== 'undefined' && !!window.XLSX; }
function normalizePhoneDigits(value=''){ return String(value||'').replace(/\D/g,''); }
function exportRowsXlsx(filename, rows = []) {
  if (!xlsxAvailable()) { setMessage(qs('#app-message'), '엑셀 라이브러리를 불러오지 못했습니다.', 'error'); return; }
  const ws = window.XLSX.utils.json_to_sheet(rows);
  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  window.XLSX.writeFile(wb, filename);
}
async function ensureSignupLink() {
  const existing = primaryToken();
  if (existing) return existing;
  const res = await api.saveToken(state.sessionToken, {
    course_id: state.selectedCourseId,
    token_name: '기본 가입 링크',
    max_uses: null,
    welcome_message: '',
    is_active: true
  });
  if (!res?.ok) throw new Error(res?.message || '가입 링크 생성에 실패했습니다.');
  await refreshBootstrap();
  return primaryToken();
}
function closeResponsesModal() { const modal = qs('#responses-modal'); if (modal) modal.hidden = true; }
function closeMembersModal() { const modal = qs('#members-modal'); if (modal) modal.hidden = true; }
function openModal(id) { const modal = qs(`#${id}`); if (modal) modal.hidden = false; }
function closeModal(id) { const modal = qs(`#${id}`); if (modal) modal.hidden = true; }
function wireFeatureModals() {
  qsa('[data-open-modal]').forEach((btn) => btn.addEventListener('click', () => openModal(btn.dataset.openModal)));
  qsa('[data-close-modal]').forEach((btn) => btn.addEventListener('click', () => closeModal(btn.dataset.closeModal)));
}
function openMembersModal() {
  const modal = qs('#members-modal');
  const title = qs('#members-modal-title');
  const subtitle = qs('#members-modal-subtitle');
  const table = qs('#members-modal-table');
  const course = getSelectedCourse();
  const members = selectedMembers();
  if (!modal || !table) return;
  title.textContent = '회원 명단';
  subtitle.textContent = course ? `${course.instructor_name} ${formatCohortLabel(course.cohort_label)} · 총 ${members.length}명` : '';
  table.innerHTML = members.length ? `<table><thead><tr><th>이름</th><th>전화번호</th><th>등록일</th><th></th></tr></thead><tbody>${members.map((item) => `<tr><td>${escapeHtml(item.full_name)}</td><td>${escapeHtml(item.phone)}</td><td>${formatDate(item.created_at)}</td><td class="text-right"><button class="btn btn-danger small" data-delete-member-profile="${item.profile_id || ''}" data-delete-member-course="${item.course_id || ''}">수강삭제</button>${state.bootstrap?.is_super_admin ? ` <button class="btn btn-secondary small" data-hard-delete-profile="${item.profile_id || ''}">회원삭제</button>` : ''}</td></tr>`).join('')}</tbody></table>` : '<div class="empty-state">등록된 회원이 없습니다.</div>';
  qsa('[data-delete-member-profile]', table).forEach((btn) => btn.addEventListener('click', async () => {
    const profileId = btn.dataset.deleteMemberProfile;
    const courseId = btn.dataset.deleteMemberCourse;
    await removeMembership(courseId, profileId);
  }));
  qsa('[data-hard-delete-profile]', table).forEach((btn) => btn.addEventListener('click', async () => {
    await hardDeleteProfile(btn.dataset.hardDeleteProfile);
  }));
  modal.hidden = false;
  qs('#export-members-btn').onclick = () => exportRowsXlsx(`${course?.title || 'members'}_회원명단.xlsx`, members.map((item) => ({ 이름: item.full_name, 전화번호: item.phone, 등록일: formatDate(item.created_at) })));
}

async function removeMembership(courseId, profileId) {
  if (!courseId || !profileId) {
    setMessage(qs('#app-message'), '회원 식별값을 찾지 못했습니다. 서버 패치를 적용한 뒤 다시 시도해주세요.', 'error');
    return;
  }
  if (!confirm('이 회원을 해당 강의에서 삭제하시겠습니까?')) return;
  try {
    const res = await api.deleteMembership(state.sessionToken, courseId, profileId);
    if (!res?.ok) throw new Error(res?.message || '회원 삭제에 실패했습니다.');
    await refreshBootstrap();
    openMembersModal();
  } catch (err) {
    setMessage(qs('#app-message'), err.message || '회원 삭제에 실패했습니다.', 'error');
  }
}

function applySidebarState() {
  const sidebar = qs('#sidebar-root');
  const button = qs('#sidebar-toggle-btn');
  if (!sidebar) return;
  sidebar.classList.toggle('collapsed', !!state.sidebarCollapsed);
  if (button) button.textContent = state.sidebarCollapsed ? '패널 열기' : '패널 접기';
}

function initSidebarToggle() {
  state.sidebarCollapsed = localStorage.getItem(sidebarKey) === '1';
  applySidebarState();
  qs('#sidebar-toggle-btn')?.addEventListener('click', () => {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    localStorage.setItem(sidebarKey, state.sidebarCollapsed ? '1' : '0');
    applySidebarState();
  });
}

function renderResponseDetail(app) {
  const detail = qs('#responses-detail');
  if (!detail) return;
  if (!app) { detail.innerHTML = '<div class="empty-state">응답자를 선택해주세요.</div>'; return; }
  const answers = app.answers || {};
  const answerEntries = Object.entries(answers).map(([key, value]) => [state.responseSchemaMap[key] || key, value]);
  detail.innerHTML = `<div class="response-answer-box"><div class="notice-box"><div class="kv-list"><div class="kv-row"><strong>이름</strong><span>${escapeHtml(app.full_name || '')}</span></div><div class="kv-row"><strong>전화번호</strong><span>${escapeHtml(app.phone || '')}</span></div><div class="kv-row"><strong>응답일</strong><span>${formatDateTime(app.created_at)}</span></div></div></div>${answerEntries.length ? answerEntries.map(([key, value]) => `<div class="response-answer-item"><strong>${escapeHtml(key)}</strong><div style="margin-top:6px">${escapeHtml(typeof value === 'string' ? value : JSON.stringify(value))}</div></div>`).join('') : '<div class="empty-state">응답 내용이 없습니다.</div>'}</div>`;
}
function openResponsesModal(eventId) {
  const modal = qs('#responses-modal');
  const title = qs('#responses-modal-title');
  const subtitle = qs('#responses-modal-subtitle');
  const listWrap = qs('#responses-list');
  const event = (state.bootstrap?.events || []).find((item) => item.id === eventId);
  const apps = eventApplications(eventId);
  state.responseSchemaMap = Object.fromEntries((event.form_schema || []).map((q) => [q.id, q.label || q.id]));
  if (!modal || !event) return;
  title.textContent = event.title;
  subtitle.textContent = `응답 ${apps.length}건`;
  listWrap.innerHTML = apps.length ? apps.map((app, idx) => `<button class="response-person-btn ${idx === 0 ? 'active' : ''}" type="button" data-response-index="${idx}"><span>${escapeHtml(app.full_name || '응답자')}</span><small>${escapeHtml(app.phone || '')}</small></button>`).join('') : '<div class="empty-state">응답 내역이 없습니다.</div>';
  const sync = (idx) => {
    qsa('[data-response-index]', listWrap).forEach((btn) => btn.classList.toggle('active', Number(btn.dataset.responseIndex) === idx));
    renderResponseDetail(apps[idx] || null);
  };
  qsa('[data-response-index]', listWrap).forEach((btn) => btn.addEventListener('click', () => sync(Number(btn.dataset.responseIndex))));
  sync(0);
  modal.hidden = false;
  qs('#export-responses-btn').onclick = () => exportRowsXlsx(`${event.title}_응답내역.xlsx`, apps.map((app) => ({ 이름: app.full_name, 전화번호: app.phone, 응답일: formatDateTime(app.created_at), ...app.answers })));
}

function openCourseModal() {
  const modal = qs('#course-modal');
  if (modal) modal.hidden = false;
}

function closeCourseModal() {
  const modal = qs('#course-modal');
  if (modal) modal.hidden = true;
}

function resetCourseForm() {
  state.editingCourseId = '';
  const form = qs('#course-form');
  form?.reset();
}

function resetSupportForm() {
  state.editingSupportId = '';
  const form = qs('#support-form');
  form?.reset();
}

function fillSupportForm(id) {
  const item = selectedSupportLinks().find((row) => row.id === id);
  if (!item) return;
  state.editingSupportId = id;
  const form = qs('#support-form');
  if (!form) return;
  form.querySelector('[name="label"]').value = item.label || item.title || '';
  form.querySelector('[name="url"]').value = item.url || '';
  form.querySelector('[name="sort_order"]').value = item.sort_order || '';
  openModal('support-modal');
}

async function hardDeleteProfile(profileId) {
  if (!profileId) return;
  if (!confirm('이 회원 정보를 전체 삭제하시겠습니까? 모든 강의 배정과 프로필이 삭제됩니다.')) return;
  try {
    const res = await api.deleteProfile(state.sessionToken, profileId);
    if (!res?.ok) throw new Error(res?.message || '회원 삭제에 실패했습니다.');
    await refreshBootstrap();
    openMembersModal();
  } catch (err) {
    setMessage(qs('#app-message'), err.message || '회원 삭제에 실패했습니다.', 'error');
  }
}

function resetEventBuilder(questions = []) {
  state.eventQuestions = JSON.parse(JSON.stringify(questions || []));
  renderQuestionBuilder();
}

function emptyChoiceQuestion() {
  return {
    id: `q_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
    type: 'choice',
    label: '',
    required: true,
    options: [{ value: '', label: '', limit: '' }]
  };
}

function renderQuestionBuilder() {
  const wrap = qs('#question-builder');
  if (!wrap) return;
  if (!state.eventQuestions.length) {
    wrap.innerHTML = '<div class="empty-state">문항을 추가해주세요.</div>';
    return;
  }
  wrap.innerHTML = state.eventQuestions.map((q, idx) => `
    <div class="question-card" data-q-index="${idx}">
      <div class="grid-2">
        <div class="field"><label>문항 제목</label><input class="input" data-q-field="label" value="${escapeHtml(q.label || '')}"></div>
        <div class="field"><label>문항 유형</label>
          <select class="select" data-q-field="type">
            <option value="short" ${q.type === 'short' ? 'selected' : ''}>단답형</option>
            <option value="paragraph" ${q.type === 'paragraph' ? 'selected' : ''}>장문형</option>
            <option value="choice" ${q.type === 'choice' ? 'selected' : ''}>객관식</option>
          </select>
        </div>
      </div>
      <div class="row" style="margin-top:8px">
        <label class="row"><input type="checkbox" data-q-field="required" ${q.required ? 'checked' : ''}> 필수</label>
        <button class="btn btn-secondary small" type="button" data-remove-question="${idx}">문항 삭제</button>
      </div>
      ${q.type === 'choice' ? `
        <div class="stack" style="margin-top:12px">
          ${(q.options || []).map((opt, optIdx) => `
            <div class="option-row" data-opt-index="${optIdx}">
              <input class="input" data-opt-field="label" placeholder="항목명" value="${escapeHtml(opt.label || '')}">
              <input class="input" data-opt-field="limit" placeholder="마감 수" value="${escapeHtml(opt.limit || '')}">
              <button class="btn btn-ghost small" type="button" data-remove-option="${idx}:${optIdx}">삭제</button>
            </div>
          `).join('')}
          <button class="btn btn-secondary small" type="button" data-add-option="${idx}">항목 추가</button>
        </div>
      ` : ''}
    </div>
  `).join('');

  qsa('[data-q-index]').forEach((card) => {
    const qIndex = Number(card.dataset.qIndex);
    qsa('[data-q-field]', card).forEach((input) => {
      const sync = () => {
        const field = input.dataset.qField;
        state.eventQuestions[qIndex][field] = input.type === 'checkbox' ? input.checked : input.value;
        if (field === 'type') {
          if (input.value === 'choice' && !state.eventQuestions[qIndex].options) state.eventQuestions[qIndex].options = [{ value: '', label: '', limit: '' }];
          renderQuestionBuilder();
        }
      };
      input.addEventListener('input', sync);
      input.addEventListener('change', sync);
    });
    qsa('[data-opt-index]', card).forEach((row) => {
      const optIdx = Number(row.dataset.optIndex);
      qsa('[data-opt-field]', row).forEach((input) => {
        input.addEventListener('input', () => {
          const field = input.dataset.optField;
          if (field === 'label') {
            state.eventQuestions[qIndex].options[optIdx].label = input.value;
            state.eventQuestions[qIndex].options[optIdx].value = input.value;
          } else {
            state.eventQuestions[qIndex].options[optIdx].limit = input.value;
          }
        });
      });
    });
  });

  qsa('[data-remove-question]').forEach((btn) => btn.addEventListener('click', () => {
    state.eventQuestions.splice(Number(btn.dataset.removeQuestion), 1);
    renderQuestionBuilder();
  }));
  qsa('[data-add-option]').forEach((btn) => btn.addEventListener('click', () => {
    state.eventQuestions[Number(btn.dataset.addOption)].options.push({ value: '', label: '', limit: '' });
    renderQuestionBuilder();
  }));
  qsa('[data-remove-option]').forEach((btn) => btn.addEventListener('click', () => {
    const [qIdx, optIdx] = btn.dataset.removeOption.split(':').map(Number);
    state.eventQuestions[qIdx].options.splice(optIdx, 1);
    renderQuestionBuilder();
  }));
}

function renderCourseTabs() {
  const tabs = qs('#course-tabs');
  const addButton = qs('#open-course-modal');
  if (!tabs) return;
  const courses = state.bootstrap?.courses || [];
  if (addButton) addButton.hidden = !state.bootstrap?.is_super_admin;
  if (!courses.length) {
    tabs.innerHTML = '<div class="empty-state">등록된 강의가 없습니다.</div>';
    return;
  }
  tabs.innerHTML = instructorGroups(courses).map(([instructor, items]) => `
    <section class="folder-group">
      <div class="folder-title">${escapeHtml(instructor)}</div>
      <div class="folder-items">
        ${items.map((course) => `<button class="course-tab ${course.id === state.selectedCourseId ? 'active' : ''}" data-course="${course.id}">${escapeHtml(formatCohortLabel(course.cohort_label))}</button>`).join('')}
      </div>
    </section>
  `).join('');
  qsa('[data-course]', tabs).forEach((btn) => btn.addEventListener('click', () => {
    state.selectedCourseId = btn.dataset.course;
    paintApp();
    refreshSupportLinks();
  }));
}

function renderOverview() {
  const course = getSelectedCourse();
  const target = qs('#overview-card');
  if (!target) return;
  target.innerHTML = course ? `
    <div class="card">
      <div class="card-header"><div><h3>${escapeHtml(buildCourseTitle(course.instructor_name, course.cohort_label))}</h3><p>${escapeHtml(course.instructor_name)} · ${escapeHtml(formatCohortLabel(course.cohort_label))}</p></div><span class="pill orange">${escapeHtml(course.status || 'active')}</span></div>
      <p>${escapeHtml(course.description || '')}</p>
    </div>
  ` : '<div class="empty-state">선택된 강의가 없습니다.</div>';
}

function renderStats() {
  const courses = state.bootstrap?.courses || [];
  const memberships = scoped(state.bootstrap?.memberships || []);
  const events = scoped(state.bootstrap?.events || []);
  const assignments = scoped(state.bootstrap?.assignments || []);
  qs('#stats').innerHTML = `
    <div class="stats-card"><div class="k">강의</div><div class="v">${courses.length}</div></div>
    <div class="stats-card"><div class="k">회원</div><div class="v">${memberships.length}</div></div>
    <div class="stats-card"><div class="k">행사</div><div class="v">${events.length}</div></div>
    <div class="stats-card"><div class="k">과제</div><div class="v">${assignments.length}</div></div>
  `;
}

function renderFeatureGrid() {
  const wrap = qs('#feature-grid');
  if (!wrap) return;
  const scheduleCount = scoped(state.bootstrap?.schedule || []).length;
  const eventCount = scoped(state.bootstrap?.events || []).length;
  const assignmentCount = scoped(state.bootstrap?.assignments || []).length;
  const supportCount = selectedSupportLinks().length;
  const items = [
    { id: 'schedule-modal', label: '정규 일정', count: scheduleCount, desc: '정규 수업 일정을 관리합니다.' },
    { id: 'event-modal', label: '행사 신청서', count: eventCount, desc: '행사 모집과 응답을 관리합니다.' },
    { id: 'assignment-modal', label: '과제', count: assignmentCount, desc: '주차별 과제를 관리합니다.' },
    { id: 'support-modal', label: '고객센터', count: supportCount, desc: '문의 항목과 오픈카톡 링크를 설정합니다.' }
  ];
  wrap.innerHTML = items.map((item) => `
    <button class="feature-tile" type="button" data-open-modal="${item.id}">
      <span class="feature-tile-top">
        <span class="feature-tile-label">${item.label}</span>
        <span class="feature-count">${item.count}</span>
      </span>
      <span class="feature-tile-desc">${item.desc}</span>
    </button>
  `).join('');
  wireFeatureModals();
}

function renderCourseList() {
  const wrap = qs('#course-list-table');
  if (!wrap) return;
  const courses = state.bootstrap?.courses || [];
  wrap.innerHTML = courses.length ? `
    <table><thead><tr><th>강사</th><th>기수</th><th>강의명</th><th>회원</th><th></th></tr></thead><tbody>
      ${courses.map((course) => `<tr>
        <td>${escapeHtml(course.instructor_name)}</td>
        <td>${escapeHtml(formatCohortLabel(course.cohort_label))}</td>
        <td>${escapeHtml(course.title)}</td>
        <td>${course.member_count || 0}</td>
        <td class="text-right"><button class="btn btn-secondary small" data-edit-course="${course.id}">수정</button> <button class="btn btn-danger small" data-delete-course="${course.id}">삭제</button></td>
      </tr>`).join('')}
    </tbody></table>` : '<div class="empty-state">등록된 강의가 없습니다.</div>';
  qsa('[data-edit-course]').forEach((btn) => btn.addEventListener('click', () => fillCourseForm(btn.dataset.editCourse)));
  qsa('[data-delete-course]').forEach((btn) => btn.addEventListener('click', () => removeItem('course', btn.dataset.deleteCourse)));
}

function renderScheduleList() {
  const wrap = qs('#schedule-list');
  const list = scoped(state.bootstrap?.schedule || []);
  wrap.innerHTML = list.length ? list.map((item) => `
    <article class="card"><div class="card-header"><div><h4>${escapeHtml(item.title)}</h4><p>${formatDateTime(item.starts_at)}</p></div><div class="row"><button class="btn btn-secondary small" data-edit-schedule="${item.id}">수정</button><button class="btn btn-danger small" data-delete-schedule="${item.id}">삭제</button></div></div><p>${escapeHtml(item.location || '')}</p></article>
  `).join('') : '<div class="empty-state">등록된 일정이 없습니다.</div>';
  qsa('[data-edit-schedule]').forEach((btn) => btn.addEventListener('click', () => fillScheduleForm(btn.dataset.editSchedule)));
  qsa('[data-delete-schedule]').forEach((btn) => btn.addEventListener('click', () => removeItem('schedule', btn.dataset.deleteSchedule)));
}

function renderAssignmentList() {
  const wrap = qs('#assignment-list');
  const list = scoped(state.bootstrap?.assignments || []);
  wrap.innerHTML = list.length ? list.map((item) => `
    <article class="card"><div class="card-header"><div><h4>${item.week_no}주차 · ${escapeHtml(item.title)}</h4><p>${formatDateTime(item.due_at)}</p></div><div class="row"><button class="btn btn-secondary small" data-edit-assignment="${item.id}">수정</button><button class="btn btn-danger small" data-delete-assignment="${item.id}">삭제</button></div></div><p>${escapeHtml(item.description || '')}</p></article>
  `).join('') : '<div class="empty-state">등록된 과제가 없습니다.</div>';
  qsa('[data-edit-assignment]').forEach((btn) => btn.addEventListener('click', () => fillAssignmentForm(btn.dataset.editAssignment)));
  qsa('[data-delete-assignment]').forEach((btn) => btn.addEventListener('click', () => removeItem('assignment', btn.dataset.deleteAssignment)));
}

function renderTokenList() {
  const wrap = qs('#member-summary-card');
  if (!wrap) return;
  const course = getSelectedCourse();
  const members = selectedMembers();
  wrap.innerHTML = course ? `
    <div class="member-summary-top">
      <div class="member-total">
        <span class="label">회원 수</span>
        <strong class="value">${members.length}</strong>
      </div>
      <div class="member-summary-actions">
        <button class="btn btn-secondary small" type="button" id="members-open-btn">회원 목록</button>
        <button class="btn btn-secondary small" type="button" id="members-export-btn">엑셀 다운로드</button>
        <button class="btn btn-secondary small" type="button" id="member-add-open-btn">회원 수동 추가</button>
        <button class="btn btn-primary small" type="button" id="copy-signup-link-btn">가입 링크 복사</button>
      </div>
    </div>
  ` : '<div class="empty-state">강의를 선택해주세요.</div>';
  qs('#members-open-btn')?.addEventListener('click', openMembersModal);
  qs('#member-add-open-btn')?.addEventListener('click', () => openModal('member-add-modal'));
  qs('#members-export-btn')?.addEventListener('click', () => exportRowsXlsx(`${course?.title || 'members'}_회원명단.xlsx`, members.map((item) => ({ 이름: item.full_name, 전화번호: item.phone, 등록일: formatDate(item.created_at) }))));
  qs('#copy-signup-link-btn')?.addEventListener('click', async () => {
    try {
      const current = await ensureSignupLink();
      const signupUrl = buildSignupUrl(current.token);
      await navigator.clipboard.writeText(signupUrl);
      setMessage(qs('#app-message'), '가입 링크를 복사했습니다.');
    } catch (err) {
      setMessage(qs('#app-message'), err.message || '가입 링크 복사에 실패했습니다.', 'error');
    }
  });
}

function renderSupportList() {
  const wrap = qs('#support-list');
  if (!wrap) return;
  const list = selectedSupportLinks();
  wrap.innerHTML = list.length ? list.map((item) => `
    <div class="support-link-card">
      <div class="meta">
        <strong>${escapeHtml(item.label || item.title || item.name || item.item || '문의')}</strong>
        <small>${escapeHtml(item.url || '')}</small>
      </div>
      <div class="support-actions">
        <button class="btn btn-secondary small" type="button" data-copy-support="${item.id}">링크 복사</button>
        <button class="btn btn-secondary small" type="button" data-edit-support="${item.id}">수정</button>
        <button class="btn btn-danger small" type="button" data-delete-support="${item.id}">삭제</button>
      </div>
    </div>
  `).join('') : '<div class="empty-state">등록된 고객센터 항목이 없습니다.</div>';
  qsa('[data-copy-support]').forEach((btn) => btn.addEventListener('click', async () => {
    const item = list.find((row) => row.id === btn.dataset.copySupport);
    if (!item?.url) return;
    try {
      await navigator.clipboard.writeText(item.url);
      setMessage(qs('#app-message'), '문의 링크를 복사했습니다.');
    } catch (err) {
      setMessage(qs('#app-message'), '링크 복사에 실패했습니다.', 'error');
    }
  }));
  qsa('[data-edit-support]').forEach((btn) => btn.addEventListener('click', () => fillSupportForm(btn.dataset.editSupport)));
  qsa('[data-delete-support]').forEach((btn) => btn.addEventListener('click', async () => {
    if (!confirm('이 문의 항목을 삭제하시겠습니까?')) return;
    try {
      const res = await api.deleteSupportLink(state.sessionToken, btn.dataset.deleteSupport);
      if (!res?.ok) throw new Error(res?.message || '고객센터 항목 삭제에 실패했습니다.');
      await refreshSupportLinks();
    } catch (err) {
      setMessage(qs('#app-message'), err.message || '고객센터 항목 삭제에 실패했습니다.', 'error');
    }
  }));
}

function renderEventList() {
  const wrap = qs('#event-list');
  const list = scoped(state.bootstrap?.events || []);
  wrap.innerHTML = list.length ? list.map((item) => {
    const count = eventApplications(item.id).length;
    const bucket = eventBucket(item);
    const badge = bucket === 'open' ? '모집중' : bucket === 'upcoming' ? '예정' : '마감';
    const badgeClass = bucket === 'open' ? 'green' : bucket === 'upcoming' ? 'blue' : 'red';
    return `
    <article class="card">
      <div class="card-header"><div><h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.description || '')}</p></div><div class="row"><span class="pill ${badgeClass}">${badge}</span><button class="btn btn-secondary small" data-edit-event="${item.id}">수정</button><button class="btn btn-danger small" data-delete-event="${item.id}">삭제</button></div></div>
      <div class="kv-list"><div class="kv-row"><strong>행사일</strong><span>${formatDateTime(item.starts_at)}</span></div><div class="kv-row"><strong>신청기간</strong><span>${formatDateTime(item.registration_open_at)} ~ ${formatDateTime(item.registration_close_at)}</span></div><div class="kv-row"><strong>전체 마감</strong><span>${item.max_applicants || '-'}</span></div></div>
      <div class="event-summary-actions"><button class="btn btn-secondary small" type="button" data-open-responses="${item.id}">응답 ${count}건 보기</button><button class="btn btn-secondary small" type="button" data-export-responses="${item.id}">응답 엑셀</button></div>
    </article>`;
  }).join('') : '<div class="empty-state">등록된 행사가 없습니다.</div>';
  qsa('[data-edit-event]').forEach((btn) => btn.addEventListener('click', () => fillEventForm(btn.dataset.editEvent)));
  qsa('[data-delete-event]').forEach((btn) => btn.addEventListener('click', () => removeItem('event', btn.dataset.deleteEvent)));
  qsa('[data-open-responses]').forEach((btn) => btn.addEventListener('click', () => openResponsesModal(btn.dataset.openResponses)));
  qsa('[data-export-responses]').forEach((btn) => btn.addEventListener('click', () => {
    const event = (state.bootstrap?.events || []).find((item) => item.id === btn.dataset.exportResponses);
    const apps = eventApplications(btn.dataset.exportResponses);
    const schemaMap = Object.fromEntries((event?.form_schema || []).map((q) => [q.id, q.label || q.id]));
    exportRowsXlsx(`${event?.title || 'responses'}_응답내역.xlsx`, apps.map((app) => {
      const answers = Object.fromEntries(Object.entries(app.answers || {}).map(([key, value]) => [schemaMap[key] || key, value]));
      return { 이름: app.full_name, 전화번호: app.phone, 응답일: formatDateTime(app.created_at), ...answers };
    }));
  }));
}

function renderApplicationList(eventId) {
  const apps = (state.bootstrap?.applications || []).filter((item) => item.event_id === eventId);
  if (!apps.length) return '<div class="notice-box" style="margin-top:10px">신청 내역이 없습니다.</div>';
  return `<div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>이름</th><th>연락처</th><th>응답</th><th>신청일</th></tr></thead><tbody>${apps.map((app) => `<tr><td>${escapeHtml(app.full_name)}</td><td>${escapeHtml(app.phone)}</td><td><code>${escapeHtml(JSON.stringify(app.answers || {}))}</code></td><td>${formatDateTime(app.created_at)}</td></tr>`).join('')}</tbody></table></div>`;
}

function renderMembers() {
  renderTokenList();
  renderSupportList();
}


function getUniqueGlobalMembers() {
  const map = new Map();
  const memberships = state.bootstrap?.memberships || [];
  memberships.forEach((m) => {
    const key = m.profile_id;
    if (!key) return;
    if (!map.has(key)) map.set(key, { profile_id: m.profile_id, full_name: m.full_name, phone: m.phone, courses: [] });
    map.get(key).courses.push(m.course_id);
  });
  return Array.from(map.values()).map((row) => ({ ...row, courses: Array.from(new Set(row.courses)) }));
}

function getCourseMemberRows(courseId) {
  return (state.bootstrap?.memberships || []).filter((m) => m.course_id === courseId);
}

function getCourseInstructorRows(courseId) {
  const course = (state.bootstrap?.courses || []).find((c) => c.id === courseId);
  const roles = (state.bootstrap?.roles || []).filter((r) => r.role_type === 'course_admin' && (r.course_id === courseId || r.target_instructor_name === course?.instructor_name));
  const uniq = new Map();
  roles.forEach((r) => {
    const key = r.profile_id || `${r.full_name}|${r.phone}`;
    if (!uniq.has(key)) uniq.set(key, r);
  });
  return Array.from(uniq.values());
}

function renderCourseMemberManager(courseId) {
  const course = (state.bootstrap?.courses || []).find((c) => c.id === courseId);
  const wrap = qs('#course-member-manager');
  const searchField = qs('#global-member-search');
  if (searchField) {
    searchField.disabled = !courseId;
    searchField.placeholder = courseId ? '이름 또는 전화번호' : '강사/기수를 먼저 선택하세요';
    if (!courseId) searchField.value = '';
  }
  if (!wrap) return;
  if (!courseId || !course) {
    wrap.innerHTML = '<div class="empty-state">강사/기수 버튼을 선택하면 회원과 강사 목록을 볼 수 있습니다.</div>';
    return;
  }
  const term = (searchField?.value || '').trim();
  const members = getCourseMemberRows(courseId).filter((m) => {
    if (!term) return true;
    return String(m.full_name || '').includes(term) || String(m.phone || '').includes(term);
  });
  const instructors = getCourseInstructorRows(courseId).filter((m) => {
    if (!term) return true;
    return String(m.full_name || '').includes(term) || String(m.phone || '').includes(term);
  });
  wrap.innerHTML = `
    <div class="member-manager-panel">
      <div class="member-manager-head">
        <div>
          <h4>${escapeHtml(course.title || `${course.instructor_name} ${course.cohort_label}`)}</h4>
          <p class="muted">회원 ${members.length}명 · 강사 ${instructors.length}명</p>
        </div>
      </div>
      <div class="member-manager-split">
        <section class="member-manager-box">
          <h5>회원</h5>
          <div class="member-vertical-list">
            ${members.length ? members.map((m) => `
              <article class="member-vertical-card">
                <div class="member-main">
                  <strong>${escapeHtml(m.full_name || '')}</strong>
                  <span>${escapeHtml(m.phone || '')}</span>
                </div>
                <div class="member-actions">
                  <select class="input course-select" data-change-profile="${m.profile_id}">${(state.bootstrap?.courses || []).map((c) => `<option value="${c.id}" ${c.id===courseId?'selected':''}>${escapeHtml(c.instructor_name)} ${escapeHtml(formatCohortLabel(c.cohort_label))}</option>`).join('')}</select>
                  <button class="btn btn-secondary small" data-save-profile-course="${m.profile_id}">변경</button>
                  <button class="btn btn-danger small" data-delete-member-profile="${m.profile_id}" data-delete-member-course="${courseId}">수강삭제</button>
                  ${state.bootstrap?.is_super_admin ? `<button class="btn btn-danger small" data-hard-delete-profile="${m.profile_id}">회원삭제</button>` : ''}
                </div>
              </article>`).join('') : '<div class="empty-state">등록된 회원이 없습니다.</div>'}
          </div>
        </section>
        <section class="member-manager-box">
          <h5>강사</h5>
          <div class="member-vertical-list">
            ${instructors.length ? instructors.map((r) => `
              <article class="member-vertical-card slim">
                <div class="member-main">
                  <strong>${escapeHtml(r.full_name || '')}</strong>
                  <span>${escapeHtml(r.phone || '')}</span>
                </div>
                <div class="member-actions">
                  <span class="pill orange">강사</span>
                  <button class="btn btn-danger small" data-role-profile="${r.profile_id || ''}" data-role-type="course_admin" data-role-course="${courseId}">삭제</button>
                </div>
              </article>`).join('') : '<div class="empty-state">등록된 강사가 없습니다.</div>'}
          </div>
        </section>
      </div>
    </div>`;
  qs('#manager-add-member')?.addEventListener('click', () => openModal('member-add-modal'));
  qsa('[data-delete-member-profile]', wrap).forEach((btn) => btn.addEventListener('click', async () => { await removeMembership(btn.dataset.deleteMemberCourse, btn.dataset.deleteMemberProfile); renderCourseMemberManager(courseId); }));
  qsa('[data-hard-delete-profile]', wrap).forEach((btn) => btn.addEventListener('click', async () => { await hardDeleteProfile(btn.dataset.hardDeleteProfile); renderCourseMemberManager(courseId); }));
  qsa('[data-save-profile-course]', wrap).forEach((btn) => btn.addEventListener('click', async () => {
    const profileId = btn.dataset.saveProfileCourse;
    const select = wrap.querySelector(`[data-change-profile="${profileId}"]`);
    const row = members.find((m) => m.profile_id === profileId);
    const targetCourseId = select?.value;
    if (!row || !targetCourseId) return;
    try {
      await api.deleteMembership(state.sessionToken, courseId, profileId);
      await api.upsertMember(state.sessionToken, targetCourseId, row.full_name, row.phone);
      await refreshBootstrap();
      renderCourseMemberManager(targetCourseId);
      renderGlobalMembersTable(targetCourseId);
    } catch (err) {
      setMessage(qs('#app-message'), err.message || '등록 강의 변경에 실패했습니다.', 'error');
    }
  }));
  qsa('[data-role-profile]', wrap).forEach((btn) => btn.addEventListener('click', async () => {
    if (!confirm('이 강사 권한을 삭제하시겠습니까?')) return;
    try {
      const res = await api.deleteRole(state.sessionToken, btn.dataset.roleProfile, btn.dataset.roleType, btn.dataset.roleCourse || null);
      if (!res?.ok) throw new Error(res?.message || '권한 삭제에 실패했습니다.');
      await refreshBootstrap();
      renderCourseMemberManager(courseId);
    } catch (err) {
      setMessage(qs('#app-message'), err.message || '권한 삭제에 실패했습니다.', 'error');
    }
  }));
}

function renderGlobalMembersTable(activeCourseId = '') {
  const wrap = qs('#global-members-table');
  const searchField = qs('#global-member-search');
  if (!wrap) return;
  const courses = state.bootstrap?.courses || [];
  const selectedCourseId = activeCourseId || qs('[data-course-manager-btn].active')?.dataset.courseManagerBtn || '';
  if (searchField) {
    searchField.disabled = !selectedCourseId;
    searchField.placeholder = selectedCourseId ? '이름 또는 전화번호' : '강사/기수를 먼저 선택하세요';
    searchField.oninput = () => renderCourseMemberManager(qs('[data-course-manager-btn].active')?.dataset.courseManagerBtn || '');
  }
  wrap.innerHTML = `
    <div class="member-manager-shell">
      <div class="course-button-grid">
        ${courses.map((c) => `<button type="button" class="course-manager-btn ${c.id===selectedCourseId?'active':''}" data-course-manager-btn="${c.id}">${escapeHtml(c.instructor_name)} ${escapeHtml(formatCohortLabel(c.cohort_label))}</button>`).join('')}
      </div>
      <div id="course-member-manager"></div>
    </div>`;
  qsa('[data-course-manager-btn]', wrap).forEach((btn) => btn.addEventListener('click', () => {
    qsa('[data-course-manager-btn]', wrap).forEach((b) => b.classList.toggle('active', b === btn));
    renderCourseMemberManager(btn.dataset.courseManagerBtn);
  }));
  renderCourseMemberManager(selectedCourseId);
}

function openGlobalMembersModal() {
  renderGlobalMembersTable();
  openModal('global-members-modal');
}

function renderRequestsAndRoles() {
  const requestWrap = qs('#request-list-table');
  const requestSection = qs('#request-section');
  const roleWrap = qs('#role-list-table');
  const superSection = qs('#super-only');
  const sidebarSettings = qs('#sidebar-admin-settings');
  const rolesButton = qs('#open-roles-modal');
  const globalMembersButton = qs('#open-global-members-modal');
  const isSuper = !!state.bootstrap?.is_super_admin;
  if (sidebarSettings) sidebarSettings.hidden = !isSuper;
  if (rolesButton) rolesButton.onclick = () => { if (isSuper) openModal('roles-modal'); };
  if (globalMembersButton) globalMembersButton.onclick = () => { if (isSuper) openGlobalMembersModal(); };
  if (!isSuper) { if (superSection) superSection.hidden = true; closeModal('roles-modal'); return; }
  superSection.hidden = false;
  const courseMap = Object.fromEntries((state.bootstrap.courses || []).map((course) => [course.id, course]));
  const pendingRequests = (state.bootstrap.requests || []).filter((item) => item.status === 'pending');
  if (requestSection) requestSection.hidden = pendingRequests.length === 0;
  if (requestWrap) requestWrap.innerHTML = pendingRequests.length ? `<table><thead><tr><th>이름</th><th>연락처</th><th>담당 강사</th><th></th></tr></thead><tbody>${pendingRequests.map((item) => {
    const reqCourse = courseMap[item.requested_course_id] || null;
    return `<tr><td>${escapeHtml(item.full_name)}</td><td>${escapeHtml(item.phone)}</td><td>${escapeHtml(reqCourse?.instructor_name || '')}</td><td class="text-right"><button class="btn btn-primary small" data-approve-request="${item.id}">승인</button> <button class="btn btn-secondary small" data-reject-request="${item.id}">반려</button></td></tr>`;
  }).join('')}</tbody></table>` : '';
  qsa('[data-approve-request]').forEach((btn) => btn.addEventListener('click', () => resolveRequest(btn.dataset.approveRequest, 'approved')));
  qsa('[data-reject-request]').forEach((btn) => btn.addEventListener('click', () => resolveRequest(btn.dataset.rejectRequest, 'rejected')));

  const rawRoles = state.bootstrap.roles || [];
  const roleMap = new Map();
  rawRoles.forEach((item) => {
    const targetLabel = item.role_type === 'super_admin' ? '전체' : (item.target_instructor_name || (item.course_id ? (courseMap[item.course_id]?.instructor_name || '') : ''));
    const key = `${item.profile_id || ''}|${item.role_type || ''}|${targetLabel}`;
    if (!roleMap.has(key)) roleMap.set(key, { ...item, target_label: targetLabel });
  });
  const roles = Array.from(roleMap.values()).sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || ''), 'ko'));
  roleWrap.innerHTML = roles.length ? `<table><thead><tr><th>이름</th><th>연락처</th><th>권한</th><th>대상</th><th></th></tr></thead><tbody>${roles.map((item) => `<tr><td>${escapeHtml(item.full_name || '')}</td><td>${escapeHtml(item.phone || '')}</td><td>${escapeHtml(item.role_type === 'super_admin' ? '관리자 어드민' : '강사')}</td><td>${escapeHtml(item.target_label || (item.course_id ? (courseMap[item.course_id]?.instructor_name || '') : '전체'))}</td><td class="text-right"><button class="btn btn-danger small" data-role-profile="${item.profile_id || ''}" data-role-type="${item.role_type || ''}" data-role-course="${item.course_id || ''}">삭제</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty-state">권한 정보가 없습니다.</div>';
  qsa('[data-role-profile]').forEach((btn) => btn.addEventListener('click', async () => {
    if (!confirm('이 권한을 삭제하시겠습니까?')) return;
    try {
      const res = await api.deleteRole(state.sessionToken, btn.dataset.roleProfile, btn.dataset.roleType, btn.dataset.roleCourse || null);
      if (!res?.ok) throw new Error(res?.message || '권한 삭제에 실패했습니다.');
      await refreshBootstrap();
    } catch (err) {
      setMessage(qs('#app-message'), err.message || '권한 삭제에 실패했습니다.', 'error');
    }
  }));

  const profileSelect = qs('#role-profile-id');
  const courseSelect = qs('#role-course-id');
  if (profileSelect) profileSelect.innerHTML = `<option value="">회원 선택</option>${(state.bootstrap.profiles || []).map((p) => `<option value="${p.id}">${escapeHtml(p.full_name)} · ${escapeHtml(p.phone)}</option>`).join('')}`;
  if (courseSelect) courseSelect.innerHTML = `<option value="">강사 기준 선택</option>${instructorGroups(state.bootstrap.courses || []).map(([name, items]) => `<option value="${items[0]?.id}">${escapeHtml(name)}</option>`).join('')}`;
}

function fillCourseForm(id) {
  const item = (state.bootstrap?.courses || []).find((c) => c.id === id);
  if (!item) return;
  state.editingCourseId = id;
  const form = qs('#course-form');
  form.querySelector('[name="instructor_name"]').value = item.instructor_name || '';
  form.querySelector('[name="cohort_label"]').value = item.cohort_label || '';
  form.querySelector('[name="description"]').value = item.description || '';
  openCourseModal();
}

function fillScheduleForm(id) {
  const item = (state.bootstrap?.schedule || []).find((c) => c.id === id);
  if (!item) return;
  state.editingScheduleId = id;
  const form = qs('#schedule-form');
  form.querySelector('[name="title"]').value = item.title || '';
  form.querySelector('[name="location"]').value = item.location || '';
  form.querySelector('[name="starts_at"]').value = (item.starts_at || '').slice(0, 16);
  form.querySelector('[name="ends_at"]').value = (item.ends_at || '').slice(0, 16);
  form.querySelector('[name="description"]').value = item.description || '';
}

function fillAssignmentForm(id) {
  const item = (state.bootstrap?.assignments || []).find((c) => c.id === id);
  if (!item) return;
  state.editingAssignmentId = id;
  const form = qs('#assignment-form');
  form.querySelector('[name="week_no"]').value = item.week_no || 1;
  form.querySelector('[name="title"]').value = item.title || '';
  form.querySelector('[name="due_at"]').value = (item.due_at || '').slice(0, 16);
  form.querySelector('[name="link_url"]').value = item.link_url || '';
  form.querySelector('[name="description"]').value = item.description || '';
}

function fillEventForm(id) {
  const item = (state.bootstrap?.events || []).find((c) => c.id === id);
  if (!item) return;
  state.editingEventId = id;
  const form = qs('#event-form');
  form.querySelector('[name="title"]').value = item.title || '';
  form.querySelector('[name="starts_at"]').value = (item.starts_at || '').slice(0, 16);
  form.querySelector('[name="ends_at"]').value = (item.ends_at || '').slice(0, 16);
  form.querySelector('[name="registration_open_at"]').value = (item.registration_open_at || '').slice(0, 16);
  form.querySelector('[name="registration_close_at"]').value = (item.registration_close_at || '').slice(0, 16);
  form.querySelector('[name="max_applicants"]').value = item.max_applicants || '';
  form.querySelector('[name="description"]').value = item.description || '';
  resetEventBuilder(item.form_schema || []);
}

function fillTokenForm(id) {
  const item = (state.bootstrap?.tokens || []).find((c) => c.id === id);
  if (!item) return;
  state.editingTokenId = id;
  const form = qs('#token-form');
  form.querySelector('[name="token_name"]').value = item.token_name || '';
  form.querySelector('[name="max_uses"]').value = item.max_uses || '';
  form.querySelector('[name="expires_at"]').value = (item.expires_at || '').slice(0, 16);
  form.querySelector('[name="welcome_message"]').value = item.welcome_message || '';
}

async function removeItem(kind, id) {
  if (!confirm('삭제하시겠습니까?')) return;
  try {
    const res = await api.deleteItem(state.sessionToken, kind, id);
    if (!res?.ok) throw new Error(res?.message || '삭제에 실패했습니다.');
    await refreshBootstrap();
  } catch (err) {
    setMessage(qs('#app-message'), err.message || '삭제에 실패했습니다.', 'error');
  }
}

async function resolveRequest(requestId, status) {
  try {
    const res = await api.resolveRequest(state.sessionToken, requestId, status, null);
    if (!res?.ok) throw new Error(res?.message || '처리에 실패했습니다.');
    await refreshBootstrap();
  } catch (err) {
    setMessage(qs('#app-message'), err.message || '처리에 실패했습니다.', 'error');
  }
}

async function refreshSupportLinks() {
  if (!state.sessionToken || !state.selectedCourseId) {
    state.supportLinks = [];
    renderFeatureGrid();
    renderSupportList();
    return;
  }
  try {
    const res = await api.listSupportLinks(state.sessionToken, state.selectedCourseId);
    state.supportLinks = Array.isArray(res) ? res : (res?.items || []);
  } catch (err) {
    state.supportLinks = [];
    setMessage(qs('#app-message'), (err && err.message) ? `고객센터 목록을 불러오지 못했습니다: ${err.message}` : '고객센터 목록을 불러오지 못했습니다.', 'error');
  }
  renderFeatureGrid();
  renderSupportList();
}

function paintApp() {
  qs('#auth-section').hidden = true;
  qs('#app-main').hidden = false;
  qs('#app-nav').hidden = false;
  qs('#admin-name').textContent = state.bootstrap?.profile?.full_name || state.bootstrap?.profile?.login_id || '관리자';
  renderStats();
  renderCourseTabs();
  renderOverview();
  renderCourseList();
  renderScheduleList();
  renderAssignmentList();
  renderEventList();
  renderMembers();
  renderFeatureGrid();
  renderRequestsAndRoles();
}

async function refreshBootstrap() {
  const res = await api.getBootstrap(state.sessionToken);
  if (res?.ok === false) throw new Error(res?.message || '데이터를 불러오지 못했습니다.');
  state.bootstrap = res?.data || res;
  const courseIds = (res.courses || []).map((course) => course.id);
  if (!courseIds.includes(state.selectedCourseId)) state.selectedCourseId = courseIds[0] || '';
  paintApp();
  await refreshSupportLinks();
}

async function initAuth() {
  const loginForm = qs('#admin-login-form');
  const signupForm = qs('#admin-signup-form');
  const loginMsg = qs('#login-message');
  const signupMsg = qs('#signup-message');
  const signupPanel = qs('#signup-panel');
  const select = qs('#request-instructor-id');

  async function loadCoursesForSignup() {
    if (state.publicCourses.length) return;
    try {
      const courses = await api.listCourses();
      state.publicCourses = Array.isArray(courses) ? courses : [];
      const firstByInstructor = instructorGroups(state.publicCourses).map(([name, items]) => ({ name, id: items[0]?.id }));
      if (select) select.innerHTML = `<option value="">강사 선택</option>${firstByInstructor.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('')}`;
    } catch (err) {
      const msg = mapAuthError(err);
      if (select) select.innerHTML = '<option value="">불러오지 못함</option>';
      setMessage(signupMsg, msg, 'error');
      throw err;
    }
  }

  qs('#toggle-signup')?.addEventListener('click', async () => {
    signupPanel.hidden = !signupPanel.hidden;
    if (!signupPanel.hidden) {
      setMessage(signupMsg, '');
      try { await loadCoursesForSignup(); } catch {}
    }
  });
  qs('#bootstrap-hint-btn')?.addEventListener('click', () => {
    setMessage(loginMsg, '최초 관리자 어드민은 서버 SQL에서 수동 등록 후 로그인하세요.', '');
  });
  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    setMessage(loginMsg, '');
    const login = loginForm.querySelector('[name="login"]').value.trim();
    const secret = loginForm.querySelector('[name="secret"]').value.trim();
    try {
      const res = await api.signIn(login, secret);
      if (res?.ok === false) throw new Error(res?.message || '로그인에 실패했습니다.');
      state.sessionToken = res?.session_token || res?.sessionToken || res?.token || '';
      if (!state.sessionToken) throw new Error(res?.message || '세션 토큰이 없습니다.');
      saveSession(sessionKey, state.sessionToken);
      await refreshBootstrap();
    } catch (err) {
      setMessage(loginMsg, mapAuthError(err), 'error');
    }
  });
  signupForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    setMessage(signupMsg, '');
    try {
      const res = await api.requestSignup(
        signupForm.querySelector('[name="full_name"]').value.trim(),
        signupForm.querySelector('[name="phone"]').value.trim(),
        signupForm.querySelector('[name="requested_course_id"]').value || null,
        signupForm.querySelector('[name="memo"]').value.trim()
      );
      if (!res?.ok) throw new Error(res?.message || '신청에 실패했습니다.');
      signupForm.reset();
      setMessage(signupMsg, res.message || '신청이 완료되었습니다.');
    } catch (err) {
      setMessage(signupMsg, mapAuthError(err), 'error');
    }
  });
}

function bindForms() {
  qs('#course-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const form = e.currentTarget;
      const instructor = form.instructor_name.value.trim();
      const cohort = form.cohort_label.value.trim();
      const payload = {
        id: state.editingCourseId || null,
        title: buildCourseTitle(instructor, cohort),
        instructor_name: instructor,
        cohort_label: cohort,
        description: form.description.value.trim(),
        status: 'active',
        is_visible: true
      };
      const res = await api.saveCourse(state.sessionToken, payload);
      if (!res?.ok) throw new Error(res?.message || '저장에 실패했습니다.');
      resetCourseForm();
      await refreshBootstrap();
      closeCourseModal();
    } catch (err) {
      setMessage(qs('#app-message'), err.message || '저장에 실패했습니다.', 'error');
    }
  });

  qs('#schedule-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const form = e.currentTarget;
      const res = await api.saveSchedule(state.sessionToken, {
        id: state.editingScheduleId || null,
        course_id: state.selectedCourseId,
        title: form.title.value.trim(),
        location: form.location.value.trim(),
        starts_at: form.starts_at.value,
        ends_at: form.ends_at.value,
        description: form.description.value.trim()
      });
      if (!res?.ok) throw new Error(res?.message || '저장에 실패했습니다.');
      form.reset(); state.editingScheduleId = '';
      await refreshBootstrap();
    } catch (err) { setMessage(qs('#app-message'), err.message || '저장에 실패했습니다.', 'error'); }
  });

  qs('#assignment-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const form = e.currentTarget;
      const res = await api.saveAssignment(state.sessionToken, {
        id: state.editingAssignmentId || null,
        course_id: state.selectedCourseId,
        week_no: form.week_no.value,
        title: form.title.value.trim(),
        due_at: form.due_at.value,
        link_url: form.link_url.value.trim(),
        description: form.description.value.trim()
      });
      if (!res?.ok) throw new Error(res?.message || '저장에 실패했습니다.');
      form.reset(); state.editingAssignmentId = '';
      await refreshBootstrap();
    } catch (err) { setMessage(qs('#app-message'), err.message || '저장에 실패했습니다.', 'error'); }
  });
  qs('#member-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const form = e.currentTarget;
      const res = await api.upsertMember(state.sessionToken, state.selectedCourseId, form.full_name.value.trim(), normalizePhoneDigits(form.phone.value));
      if (!res?.ok) throw new Error(res?.message || '회원 추가에 실패했습니다.');
      form.reset();
      closeModal('member-add-modal');
      await refreshBootstrap();
    } catch (err) { setMessage(qs('#app-message'), err.message || '회원 추가에 실패했습니다.', 'error'); }
  });

  qs('#event-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const form = e.currentTarget;
      const payload = {
        id: state.editingEventId || null,
        course_id: state.selectedCourseId,
        title: form.title.value.trim(),
        starts_at: form.starts_at.value,
        ends_at: form.ends_at.value,
        registration_open_at: form.registration_open_at.value,
        registration_close_at: form.registration_close_at.value,
        max_applicants: form.max_applicants.value,
        description: form.description.value.trim(),
        form_schema: state.eventQuestions,
        status: 'published'
      };
      const res = await api.saveEvent(state.sessionToken, payload);
      if (!res?.ok) throw new Error(res?.message || '행사 저장에 실패했습니다.');
      form.reset(); state.editingEventId = ''; resetEventBuilder([]);
      await refreshBootstrap();
    } catch (err) { setMessage(qs('#app-message'), err.message || '행사 저장에 실패했습니다.', 'error'); }
  });

  qs('#support-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const form = e.currentTarget;
      const res = state.editingSupportId
        ? await api.updateSupportLink(
            state.sessionToken,
            state.editingSupportId,
            form.label.value.trim(),
            form.url.value.trim(),
            form.sort_order.value.trim() || null,
            state.selectedCourseId
          )
        : await api.saveSupportLink(state.sessionToken, {
            id: null,
            course_id: state.selectedCourseId,
            label: form.label.value.trim(),
            url: form.url.value.trim(),
            sort_order: form.sort_order.value.trim() || null
          });
      if (res?.ok === false) throw new Error(res?.message || '고객센터 저장에 실패했습니다.');
      const wasEditing = !!state.editingSupportId;
      resetSupportForm();
      await refreshSupportLinks();
      if (!wasEditing && Array.isArray(state.supportLinks) && !state.supportLinks.length) {
        state.supportLinks = [{
          id: res?.id || crypto.randomUUID(),
          label: form.label.value.trim(),
          title: form.label.value.trim(),
          url: form.url.value.trim(),
          sort_order: Number(form.sort_order.value.trim() || 10)
        }];
        renderSupportList();
      }
      setMessage(qs('#app-message'), wasEditing ? '고객센터 항목을 수정했습니다.' : '고객센터 항목을 저장했습니다.');
    } catch (err) { const raw = String(err?.message || err || ''); const msg = raw || '고객센터 저장에 실패했습니다.'; setMessage(qs('#app-message'), msg, 'error'); }
  });

  qs('#add-question-btn')?.addEventListener('click', () => { state.eventQuestions.push(emptyChoiceQuestion()); renderQuestionBuilder(); });

  qs('#role-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const form = e.currentTarget;
      const res = await api.assignRole(state.sessionToken, form.profile_id.value, form.role_type.value, form.course_id.value || null);
      if (!res?.ok) throw new Error(res?.message || '권한 부여에 실패했습니다.');
      form.reset();
      await refreshBootstrap();
    } catch (err) { setMessage(qs('#app-message'), err.message || '권한 부여에 실패했습니다.', 'error'); }
  });

  qs('#open-course-modal')?.addEventListener('click', () => { resetCourseForm(); openCourseModal(); });
  qs('#close-course-modal')?.addEventListener('click', closeCourseModal);
  ['course-modal','responses-modal','members-modal','member-add-modal','schedule-modal','event-modal','assignment-modal','support-modal','roles-modal','global-members-modal'].forEach((id) => {
    qs(`#${id}`)?.addEventListener('click', (e) => { if (e.target.id === id) closeModal(id); });
  });
  qs('#close-responses-modal')?.addEventListener('click', closeResponsesModal);
  qs('#close-members-modal')?.addEventListener('click', closeMembersModal);
  qs('#global-member-search')?.addEventListener('input', renderGlobalMembersTable);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') { ['course-modal','responses-modal','members-modal','member-add-modal','schedule-modal','event-modal','assignment-modal','support-modal','roles-modal','global-members-modal'].forEach(closeModal); } });

  qs('#signout-btn')?.addEventListener('click', async () => {
    try { await api.signOut(state.sessionToken); } catch {}
    clearSession(sessionKey); state.sessionToken = ''; state.bootstrap = null;
    ['course-modal','responses-modal','members-modal','member-add-modal','schedule-modal','event-modal','assignment-modal','support-modal','roles-modal','global-members-modal'].forEach(closeModal);
    qs('#app-main').hidden = true; qs('#app-nav').hidden = true; qs('#auth-section').hidden = false;
  });
}

async function init() {
  ensureTitle();
  bindForms();
  await initAuth();
  applyLoginQueryParams();
  const saved = loadSession(sessionKey);
  if (saved) {
    try {
      state.sessionToken = saved;
      await refreshBootstrap();
    } catch {
      clearSession(sessionKey);
    }
  }
  resetEventBuilder([]);
}

init().catch((err) => {
  const el = document.querySelector('#login-message');
  if (el) {
    el.className = 'status-bar err';
    el.textContent = '초기화 오류: ' + (err?.message || err || '알 수 없는 오류');
  }
  console.error(err);
});
