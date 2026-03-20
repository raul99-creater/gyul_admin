import { APP_CONFIG } from '../config.js';
import { assignAdminRole, bootstrapAdminSignUp, createAssignment, createCourse, createEvent, createSchedule, createToken, deleteRecord, getModeLabel, getSession, loadAdminData, requestAdminAccess, signIn } from '../core/service.js';
import { renderFooter, renderHeader, setStatus, wireLogoutButtons } from '../core/ui.js';
import { escapeHtml, fmtDate, slugify } from '../core/utils.js';
import { resetDemoData } from '../core/demo-store.js';

renderHeader('admin');
renderFooter();
wireLogoutButtons();
document.getElementById('modeBadge').textContent = getModeLabel();
let adminData = null;

function toggleAuthState(isLoggedIn) {
  document.getElementById('adminAuthSection').classList.toggle('hidden', isLoggedIn);
  document.getElementById('adminAppSection').classList.toggle('hidden', !isLoggedIn);
}

function resolveCourseTitle(courseId) {
  const course = adminData?.courses?.find((item) => item.id === courseId);
  if (!course) return '-';
  return [course.title, course.instructor_name, course.cohort_label].filter(Boolean).join(' · ');
}

function getProfileText(userId) {
  const profile = adminData?.profiles?.find((item) => item.id === userId);
  return profile ? `${profile.full_name || '-'} (${profile.email || '-'})` : userId;
}

async function refreshAdmin() {
  adminData = await loadAdminData();
  if (!adminData.session?.user) {
    toggleAuthState(false);
    return;
  }
  toggleAuthState(true);
  renderScope();
  renderCourseSelects();
  renderStats();
  renderTables();
}

function renderScope() {
  const scopeBox = document.getElementById('scopeBox');
  const isSuper = adminData.scope?.isSuperAdmin;
  scopeBox.innerHTML = `
    <div class="notice-box">
      현재 권한: <strong>${isSuper ? '슈퍼어드민' : '강사 어드민'}</strong><br>
      ${isSuper ? '모든 강사/기수의 회원, 토큰, 일정, 행사, 과제, 어드민 권한을 볼 수 있습니다.' : '배정된 강의(강사/기수) 범위 안에서 일정, 행사, 과제, 회원만 관리합니다.'}
    </div>`;
  document.getElementById('courseCreateCard').classList.toggle('hidden', !isSuper);
  document.getElementById('roleAssignCard').classList.toggle('hidden', !isSuper);
  document.getElementById('adminRequestCard').classList.toggle('hidden', !isSuper);
}

function renderCourseSelects() {
  const selectIds = ['courseSelectSchedule','courseSelectEvent','courseSelectAssignment','courseSelectToken','roleCourseSelect','requestCourse'];
  const options = adminData.courses.map((course) => `<option value="${course.id}">${escapeHtml(resolveCourseTitle(course.id))}</option>`).join('');
  const empty = '<option value="">강의 없음</option>';
  selectIds.forEach((id) => {
    const node = document.getElementById(id);
    if (node) node.innerHTML = options || empty;
  });
}

function renderStats() {
  document.getElementById('statCourses').textContent = String(adminData.courses.length);
  document.getElementById('statSchedule').textContent = String(adminData.schedule.length);
  document.getElementById('statEvents').textContent = String(adminData.events.length);
  document.getElementById('statAssignments').textContent = String(adminData.assignments.length);
  document.getElementById('statTokens').textContent = String(adminData.tokens.length);
  document.getElementById('statMembers').textContent = String(adminData.memberships.length);
  document.getElementById('statRequests').textContent = String(adminData.adminRequests?.length || 0);
}

function actionButton(table, id) {
  return `<button class="btn btn-ghost small" data-delete-table="${table}" data-delete-id="${id}">삭제</button>`;
}

