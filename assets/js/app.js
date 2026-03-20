import { APP_CONFIG } from './config.js';
import { api } from './api.js';
import { qs, qsa, escapeHtml, formatDateTime, formatDate, eventBucket, setMessage, saveSession, loadSession, clearSession, groupBy } from './utils.js';

const sessionKey = APP_CONFIG.sessionStorageKey;
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
  responseSchemaMap: {}
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
function eventApplications(eventId) { return (state.bootstrap?.applications || []).filter((item) => item.event_id === eventId); }
function xlsxAvailable() { return typeof window !== 'undefined' && !!window.XLSX; }
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
  table.innerHTML = members.length ? `<table><thead><tr><th>이름</th><th>전화번호</th><th>등록일</th><th></th></tr></thead><tbody>${members.map((item) => `<tr><td>${escapeHtml(item.full_name)}</td><td>${escapeHtml(item.phone)}</td><td>${formatDate(item.created_at)}</td><td class="text-right"><button class="btn btn-danger small" data-delete-membership="${item.id}">삭제</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty-state">등록된 회원이 없습니다.</div>';
  qsa('[data-delete-membership]', table).forEach((btn) => btn.addEventListener('click', () => removeItem('membership', btn.dataset.deleteMembership)));
  modal.hidden = false;
  qs('#export-members-btn').onclick = () => exportRowsXlsx(`${course?.title || 'members'}_회원명단.xlsx`, members.map((item) => ({ 이름: item.full_name, 전화번호: item.phone, 등록일: formatDate(item.created_at) })));
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
  const token = primaryToken();
  const link = token ? buildSignupUrl(token.token) : '';
  wrap.innerHTML = course ? `
    <div class="member-summary-top">
      <div class="member-total">
        <span class="label">회원 수</span>
        <strong class="value">${members.length}</strong>
      </div>
      <div class="member-summary-actions">
        <button class="btn btn-secondary small" type="button" id="members-open-btn">회원 목록</button>
        <button class="btn btn-secondary small" type="button" id="members-export-btn">엑셀 다운로드</button>
        <button class="btn btn-primary small" type="button" id="copy-signup-link-btn">가입 링크 복사</button>
      </div>
    </div>
    <div class="notice-box">${token ? `현재 가입 링크가 연결되어 있습니다.` : '아직 가입 링크가 없습니다. 복사 버튼을 누르면 자동으로 생성됩니다.'}</div>
  ` : '<div class="empty-state">강의를 선택해주세요.</div>';
  qs('#members-open-btn')?.addEventListener('click', openMembersModal);
  qs('#members-export-btn')?.addEventListener('click', () => exportRowsXlsx(`${course?.title || 'members'}_회원명단.xlsx`, members.map((item) => ({ 이름: item.full_name, 전화번호: item.phone, 등록일: formatDate(item.created_at) }))));
  qs('#copy-signup-link-btn')?.addEventListener('click', async () => {
    try {
      const current = await ensureSignupLink();
      const signupUrl = buildSignupUrl(current.token);
      await navigator.clipboard.writeText(signupUrl);
      setMessage(qs('#app-message'), '가입 링크를 복사했습니다. mainAppUrl이 실제 메인 주소인지 확인해주세요.');
    } catch (err) {
      setMessage(qs('#app-message'), err.message || '가입 링크 복사에 실패했습니다.', 'error');
    }
  });
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
}

