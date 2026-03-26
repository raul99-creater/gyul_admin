import { APP_CONFIG } from './config.js';
import { api } from './api.js';
import { qs, qsa, escapeHtml, formatDateTime, formatDate, eventBucket, setMessage, saveSession, loadSession, clearSession, groupBy } from './utils.js';

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
  sidebarCollapsed: false,
  attendance: [],
  logs: [],
  currentQrEventId: ''
};

function ensureTitle() {
  document.title = APP_CONFIG.siteName;
  qsa('[data-site-name]').forEach((el) => { el.textContent = APP_CONFIG.siteName; });
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
  if (!res?.ok) throw new Error(res?.message || '데이터를 불러오지 못했습니다.');
  state.bootstrap = res;
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
      if (!res?.ok) throw new Error(res?.message || '로그인에 실패했습니다.');
      state.sessionToken = res.session_token;
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


/* local-demo feature merge patch */
function modalMessageEl(id) {
  return qs(`#${id} .modal-message`) || qs(`#${id}-message`) || qs(`#${id}-modal-message`) || qs(`#${id.replace(/-modal$/,'')}-message`);
}
function showModalMessage(id, message, type = 'ok') { setMessage(modalMessageEl(id), message, type); }
function currentActorName() { return state.bootstrap?.profile?.full_name || state.bootstrap?.profile?.login_id || '관리자'; }
function selectedAttendance(eventId) { return (state.attendance || []).filter((item) => item.event_id === eventId); }
function roomLabelSort(a, b) { return String(a || '').localeCompare(String(b || ''), 'ko', { numeric: true }); }
async function addActivityLog(action, detail = {}, courseId = state.selectedCourseId, profileId = null) {
  try { await api.addActivityLog(action, detail, courseId || null, profileId || null, currentActorName()); } catch (_) {}
}
function normalizeName(v) {
  return String(v || '').trim()
    .replace(/[\s]*[\(\[\{（【][^)\]\}）】]*[\)\]\}）】]\s*$/, '')
    .replace(/[\/_\-\s]+$/, '')
    .replace(/\s+/g, ' ');
}
function last4(v) { const digits = normalizePhoneDigits(v); return digits.length >= 4 ? digits.slice(-4) : ''; }
function splitNickname(v) {
  const raw = String(v || '').trim();
  if (!raw) return null;
  const digits = normalizePhoneDigits(raw);
  const phone4 = digits.length >= 4 ? digits.slice(-4) : '';
  let name = raw.replace(/\d[\d\-\s]*$/, '').replace(/[\/_\-\s]+$/, '').trim();
  name = normalizeName(name || raw);
  return name ? { name, phone4 } : null;
}
function rowsToAttendanceLines(rawRows) {
  return (rawRows || []).flatMap((row) => {
    if (!Array.isArray(row)) return [];
    if (row.length === 1) return String(row[0] || '').split(/\r?\n/).filter(Boolean);
    const candidate = String(row[2] || row[1] || row[0] || row.join(' ') || '').trim();
    return candidate ? [candidate] : [];
  });
}
function parseAttendanceLines(rawRows) {
  const JOIN_PAT = /(.*?)님이\s*(입장하셨습니다|들어왔습니다|입장했습니다|들어오셨습니다)[\s\.\!]*$/;
  const LEAVE_PAT = /(.*?)님이\s*(퇴장하셨습니다|나갔습니다|퇴장했습니다|나가셨습니다)[\s\.\!]*$/;
  const KICK_PAT = /(.*?)님을\s*(내보냈습니다|강퇴했습니다|추방했습니다)[\s\.\!]*$/;
  const NAME_ONLY = '__NAMEONLY__';
  const activeByName = new Map();
  const leftByName = new Map();
  const ensure = (map, key) => { if (!map.has(key)) map.set(key, new Set()); return map.get(key); };
  const lines = rowsToAttendanceLines(rawRows);
  for (const raw of lines) {
    const line = String(raw || '').trim();
    if (!line) continue;
    let m = line.match(JOIN_PAT); let type = 'join';
    if (!m) { m = line.match(LEAVE_PAT); type = 'leave'; }
    if (!m) { m = line.match(KICK_PAT); type = 'leave'; }
    if (!m) continue;
    const part = splitNickname(m[1]);
    if (!part) continue;
    const code = part.phone4 || NAME_ONLY;
    if (type === 'join') {
      ensure(activeByName, part.name).add(code);
      if (leftByName.has(part.name)) {
        const left = leftByName.get(part.name);
        left.delete(code);
        if (!left.size) leftByName.delete(part.name);
      }
    } else {
      const active = ensure(activeByName, part.name);
      active.delete(code);
      ensure(leftByName, part.name).add(code);
    }
  }
  return { NAME_ONLY, activeByName, leftByName, line_count: lines.length };
}
function parsePaymentRows(rawRows) {
  return (rawRows || []).map((row) => ({
    name: String(row[0] || '').trim(),
    phone: String(row[1] || '').trim(),
    phone_digits: normalizePhoneDigits(row[1] || ''),
    amount: Number(String(row[2] || '').replace(/[^0-9.-]/g, '')) || 0
  })).filter((row) => row.name || row.phone_digits);
}
async function parseUploadFile(file) {
  return new Promise((resolve, reject) => {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
    reader.onload = (e) => {
      try {
        if ((ext === 'xlsx' || ext === 'xls') && typeof window !== 'undefined' && window.XLSX) {
          const wb = window.XLSX.read(e.target.result, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          resolve(window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }));
          return;
        }
        const text = new TextDecoder('utf-8').decode(e.target.result);
        resolve(text.split(/\r?\n/).filter(Boolean).map((line) => line.split(',').map((x) => x.replace(/^"|"$/g, '').trim())));
      } catch (err) { reject(err); }
    };
    reader.readAsArrayBuffer(file);
  });
}
function buildCheckinUrl(eventId = '') {
  const base = String(APP_CONFIG.mainAppUrl || window.location.origin).trim().replace(/\/$/, '');
  return `${base}/dashboard.html?checkin=${encodeURIComponent(eventId)}`;
}
function renderQrVisual(target, payload, size = 220) {
  if (!target) return;
  target.innerHTML = `<img width="${size}" height="${size}" alt="QR" src="https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(payload)}" />`;
}
function roomGroupsFromMembers(list = []) {
  const map = new Map();
  list.forEach((row) => {
    const key = String(row.room_no || '').trim() || '미배정';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  });
  return Array.from(map.entries()).sort((a, b) => roomLabelSort(a[0], b[0]));
}
async function hydrateMembershipMeta() {
  if (!state.bootstrap?.memberships?.length || !state.selectedCourseId) {
    if (state.bootstrap?.memberships) {
      state.bootstrap.memberships = (state.bootstrap.memberships || []).map((m) => ({ ...m, room_no: m.room_no || '', memo: m.memo || '' }));
    }
    return;
  }
  try {
    const rows = await api.listMembershipMeta(state.selectedCourseId);
    const map = new Map((rows || []).map((row) => [row.id, row]));
    state.bootstrap.memberships = (state.bootstrap.memberships || []).map((m) => map.has(m.id)
      ? { ...m, room_no: map.get(m.id).room_no || '', memo: map.get(m.id).memo || '' }
      : { ...m, room_no: m.room_no || '', memo: m.memo || '' });
  } catch (_) {
    state.bootstrap.memberships = (state.bootstrap.memberships || []).map((m) => ({ ...m, room_no: m.room_no || '', memo: m.memo || '' }));
  }
}
async function hydrateAttendance() {
  const eventIds = scoped(state.bootstrap?.events || []).map((event) => event.id).filter(Boolean);
  if (!eventIds.length) { state.attendance = []; return; }
  try { state.attendance = await api.listAttendance(eventIds); } catch (_) { state.attendance = []; }
}
async function hydrateLogs() {
  try { state.logs = await api.listActivityLogs(state.selectedCourseId || null); } catch (_) { state.logs = []; }
}
async function hydrateSelectedCourseArtifacts() {
  await Promise.all([hydrateMembershipMeta(), hydrateAttendance(), hydrateLogs()]);
}
function renderMembers() { renderTokenList(); renderSupportList(); }
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
        <button class="btn btn-secondary small" type="button" id="members-open-btn">회원 관리</button>
        <button class="btn btn-secondary small" type="button" id="member-add-open-btn">회원 추가</button>
        <button class="btn btn-secondary small" type="button" id="room-assign-open-btn">방 배정</button>
        <button class="btn btn-secondary small" type="button" id="payment-open-btn">수강생 대조</button>
        <button class="btn btn-secondary small" type="button" id="members-export-btn">엑셀 다운로드</button>
        <button class="btn btn-primary small" type="button" id="copy-signup-link-btn">가입 링크 복사</button>
      </div>
    </div>
  ` : '<div class="empty-state">강의를 선택해주세요.</div>';
  qs('#members-open-btn')?.addEventListener('click', openMembersModal);
  qs('#member-add-open-btn')?.addEventListener('click', () => openModal('member-add-modal'));
  qs('#room-assign-open-btn')?.addEventListener('click', () => { renderRoomAssignPreview(); openModal('room-assign-modal'); });
  qs('#payment-open-btn')?.addEventListener('click', () => openModal('payment-modal'));
  qs('#members-export-btn')?.addEventListener('click', exportMembers);
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
function renderFeatureGrid() {
  const wrap = qs('#feature-grid');
  if (!wrap) return;
  const memberCount = selectedMembers().length;
  const scheduleCount = scoped(state.bootstrap?.schedule || []).length;
  const eventCount = scoped(state.bootstrap?.events || []).length;
  const assignmentCount = scoped(state.bootstrap?.assignments || []).length;
  const supportCount = selectedSupportLinks().length;
  const roomCount = new Set(selectedMembers().map((m) => String(m.room_no || '').trim()).filter(Boolean)).size;
  const items = [
    { id: 'feature-members', label: '회원 관리', count: memberCount, desc: '방번호, 메모, 엑셀을 관리합니다.', accent: true },
    { id: 'feature-events', label: '행사 / QR', count: eventCount, desc: '행사 신청서와 QR 출석을 관리합니다.', accent: true },
    { id: 'feature-payment', label: '수강생 대조', count: memberCount, desc: '엑셀 명단과 가입자를 비교합니다.' },
    { id: 'feature-room-check', label: '방 입장 체크', count: roomCount, desc: '방 배정 기준 입장 여부를 확인합니다.' },
    { id: 'feature-support', label: '고객센터', count: supportCount, desc: '문의 항목과 오픈카톡 링크를 설정합니다.' },
    { id: 'feature-schedule', label: '정규 일정', count: scheduleCount, desc: '정규 수업 일정을 관리합니다.' },
    { id: 'feature-assignment', label: '과제', count: assignmentCount, desc: '주차별 과제를 관리합니다.' },
    { id: 'feature-log', label: '활동 로그', count: (state.logs || []).length, desc: '최근 운영 작업 내역을 봅니다.' }
  ];
  wrap.innerHTML = items.map((item) => `
    <button class="feature-tile ${item.accent ? 'accent' : ''}" type="button" id="${item.id}">
      <span class="feature-tile-top">
        <span class="feature-tile-label">${item.label}</span>
        <span class="feature-count">${item.count}</span>
      </span>
      <span class="feature-tile-desc">${item.desc}</span>
    </button>
  `).join('');
  qs('#feature-members')?.addEventListener('click', openMembersModal);
  qs('#feature-events')?.addEventListener('click', () => openModal('event-modal'));
  qs('#feature-payment')?.addEventListener('click', () => openModal('payment-modal'));
  qs('#feature-room-check')?.addEventListener('click', () => { renderRoomCheckRoomOptions(); openModal('room-check-modal'); });
  qs('#feature-support')?.addEventListener('click', () => openModal('support-modal'));
  qs('#feature-schedule')?.addEventListener('click', () => openModal('schedule-modal'));
  qs('#feature-assignment')?.addEventListener('click', () => openModal('assignment-modal'));
  qs('#feature-log')?.addEventListener('click', async () => { await hydrateLogs(); renderLogs(); openModal('log-modal'); });
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
  qsa('[data-course]', tabs).forEach((btn) => btn.addEventListener('click', async () => {
    state.selectedCourseId = btn.dataset.course;
    await hydrateSelectedCourseArtifacts();
    paintApp();
    await refreshSupportLinks();
  }));
}
function renderEventList() {
  const wrap = qs('#event-list');
  const list = scoped(state.bootstrap?.events || []);
  wrap.innerHTML = list.length ? list.map((item) => {
    const responseCount = eventApplications(item.id).length;
    const attendanceCount = selectedAttendance(item.id).length;
    const bucket = eventBucket(item);
    const badge = bucket === 'open' ? '모집중' : bucket === 'upcoming' ? '예정' : '마감';
    const badgeClass = bucket === 'open' ? 'green' : bucket === 'upcoming' ? 'blue' : 'red';
    return `
    <article class="card">
      <div class="card-header"><div><h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.description || '')}</p></div><div class="row"><span class="pill ${badgeClass}">${badge}</span><button class="btn btn-secondary small" data-edit-event="${item.id}">수정</button><button class="btn btn-danger small" data-delete-event="${item.id}">삭제</button></div></div>
      <div class="kv-list"><div class="kv-row"><strong>행사일</strong><span>${formatDateTime(item.starts_at)}</span></div><div class="kv-row"><strong>신청기간</strong><span>${formatDateTime(item.registration_open_at)} ~ ${formatDateTime(item.registration_close_at)}</span></div><div class="kv-row"><strong>전체 마감</strong><span>${item.max_applicants || '-'}</span></div><div class="kv-row"><strong>QR 출석</strong><span>${attendanceCount}명</span></div></div>
      <div class="event-summary-actions"><button class="btn btn-secondary small" type="button" data-open-responses="${item.id}">응답 ${responseCount}건 보기</button><button class="btn btn-secondary small" type="button" data-export-responses="${item.id}">응답 엑셀</button><button class="btn btn-primary small" type="button" data-open-qr="${item.id}">QR 출석</button></div>
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
      const answers = Object.fromEntries(Object.entries(app.answers || {}).map(([key, value]) => [schemaMap[key] || key, Array.isArray(value) ? value.join(', ') : value]));
      return { 이름: app.full_name, 전화번호: app.phone, 응답일: formatDateTime(app.created_at), ...answers };
    }));
  }));
  qsa('[data-open-qr]').forEach((btn) => btn.addEventListener('click', () => openQrModal(btn.dataset.openQr)));
}
function openMembersModal() {
  renderMembersModal();
  openModal('members-modal');
}
function filteredSelectedMembers() {
  const q = (qs('#member-search')?.value || '').trim().toLowerCase();
  const room = (qs('#member-room-filter')?.value || '').trim().toLowerCase();
  return selectedMembers().filter((row) => {
    const hay = `${row.full_name || ''} ${row.phone || ''}`.toLowerCase();
    const roomValue = String(row.room_no || '').toLowerCase();
    if (q && !hay.includes(q)) return false;
    if (room && !roomValue.includes(room)) return false;
    return true;
  }).sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || ''), 'ko'));
}
function renderMembersModal() {
  const course = getSelectedCourse();
  const table = qs('#members-modal-table');
  const title = qs('#members-modal-title');
  const subtitle = qs('#members-modal-subtitle');
  const members = filteredSelectedMembers();
  if (title) title.textContent = '회원 관리';
  if (subtitle) subtitle.textContent = course ? `${course.title} · 총 ${selectedMembers().length}명` : '';
  if (!table) return;
  table.innerHTML = members.length ? `<table><thead><tr><th>이름</th><th>전화번호</th><th>방번호</th><th>메모</th><th></th></tr></thead><tbody>${members.map((item) => `<tr data-membership-row="${item.id}"><td>${escapeHtml(item.full_name || '')}</td><td>${escapeHtml(item.phone || '')}</td><td><input class="input membership-editor-input" data-field="room_no" value="${escapeHtml(item.room_no || '')}" placeholder="예: 1번방" /></td><td><input class="input membership-editor-input" data-field="memo" value="${escapeHtml(item.memo || '')}" placeholder="메모" /></td><td class="text-right"><button class="btn btn-primary small" type="button" data-save-membership="${item.id}">저장</button> <button class="btn btn-danger small" type="button" data-delete-member-profile="${item.profile_id || ''}" data-delete-member-course="${item.course_id || ''}">수강삭제</button>${state.bootstrap?.is_super_admin ? ` <button class="btn btn-secondary small" data-hard-delete-profile="${item.profile_id || ''}">회원삭제</button>` : ''}</td></tr>`).join('')}</tbody></table>` : '<div class="empty-state">등록된 회원이 없습니다.</div>';
  qsa('[data-save-membership]', table).forEach((btn) => btn.addEventListener('click', () => saveMembershipMeta(btn.dataset.saveMembership)));
  qsa('[data-delete-member-profile]', table).forEach((btn) => btn.addEventListener('click', async () => { await removeMembership(btn.dataset.deleteMemberCourse, btn.dataset.deleteMemberProfile); openMembersModal(); }));
  qsa('[data-hard-delete-profile]', table).forEach((btn) => btn.addEventListener('click', async () => { await hardDeleteProfile(btn.dataset.hardDeleteProfile); openMembersModal(); }));
  qs('#export-members-btn').onclick = exportMembers;
}
async function saveMembershipMeta(membershipId) {
  const rowEl = qs(`[data-membership-row="${membershipId}"]`);
  if (!rowEl) return;
  const roomNo = qs('[data-field="room_no"]', rowEl)?.value.trim() || '';
  const memo = qs('[data-field="memo"]', rowEl)?.value.trim() || '';
  try {
    const res = await api.updateMembershipMeta(membershipId, { room_no: roomNo, memo });
    state.bootstrap.memberships = (state.bootstrap?.memberships || []).map((item) => item.id === membershipId ? { ...item, room_no: res?.room_no ?? roomNo, memo: res?.memo ?? memo } : item);
    showModalMessage('members-modal', '회원 정보를 저장했습니다.');
    await addActivityLog('membership.update', { membership_id: membershipId, room_no: roomNo, memo });
    renderMembersModal();
    renderFeatureGrid();
  } catch (err) {
    showModalMessage('members-modal', err.message || '회원 정보 저장에 실패했습니다.', 'error');
  }
}
async function exportMembers() {
  const course = getSelectedCourse();
  const members = selectedMembers();
  if (!course || !members.length) { showModalMessage('members-modal', '다운로드할 회원이 없습니다.', 'error'); return; }
  exportRowsXlsx(`${course.title}_회원명단.xlsx`, members.map((item) => ({ 이름: item.full_name, 전화번호: item.phone, 방번호: item.room_no || '', 메모: item.memo || '', 등록일: formatDate(item.created_at) })));
  showModalMessage('members-modal', '회원 명단 다운로드를 시작했습니다.');
}
function renderRoomAssignPreview() {
  const target = qs('#room-assign-preview');
  if (!target) return;
  const size = Math.max(1, Number(qs('#room-size')?.value || 30));
  const members = [...selectedMembers()].sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || ''), 'ko'));
  if (!members.length) { target.innerHTML = '<div class="empty-state">배정할 회원이 없습니다.</div>'; return; }
  const groups = [];
  for (let i = 0; i < members.length; i += size) groups.push(members.slice(i, i + size));
  target.innerHTML = `<div class="preview-list">${groups.map((group, idx) => `<div class="notice-box"><strong>${idx + 1}번방</strong><div style="margin-top:8px">${group.map((m) => `<span class="preview-room-chip">${escapeHtml(m.full_name)}</span>`).join('')}</div></div>`).join('')}</div>`;
}
async function runRoomAssign() {
  const size = Math.max(1, Number(qs('#room-size')?.value || 30));
  const members = [...selectedMembers()].sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || ''), 'ko'));
  if (!members.length) { showModalMessage('room-assign-modal', '배정할 회원이 없습니다.', 'error'); return; }
  try {
    const updates = members.map((member, idx) => api.updateMembershipMeta(member.id, { room_no: `${Math.floor(idx / size) + 1}번방` }));
    await Promise.all(updates);
    await hydrateMembershipMeta();
    renderRoomAssignPreview();
    renderMembersModal();
    renderFeatureGrid();
    showModalMessage('room-assign-modal', '자동 방 배정을 완료했습니다.');
    await addActivityLog('room.assign.auto', { size, member_count: members.length });
  } catch (err) {
    showModalMessage('room-assign-modal', err.message || '방 배정에 실패했습니다.', 'error');
  }
}
async function resetRoomAssign() {
  const members = selectedMembers();
  if (!members.length) { showModalMessage('room-assign-modal', '초기화할 회원이 없습니다.', 'error'); return; }
  try {
    await Promise.all(members.map((member) => api.updateMembershipMeta(member.id, { room_no: '' })));
    await hydrateMembershipMeta();
    renderRoomAssignPreview();
    renderMembersModal();
    renderFeatureGrid();
    showModalMessage('room-assign-modal', '방번호를 초기화했습니다.');
    await addActivityLog('room.assign.reset', { member_count: members.length });
  } catch (err) {
    showModalMessage('room-assign-modal', err.message || '초기화에 실패했습니다.', 'error');
  }
}
async function runManualRoomAssign() {
  const roomNo = (qs('#manual-room-target')?.value || '').trim();
  const lines = String(qs('#manual-room-phones')?.value || '').split(/\r?\n/).map((x) => normalizePhoneDigits(x)).filter(Boolean);
  if (!roomNo || !lines.length) { showModalMessage('room-assign-modal', '방번호와 전화번호 목록을 입력해주세요.', 'error'); return; }
  const map = new Map(selectedMembers().map((m) => [normalizePhoneDigits(m.phone), m]));
  const matched = lines.map((phone) => map.get(phone)).filter(Boolean);
  if (!matched.length) { showModalMessage('room-assign-modal', '일치하는 회원을 찾지 못했습니다.', 'error'); return; }
  try {
    await Promise.all(matched.map((member) => api.updateMembershipMeta(member.id, { room_no: roomNo })));
    await hydrateMembershipMeta();
    renderMembersModal();
    renderRoomAssignPreview();
    renderFeatureGrid();
    qs('#manual-room-assign-result').innerHTML = `<div class="notice-box">${matched.length}명에게 ${escapeHtml(roomNo)}을 배정했습니다.</div>`;
    showModalMessage('room-assign-modal', '전화번호 기준 수동 배정을 완료했습니다.');
    await addActivityLog('room.assign.manual', { room_no: roomNo, matched: matched.length });
  } catch (err) {
    showModalMessage('room-assign-modal', err.message || '수동 배정에 실패했습니다.', 'error');
  }
}
async function runPaymentCompare() {
  const file = qs('#payment-file')?.files?.[0];
  if (!file) { showModalMessage('payment-modal', '먼저 엑셀 또는 CSV 파일을 선택해주세요.', 'error'); return; }
  try {
    const rawRows = await parseUploadFile(file);
    const excelRows = parsePaymentRows(rawRows);
    const members = selectedMembers();
    const memberMap = new Map(members.map((row) => [normalizePhoneDigits(row.phone), row]));
    const excelMap = new Map(excelRows.map((row) => [row.phone_digits, row]));
    const matched = [];
    const excelOnly = [];
    excelRows.forEach((row) => {
      const hit = memberMap.get(row.phone_digits);
      if (hit) matched.push({ name: row.name, phone: row.phone, registered_name: hit.full_name, registered_phone: hit.phone, room_no: hit.room_no || '' });
      else excelOnly.push({ name: row.name, phone: row.phone });
    });
    const registeredOnly = members.filter((row) => !excelMap.has(normalizePhoneDigits(row.phone))).map((row) => ({ name: row.full_name, phone: row.phone, room_no: row.room_no || '' }));
    qs('#payment-summary-box').innerHTML = `<div class="notice-box"><div class="row"><span class="pill orange">매칭 ${matched.length}건</span><span class="pill blue">엑셀에만 ${excelOnly.length}건</span><span class="pill red">가입자에만 ${registeredOnly.length}건</span></div></div>`;
    qs('#payment-compare-result').innerHTML = `<div class="compare-columns"><div class="compare-card"><h4>매칭됨</h4>${matched.length ? `<ul>${matched.map((row) => `<li>${escapeHtml(row.registered_name)} / ${escapeHtml(row.registered_phone)}${row.room_no ? ` / ${escapeHtml(row.room_no)}` : ''}</li>`).join('')}</ul>` : '<div class="empty-state">없습니다.</div>'}</div><div class="compare-card"><h4>엑셀에만 있음</h4>${excelOnly.length ? `<ul>${excelOnly.map((row) => `<li>${escapeHtml(row.name)} / ${escapeHtml(row.phone)}</li>`).join('')}</ul>` : '<div class="empty-state">없습니다.</div>'}</div><div class="compare-card"><h4>가입자에만 있음</h4>${registeredOnly.length ? `<ul>${registeredOnly.map((row) => `<li>${escapeHtml(row.name)} / ${escapeHtml(row.phone)}${row.room_no ? ` / ${escapeHtml(row.room_no)}` : ''}</li>`).join('')}</ul>` : '<div class="empty-state">없습니다.</div>'}</div></div>`;
    showModalMessage('payment-modal', '수강생 대조를 완료했습니다.');
    await addActivityLog('payment.compare', { matched: matched.length, excel_only: excelOnly.length, registered_only: registeredOnly.length });
  } catch (err) {
    showModalMessage('payment-modal', err.message || '대조 실행에 실패했습니다.', 'error');
  }
}
function renderRoomCheckRoomOptions() {
  const select = qs('#room-check-room');
  if (!select) return;
  const rooms = Array.from(new Set(selectedMembers().map((m) => String(m.room_no || '').trim()).filter(Boolean))).sort(roomLabelSort);
  select.innerHTML = rooms.length ? rooms.map((room) => `<option value="${escapeHtml(room)}">${escapeHtml(room)}</option>`).join('') : '<option value="">방번호 없음</option>';
}
async function runRoomFileCheck() {
  const roomNo = qs('#room-check-room')?.value || '';
  const file = qs('#room-check-file')?.files?.[0];
  if (!roomNo || !file) { showModalMessage('room-check-modal', '방번호와 로그 파일을 모두 선택해주세요.', 'error'); return; }
  try {
    const rawRows = await parseUploadFile(file);
    const parsed = parseAttendanceLines(rawRows);
    const members = selectedMembers().filter((m) => String(m.room_no || '').trim() === roomNo);
    const present = [];
    const absent = [];
    members.forEach((member) => {
      const name = normalizeName(member.full_name || '');
      const phone4 = last4(member.phone || '');
      const activeSet = parsed.activeByName.get(name);
      const isIn = !!(activeSet && (activeSet.has(phone4) || activeSet.has(parsed.NAME_ONLY)));
      (isIn ? present : absent).push(member);
    });
    qs('#room-check-summary').innerHTML = `<div class="notice-box"><div class="row"><span class="pill orange">대상 ${members.length}명</span><span class="pill blue">입장 ${present.length}명</span><span class="pill red">미입장 ${absent.length}명</span></div></div>`;
    qs('#room-check-result').innerHTML = `<div class="compare-columns"><div class="compare-card"><h4>${escapeHtml(roomNo)} 입장</h4>${present.length ? `<ul>${present.map((m) => `<li>${escapeHtml(m.full_name)} / ${escapeHtml(m.phone)}</li>`).join('')}</ul>` : '<div class="empty-state">없습니다.</div>'}</div><div class="compare-card"><h4>${escapeHtml(roomNo)} 미입장</h4>${absent.length ? `<ul>${absent.map((m) => `<li>${escapeHtml(m.full_name)} / ${escapeHtml(m.phone)}</li>`).join('')}</ul>` : '<div class="empty-state">없습니다.</div>'}</div></div>`;
    showModalMessage('room-check-modal', '방 입장 체크를 완료했습니다.');
    await addActivityLog('room.check', { room_no: roomNo, present: present.length, absent: absent.length, line_count: parsed.line_count });
  } catch (err) {
    showModalMessage('room-check-modal', err.message || '입장 체크에 실패했습니다.', 'error');
  }
}
function openQrModal(eventId) {
  const event = (state.bootstrap?.events || []).find((item) => item.id === eventId);
  if (!event) return;
  state.currentQrEventId = eventId;
  const url = buildCheckinUrl(eventId);
  qs('#qr-title').textContent = `${event.title} QR 출석`;
  qs('#qr-subtitle').textContent = `${formatDateTime(event.starts_at)} · 신청 ${eventApplications(eventId).length}명 · 출석 ${selectedAttendance(eventId).length}명`;
  qs('#qr-checkin-url').value = url;
  qs('#qr-grid').innerHTML = `<div class="qr-card"><strong>공용 체크인 QR</strong><div class="muted" style="margin-top:6px">수강생이 로그인된 상태에서 QR 또는 링크로 접속하면 본인 계정으로 출석 처리할 수 있습니다.</div><div class="qr-image-wrap" id="qr-shared"></div><div class="code-box">${escapeHtml(url)}</div></div>`;
  renderQrVisual(qs('#qr-shared'), url, 220);
  renderAttendanceTable(eventId);
  openModal('qr-modal');
}
function renderAttendanceTable(eventId = state.currentQrEventId) {
  const apps = eventApplications(eventId);
  const attendanceMap = new Map(selectedAttendance(eventId).map((item) => [item.profile_id, item]));
  const wrap = qs('#attendance-table-wrap');
  if (!wrap) return;
  wrap.innerHTML = `<div class="table-wrap"><table><thead><tr><th>이름</th><th>전화번호</th><th>신청 상태</th><th>출석 상태</th><th>체크인 시각</th><th>방식</th><th></th></tr></thead><tbody>${apps.length ? apps.map((app) => { const att = attendanceMap.get(app.profile_id); return `<tr><td>${escapeHtml(app.full_name || '')}</td><td>${escapeHtml(app.phone || '')}</td><td>신청완료</td><td>${att ? '출석완료' : '미출석'}</td><td>${att ? formatDateTime(att.checked_in_at) : '-'}</td><td>${escapeHtml(att?.method || '-')}</td><td class="text-right">${att ? `<button class="btn btn-danger small" type="button" data-cancel-attendance="${att.id}">취소</button>` : `<button class="btn btn-primary small" type="button" data-manual-attend="${app.profile_id}">수동 출석</button>`}</td></tr>`; }).join('') : '<tr><td colspan="7">신청자가 없습니다.</td></tr>'}</tbody></table></div>`;
  qsa('[data-manual-attend]').forEach((btn) => btn.addEventListener('click', () => markManualAttendance(eventId, btn.dataset.manualAttend)));
  qsa('[data-cancel-attendance]').forEach((btn) => btn.addEventListener('click', () => cancelAttendanceAction(btn.dataset.cancelAttendance)));
}
async function markManualAttendance(eventId, profileId) {
  try {
    await api.markAttendance(eventId, profileId, 'admin_manual');
    await hydrateAttendance();
    renderAttendanceTable(eventId);
    renderEventList();
    qs('#qr-subtitle').textContent = `${formatDateTime((state.bootstrap?.events || []).find((e) => e.id === eventId)?.starts_at)} · 신청 ${eventApplications(eventId).length}명 · 출석 ${selectedAttendance(eventId).length}명`;
    showModalMessage('qr-modal', '수동 출석 처리를 완료했습니다.');
    await addActivityLog('attendance.checkin', { event_id: eventId, profile_id: profileId, method: 'admin_manual' }, state.selectedCourseId, profileId);
  } catch (err) {
    showModalMessage('qr-modal', err.message || '출석 처리에 실패했습니다.', 'error');
  }
}
async function cancelAttendanceAction(attendanceId) {
  try {
    await api.cancelAttendance(attendanceId);
    await hydrateAttendance();
    renderAttendanceTable(state.currentQrEventId);
    renderEventList();
    showModalMessage('qr-modal', '출석을 취소했습니다.');
    await addActivityLog('attendance.cancel', { attendance_id: attendanceId });
  } catch (err) {
    showModalMessage('qr-modal', err.message || '출석 취소에 실패했습니다.', 'error');
  }
}
function renderLogs() {
  const wrap = qs('#log-table-wrap');
  if (!wrap) return;
  const rows = state.logs || [];
  wrap.innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>시각</th><th>작업</th><th>작업자</th><th>상세</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${formatDateTime(row.created_at)}</td><td>${escapeHtml(row.action || '')}</td><td>${escapeHtml(row.actor || '')}</td><td><code>${escapeHtml(JSON.stringify(row.detail || {}))}</code></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty-state">활동 로그가 없습니다.</div>';
}
async function refreshBootstrap() {
  const res = await api.getBootstrap(state.sessionToken);
  if (!res?.ok) throw new Error(res?.message || '데이터를 불러오지 못했습니다.');
  state.bootstrap = res;
  const courseIds = (res.courses || []).map((course) => course.id);
  if (!courseIds.includes(state.selectedCourseId)) state.selectedCourseId = courseIds[0] || '';
  await hydrateSelectedCourseArtifacts();
  paintApp();
  await refreshSupportLinks();
}
function bindPatchedFeatures() {
  ['members-modal','room-assign-modal','payment-modal','room-check-modal','qr-modal','log-modal'].forEach((id) => {
    qs(`#${id}`)?.addEventListener('click', (e) => { if (e.target.id === id) closeModal(id); });
    qsa(`[data-close-modal="${id}"]`).forEach((btn) => btn.addEventListener('click', () => closeModal(id)));
  });
  qs('#member-search')?.addEventListener('input', renderMembersModal);
  qs('#member-room-filter')?.addEventListener('input', renderMembersModal);
  qs('#open-member-add-modal')?.addEventListener('click', () => openModal('member-add-modal'));
  qs('#open-room-assign-modal')?.addEventListener('click', () => { renderRoomAssignPreview(); openModal('room-assign-modal'); });
  qs('#room-size')?.addEventListener('input', renderRoomAssignPreview);
  qs('#run-room-assign-btn')?.addEventListener('click', runRoomAssign);
  qs('#reset-room-assign-btn')?.addEventListener('click', resetRoomAssign);
  qs('#run-manual-room-assign-btn')?.addEventListener('click', runManualRoomAssign);
  qs('#run-payment-compare-btn')?.addEventListener('click', runPaymentCompare);
  qs('#run-room-file-check-btn')?.addEventListener('click', runRoomFileCheck);
  qs('#copy-qr-link-btn')?.addEventListener('click', async () => {
    const url = qs('#qr-checkin-url')?.value || '';
    if (!url) { showModalMessage('qr-modal', '복사할 체크인 링크가 없습니다.', 'error'); return; }
    try { await navigator.clipboard.writeText(url); showModalMessage('qr-modal', '체크인 링크를 복사했습니다.'); } catch (_) { showModalMessage('qr-modal', '링크 복사에 실패했습니다.', 'error'); }
  });
  qs('#open-qr-link-btn')?.addEventListener('click', () => {
    const url = qs('#qr-checkin-url')?.value || '';
    if (!url) { showModalMessage('qr-modal', '열 수 있는 체크인 링크가 없습니다.', 'error'); return; }
    window.open(url, '_blank');
  });
}
async function init() {
  ensureTitle();
  bindForms();
  bindPatchedFeatures();
  await initAuth();
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

init();