function renderTables() {
  document.getElementById('courseTable').innerHTML = adminData.courses.length ? adminData.courses.map((course) => `
    <tr><td>${escapeHtml(course.instructor_name || '-')}</td><td>${escapeHtml(course.cohort_label || '-')}</td><td>${escapeHtml(course.title)}</td><td>${escapeHtml(course.slug || '-')}</td><td>${actionButton('courses', course.id)}</td></tr>`).join('') : '<tr><td colspan="5">강의가 없습니다.</td></tr>';

  document.getElementById('scheduleTable').innerHTML = adminData.schedule.length ? adminData.schedule.map((row) => `
    <tr><td>${escapeHtml(resolveCourseTitle(row.course_id))}</td><td>${escapeHtml(String(row.week_no || '-'))}</td><td>${escapeHtml(row.title)}</td><td>${escapeHtml(fmtDate(row.starts_at))}</td><td>${actionButton('course_schedule', row.id)}</td></tr>`).join('') : '<tr><td colspan="5">일정이 없습니다.</td></tr>';

  document.getElementById('eventTable').innerHTML = adminData.events.length ? adminData.events.map((row) => `
    <tr><td>${escapeHtml(resolveCourseTitle(row.course_id))}</td><td>${escapeHtml(row.title)}</td><td>${escapeHtml(row.category || '-')}</td><td>${escapeHtml(fmtDate(row.registration_open_at))}</td><td>${escapeHtml(fmtDate(row.registration_close_at))}</td><td>${actionButton('course_events', row.id)}</td></tr>`).join('') : '<tr><td colspan="6">행사가 없습니다.</td></tr>';

  document.getElementById('assignmentTable').innerHTML = adminData.assignments.length ? adminData.assignments.map((row) => `
    <tr><td>${escapeHtml(resolveCourseTitle(row.course_id))}</td><td>${escapeHtml(String(row.week_no || '-'))}</td><td>${escapeHtml(row.title)}</td><td>${escapeHtml(fmtDate(row.due_at))}</td><td>${actionButton('course_assignments', row.id)}</td></tr>`).join('') : '<tr><td colspan="5">과제가 없습니다.</td></tr>';

  document.getElementById('tokenTable').innerHTML = adminData.tokens.length ? adminData.tokens.map((row) => `
    <tr><td>${escapeHtml(resolveCourseTitle(row.course_id))}</td><td>${escapeHtml(row.token_name || '-')}</td><td><code>${escapeHtml(row.token)}</code></td><td>${escapeHtml(fmtDate(row.expires_at))}</td><td>${actionButton('signup_tokens', row.id)}</td></tr>`).join('') : '<tr><td colspan="5">토큰이 없습니다.</td></tr>';

  const mainBase = APP_CONFIG.mainAppUrl || '';
  document.getElementById('tokenLinks').innerHTML = adminData.tokens.length ? adminData.tokens.map((row) => `
    <div class="token-preview">
      <strong>${escapeHtml(row.token_name || resolveCourseTitle(row.course_id))}</strong>
      <div class="muted" style="margin-top:6px">${escapeHtml(resolveCourseTitle(row.course_id))} 회원가입 링크</div>
      <code>${mainBase ? `${mainBase.replace(/\/$/, '')}/signup.html?token=${encodeURIComponent(row.token)}` : `token=${escapeHtml(row.token)}`}</code>
    </div>`).join('') : '<div class="empty-state">생성된 토큰이 없습니다.</div>';
  document.getElementById('tokenLinks').querySelectorAll('code').forEach((code) => { code.style.display = 'block'; code.style.marginTop = '8px'; code.style.wordBreak = 'break-all'; });

  document.getElementById('memberTable').innerHTML = adminData.memberships.length ? adminData.memberships.map((row) => `
    <tr><td>${escapeHtml(resolveCourseTitle(row.course_id))}</td><td>${escapeHtml(getProfileText(row.user_id))}</td><td>${escapeHtml(row.role || 'student')}</td><td>${escapeHtml(fmtDate(row.created_at))}</td></tr>`).join('') : '<tr><td colspan="4">회원이 없습니다.</td></tr>';

  document.getElementById('roleTable').innerHTML = (adminData.adminRoles || []).length ? adminData.adminRoles.map((row) => `
    <tr><td>${escapeHtml(getProfileText(row.user_id))}</td><td>${escapeHtml(row.role_type)}</td><td>${escapeHtml(resolveCourseTitle(row.course_id))}</td><td>${escapeHtml(fmtDate(row.created_at))}</td><td>${row.role_type === 'super_admin' ? '' : actionButton('course_admin_roles', row.id)}</td></tr>`).join('') : '<tr><td colspan="5">어드민 권한이 없습니다.</td></tr>';

  const requestTable = document.getElementById('requestTable');
  if (requestTable) {
    requestTable.innerHTML = (adminData.adminRequests || []).length ? adminData.adminRequests.map((row) => `
      <tr><td>${escapeHtml(row.full_name || '-')}</td><td>${escapeHtml(row.requester_email || '-')}</td><td>${escapeHtml(row.requested_role_type || '-')}</td><td>${escapeHtml(resolveCourseTitle(row.requested_course_id))}</td><td>${escapeHtml(row.status || '-')}</td><td>${escapeHtml(row.memo || '-')}</td></tr>`).join('') : '<tr><td colspan="6">가입 신청이 없습니다.</td></tr>';
  }
}