function renderRequestsAndRoles() {
  const requestWrap = qs('#request-list-table');
  const roleWrap = qs('#role-list-table');
  const superSection = qs('#super-only');
  if (!state.bootstrap?.is_super_admin) { superSection.hidden = true; return; }
  superSection.hidden = false;
  const courseMap = Object.fromEntries((state.bootstrap.courses || []).map((course) => [course.id, course]));
  const requests = state.bootstrap.requests || [];
  requestWrap.innerHTML = requests.length ? `<table><thead><tr><th>이름</th><th>연락처</th><th>담당 강사</th><th>상태</th><th></th></tr></thead><tbody>${requests.map((item) => {
    const reqCourse = courseMap[item.requested_course_id] || null;
    return `<tr><td>${escapeHtml(item.full_name)}</td><td>${escapeHtml(item.phone)}</td><td>${escapeHtml(reqCourse?.instructor_name || '')}</td><td>${escapeHtml(item.status)}</td><td class="text-right">${item.status === 'pending' ? `<button class="btn btn-primary small" data-approve-request="${item.id}">승인</button> <button class="btn btn-secondary small" data-reject-request="${item.id}">반려</button>` : ''}</td></tr>`;
  }).join('')}</tbody></table>` : '<div class="empty-state">신청 내역이 없습니다.</div>';
  qsa('[data-approve-request]').forEach((btn) => btn.addEventListener('click', () => resolveRequest(btn.dataset.approveRequest, 'approved')));
  qsa('[data-reject-request]').forEach((btn) => btn.addEventListener('click', () => resolveRequest(btn.dataset.rejectRequest, 'rejected')));

  const roles = state.bootstrap.roles || [];
  roleWrap.innerHTML = roles.length ? `<table><thead><tr><th>이름</th><th>연락처</th><th>권한</th><th>대상</th><th></th></tr></thead><tbody>${roles.map((item) => `<tr><td>${escapeHtml(item.full_name || '')}</td><td>${escapeHtml(item.phone || '')}</td><td>${escapeHtml(item.role_type)}</td><td>${escapeHtml(item.course_id ? (courseMap[item.course_id]?.instructor_name || '') : '전체')}</td><td class="text-right"><button class="btn btn-danger small" data-role-profile="${item.profile_id || ''}" data-role-type="${item.role_type || ''}" data-role-course="${item.course_id || ''}">삭제</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty-state">권한 정보가 없습니다.</div>';
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

function paintApp() {
  qs('#auth-section').hidden = true;
  qs('#app-main').hidden = false;
  qs('#app-nav').hidden = false;
  qs('#admin-name').textContent = state.bootstrap?.is_super_admin ? '슈퍼어드민' : (state.bootstrap?.profile?.full_name || '관리자');
  renderStats();
  renderCourseTabs();
  renderOverview();
  renderCourseList();
  renderScheduleList();
  renderAssignmentList();
  renderEventList();
  renderMembers();
  renderRequestsAndRoles();
}

async function refreshBootstrap() {
  const res = await api.getBootstrap(state.sessionToken);
  if (!res?.ok) throw new Error(res?.message || '데이터를 불러오지 못했습니다.');
  state.bootstrap = res;
  const courseIds = (res.courses || []).map((course) => course.id);
  if (!courseIds.includes(state.selectedCourseId)) state.selectedCourseId = courseIds[0] || '';
  paintApp();
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
    setMessage(loginMsg, '최초 슈퍼어드민은 서버 SQL에서 수동 등록 후 로그인하세요.', '');
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
      const res = await api.upsertMember(state.sessionToken, state.selectedCourseId, form.full_name.value.trim(), form.phone.value.trim());
      if (!res?.ok) throw new Error(res?.message || '회원 추가에 실패했습니다.');
      form.reset();
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
  qs('#course-modal')?.addEventListener('click', (e) => { if (e.target.id === 'course-modal') closeCourseModal(); });
  qs('#responses-modal')?.addEventListener('click', (e) => { if (e.target.id === 'responses-modal') closeResponsesModal(); });
  qs('#members-modal')?.addEventListener('click', (e) => { if (e.target.id === 'members-modal') closeMembersModal(); });
  qs('#close-responses-modal')?.addEventListener('click', closeResponsesModal);
  qs('#close-members-modal')?.addEventListener('click', closeMembersModal);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeCourseModal(); closeResponsesModal(); closeMembersModal(); } });

  qs('#signout-btn')?.addEventListener('click', async () => {
    try { await api.signOut(state.sessionToken); } catch {}
    clearSession(sessionKey); state.sessionToken = ''; state.bootstrap = null;
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

init();