async function handleAdminLogin(event) {
  event.preventDefault();
  try {
    setStatus('어드민 로그인 중...', '');
    await signIn(document.getElementById('adminEmail').value.trim(), document.getElementById('adminPassword').value.trim());
    await refreshAdmin();
    setStatus('어드민 화면을 불러왔습니다.', 'ok');
  } catch (error) {
    setStatus(error.message || '로그인에 실패했습니다.', 'err');
  }
}

async function handleBootstrap(event) {
  event.preventDefault();
  try {
    setStatus('첫 관리자 계정을 생성 중...', '');
    await bootstrapAdminSignUp(document.getElementById('bootstrapEmail').value.trim(), document.getElementById('bootstrapPassword').value.trim(), document.getElementById('bootstrapName').value.trim());
    setStatus('계정 생성이 완료되었습니다. 이어서 Supabase SQL Editor에서 bootstrap_super_admin(이메일)을 1회 실행하세요.', 'ok');
  } catch (error) {
    setStatus(error.message || '관리자 계정 생성에 실패했습니다.', 'err');
  }
}

async function handleRequestSignup(event) {
  event.preventDefault();
  try {
    setStatus('어드민 가입 신청을 등록 중...', '');
    await requestAdminAccess({
      fullName: document.getElementById('requestName').value.trim(),
      phone: document.getElementById('requestPhone').value.trim(),
      email: document.getElementById('requestEmail').value.trim(),
      password: document.getElementById('requestPassword').value.trim(),
      requestedRole: document.getElementById('requestRole').value,
      requestedCourseId: document.getElementById('requestCourse').value || null,
      memo: document.getElementById('requestMemo').value.trim(),
    });
    setStatus('가입 신청이 등록되었습니다. 슈퍼어드민이 권한을 부여하면 로그인할 수 있습니다.', 'ok');
    event.target.reset();
  } catch (error) {
    setStatus(error.message || '가입 신청에 실패했습니다.', 'err');
  }
}

async function submitCourse(event) {
  event.preventDefault();
  try {
    await createCourse({
      title: document.getElementById('courseTitle').value.trim(),
      subtitle: document.getElementById('courseSubtitle').value.trim(),
      description: document.getElementById('courseDescription').value.trim(),
      accentColor: document.getElementById('courseColor').value.trim() || '#ff9d4d',
      instructorName: document.getElementById('courseInstructor').value.trim(),
      cohortLabel: document.getElementById('courseCohort').value.trim(),
      slug: slugify(`${document.getElementById('courseInstructor').value.trim()}-${document.getElementById('courseTitle').value.trim()}-${document.getElementById('courseCohort').value.trim()}`),
    });
    await refreshAdmin();
    setStatus('강의/기수를 생성했습니다.', 'ok');
    event.target.reset();
    document.getElementById('courseColor').value = '#ff9d4d';
  } catch (error) {
    setStatus(error.message || '강의 생성에 실패했습니다.', 'err');
  }
}

async function submitSchedule(event) {
  event.preventDefault();
  try {
    await createSchedule({
      courseId: document.getElementById('courseSelectSchedule').value,
      weekNo: document.getElementById('scheduleWeek').value,
      title: document.getElementById('scheduleTitle').value.trim(),
      startsAt: document.getElementById('scheduleStart').value,
      endsAt: document.getElementById('scheduleEnd').value,
      location: document.getElementById('scheduleLocation').value.trim(),
      description: document.getElementById('scheduleDescription').value.trim(),
    });
    await refreshAdmin();
    setStatus('강의 일정을 등록했습니다.', 'ok');
    event.target.reset();
  } catch (error) {
    setStatus(error.message || '강의 일정 등록에 실패했습니다.', 'err');
  }
}

async function submitEvent(event) {
  event.preventDefault();
  try {
    await createEvent({
      courseId: document.getElementById('courseSelectEvent').value,
      title: document.getElementById('eventTitle').value.trim(),
      category: document.getElementById('eventCategory').value,
      openAt: document.getElementById('eventOpen').value,
      closeAt: document.getElementById('eventClose').value,
      startsAt: document.getElementById('eventStart').value,
      endsAt: document.getElementById('eventEnd').value,
      location: document.getElementById('eventLocation').value.trim(),
      description: document.getElementById('eventDescription').value.trim(),
      applyUrl: document.getElementById('eventApplyUrl').value.trim(),
    });
    await refreshAdmin();
    setStatus('행사를 등록했습니다.', 'ok');
    event.target.reset();
  } catch (error) {
    setStatus(error.message || '행사 등록에 실패했습니다.', 'err');
  }
}

async function submitAssignment(event) {
  event.preventDefault();
  try {
    await createAssignment({
      courseId: document.getElementById('courseSelectAssignment').value,
      weekNo: document.getElementById('assignmentWeek').value,
      title: document.getElementById('assignmentTitle').value.trim(),
      dueAt: document.getElementById('assignmentDue').value,
      description: document.getElementById('assignmentDescription').value.trim(),
      materialUrl: document.getElementById('assignmentMaterialUrl').value.trim(),
      isRequired: document.getElementById('assignmentRequired').checked,
    });
    await refreshAdmin();
    setStatus('과제를 등록했습니다.', 'ok');
    event.target.reset();
    document.getElementById('assignmentRequired').checked = true;
  } catch (error) {
    setStatus(error.message || '과제 등록에 실패했습니다.', 'err');
  }
}

async function submitToken(event) {
  event.preventDefault();
  try {
    const tokenValue = document.getElementById('tokenValue').value.trim() || `${document.getElementById('tokenName').value.trim().replace(/\s+/g, '-').toUpperCase()}-${Date.now().toString().slice(-6)}`;
    await createToken({
      courseId: document.getElementById('courseSelectToken').value,
      token: tokenValue,
      tokenName: document.getElementById('tokenName').value.trim(),
      welcomeMessage: document.getElementById('tokenMessage').value.trim(),
      expiresAt: document.getElementById('tokenExpires').value,
      maxUses: document.getElementById('tokenMaxUses').value,
    });
    await refreshAdmin();
    setStatus('회원가입 토큰을 만들었습니다.', 'ok');
    event.target.reset();
  } catch (error) {
    setStatus(error.message || '토큰 생성에 실패했습니다.', 'err');
  }
}

async function submitRoleAssign(event) {
  event.preventDefault();
  try {
    await assignAdminRole({
      email: document.getElementById('roleAssignEmail').value.trim(),
      roleType: document.getElementById('roleType').value,
      courseId: document.getElementById('roleCourseSelect').value || null,
    });
    await refreshAdmin();
    setStatus('어드민 권한을 부여했습니다.', 'ok');
    event.target.reset();
  } catch (error) {
    setStatus(error.message || '권한 부여에 실패했습니다.', 'err');
  }
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-delete-table]');
  if (!button) return;
  try {
    await deleteRecord(button.dataset.deleteTable, button.dataset.deleteId);
    await refreshAdmin();
    setStatus('항목을 삭제했습니다.', 'ok');
  } catch (error) {
    setStatus(error.message || '삭제에 실패했습니다.', 'err');
  }
});

document.getElementById('adminLoginForm').addEventListener('submit', handleAdminLogin);
document.getElementById('bootstrapForm').addEventListener('submit', handleBootstrap);
document.getElementById('requestForm').addEventListener('submit', handleRequestSignup);
document.getElementById('courseForm').addEventListener('submit', submitCourse);
document.getElementById('scheduleForm').addEventListener('submit', submitSchedule);
document.getElementById('eventForm').addEventListener('submit', submitEvent);
document.getElementById('assignmentForm').addEventListener('submit', submitAssignment);
document.getElementById('tokenForm').addEventListener('submit', submitToken);
document.getElementById('roleAssignForm').addEventListener('submit', submitRoleAssign);
document.querySelector('[data-action="reset-demo"]').addEventListener('click', () => { resetDemoData(); setStatus('초기화했습니다.', 'ok'); });

await refreshAdmin();
const existing = await getSession();
if (existing?.user) setStatus('로그인된 어드민 정보를 불러왔습니다.', 'ok');
else setStatus('어드민 로그인 또는 가입 신청을 진행하세요.', '');
