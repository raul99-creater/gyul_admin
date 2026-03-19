import { createDemoState } from './demo-data.js';
import { uid, slugify } from './utils.js';

const DATA_KEY = 'gyulgyul_portal_demo_data_v2';
const SESSION_KEY = 'gyulgyul_portal_demo_session_v2';

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function loadRaw() {
  const raw = localStorage.getItem(DATA_KEY);
  if (!raw) {
    const seeded = createDemoState();
    localStorage.setItem(DATA_KEY, JSON.stringify(seeded));
    return seeded;
  }
  try { return JSON.parse(raw); }
  catch {
    const seeded = createDemoState();
    localStorage.setItem(DATA_KEY, JSON.stringify(seeded));
    return seeded;
  }
}
function saveRaw(data) { localStorage.setItem(DATA_KEY, JSON.stringify(data)); }

export function resetDemoData() { saveRaw(createDemoState()); localStorage.removeItem(SESSION_KEY); }
export function getDemoState() { return clone(loadRaw()); }
export function setDemoState(data) { saveRaw(clone(data)); }
export function getDemoSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
export function setDemoSession(session) { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); }
export function clearDemoSession() { localStorage.removeItem(SESSION_KEY); }

export async function demoSignIn(email, password) {
  const data = loadRaw();
  const authUser = data.authUsers.find((item) => item.email === email && item.password === password);
  if (!authUser) throw new Error('이메일 또는 비밀번호가 맞지 않습니다.');
  const profile = data.profiles.find((item) => item.id === authUser.user_id);
  const session = { user: { id: authUser.user_id, email: authUser.email }, profile };
  setDemoSession(session);
  return session;
}

export async function bootstrapDemoAdminSignUp(email, password, fullName) {
  const data = loadRaw();
  if (data.authUsers.some((item) => item.email === email)) throw new Error('이미 존재하는 이메일입니다.');
  const userId = uid('user');
  data.authUsers.push({ email, password, user_id: userId });
  data.profiles.push({ id: userId, email, full_name: fullName, phone: '', role_hint: 'super_admin' });
  saveRaw(data);
  const session = { user: { id: userId, email }, profile: data.profiles.find((item) => item.id === userId) };
  setDemoSession(session);
  return { session };
}

export async function demoSignUpWithToken({ token, email, password, fullName, phone }) {
  const data = loadRaw();
  const invite = data.signup_tokens.find((item) => item.token === token && item.is_active);
  if (!invite) throw new Error('유효하지 않은 토큰입니다.');
  if (data.authUsers.some((item) => item.email === email)) throw new Error('이미 사용 중인 이메일입니다.');
  const userId = uid('user');
  data.authUsers.push({ email, password, user_id: userId });
  data.profiles.push({ id: userId, email, full_name: fullName, phone, role_hint: 'student' });
  data.course_memberships.push({ id: uid('mem'), course_id: invite.course_id, user_id: userId, role: 'student', created_at: new Date().toISOString() });
  saveRaw(data);
  const session = { user: { id: userId, email }, profile: data.profiles.find((item) => item.id === userId) };
  setDemoSession(session);
  return { session, invite };
}

export async function createDemoAdminRequest(payload) {
  const data = loadRaw();
  if (data.authUsers.some((item) => item.email === payload.email)) throw new Error('이미 사용 중인 이메일입니다.');
  const userId = uid('user');
  data.authUsers.push({ email: payload.email, password: payload.password, user_id: userId });
  data.profiles.push({ id: userId, email: payload.email, full_name: payload.fullName, phone: payload.phone || '', role_hint: payload.requestedRole || 'course_admin' });
  data.admin_signup_requests.unshift({
    id: uid('req'), requester_id: userId, requester_email: payload.email, full_name: payload.fullName, phone: payload.phone || '',
    requested_role_type: payload.requestedRole || 'course_admin', requested_course_id: payload.requestedCourseId || null,
    memo: payload.memo || '', status: 'pending', created_at: new Date().toISOString(), reviewed_at: null,
  });
  saveRaw(data);
  return { ok: true };
}

export function assignDemoAdminRole(payload) {
  const data = loadRaw();
  const profile = data.profiles.find((item) => item.email === payload.email);
  if (!profile) throw new Error('해당 이메일의 계정을 찾지 못했습니다.');
  data.course_admin_roles.unshift({ id: uid('adm'), user_id: profile.id, course_id: payload.roleType === 'course_admin' ? payload.courseId : null, role_type: payload.roleType, created_at: new Date().toISOString() });
  data.admin_signup_requests = data.admin_signup_requests.map((item) => item.requester_email === payload.email && item.status === 'pending' ? { ...item, status: 'approved', reviewed_at: new Date().toISOString() } : item);
  saveRaw(data);
  return { ok: true };
}

export function getDemoUserContext(userId) {
  const data = loadRaw();
  const profile = data.profiles.find((item) => item.id === userId) || null;
  const adminRoles = data.course_admin_roles.filter((item) => item.user_id === userId);
  const memberships = data.course_memberships.filter((item) => item.user_id === userId);
  return { profile, adminRoles, memberships };
}

export function listDemoCoursesForUser(userId) {
  const data = loadRaw();
  const memberships = data.course_memberships.filter((item) => item.user_id === userId);
  return memberships.map((membership) => data.courses.find((course) => course.id === membership.course_id)).filter(Boolean);
}

export function buildDemoDashboard(userId) {
  const data = loadRaw();
  const courses = listDemoCoursesForUser(userId);
  return {
    profile: data.profiles.find((item) => item.id === userId) || null,
    courses,
    schedule: data.course_schedule.filter((item) => courses.some((course) => course.id === item.course_id)),
    events: data.course_events.filter((item) => courses.some((course) => course.id === item.course_id)),
    assignments: data.course_assignments.filter((item) => courses.some((course) => course.id === item.course_id)),
  };
}

export function getDemoToken(token) {
  const data = loadRaw();
  const invite = data.signup_tokens.find((item) => item.token === token && item.is_active);
  if (!invite) return null;
  return { ...invite, course: data.courses.find((course) => course.id === invite.course_id) || null };
}

export function getDemoAdminScope(userId) {
  const data = loadRaw();
  const roles = data.course_admin_roles.filter((item) => item.user_id === userId);
  const isSuperAdmin = roles.some((item) => item.role_type === 'super_admin');
  const courseIds = isSuperAdmin ? data.courses.map((item) => item.id) : roles.filter((item) => item.role_type === 'course_admin' && item.course_id).map((item) => item.course_id);
  return { isSuperAdmin, courseIds, roles };
}

export function getDemoAdminData(userId) {
  const data = loadRaw();
  const scope = getDemoAdminScope(userId);
  const courseFilter = (row) => scope.isSuperAdmin || scope.courseIds.includes(row.course_id);
  const courses = scope.isSuperAdmin ? data.courses : data.courses.filter((item) => scope.courseIds.includes(item.id));
  return {
    scope,
    courses,
    schedule: data.course_schedule.filter(courseFilter),
    events: data.course_events.filter(courseFilter),
    assignments: data.course_assignments.filter(courseFilter),
    memberships: data.course_memberships.filter(courseFilter),
    tokens: data.signup_tokens.filter(courseFilter),
    adminRoles: scope.isSuperAdmin ? data.course_admin_roles : data.course_admin_roles.filter((item) => scope.courseIds.includes(item.course_id)),
    adminRequests: scope.isSuperAdmin ? data.admin_signup_requests : [],
    profiles: data.profiles,
  };
}

export function createDemoCourse(payload) {
  const data = loadRaw();
  const record = { id: uid('course'), slug: slugify(payload.title), title: payload.title, subtitle: payload.subtitle || '', description: payload.description || '', instructor_name: payload.instructorName || '', cohort_label: payload.cohortLabel || '', accent_color: payload.accentColor || '#ff9d4d', status: 'active', is_visible: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  data.courses.unshift(record);
  saveRaw(data);
  return record;
}

export function createDemoSchedule(payload) {
  const data = loadRaw();
  const record = { id: uid('sch'), course_id: payload.courseId, week_no: Number(payload.weekNo || 1), title: payload.title, starts_at: payload.startsAt, ends_at: payload.endsAt, location: payload.location || '', description: payload.description || '', created_at: new Date().toISOString() };
  data.course_schedule.unshift(record);
  saveRaw(data);
  return record;
}

export function createDemoEvent(payload) {
  const data = loadRaw();
  const record = { id: uid('evt'), course_id: payload.courseId, title: payload.title, category: payload.category || 'recruitment', registration_open_at: payload.openAt || '', registration_close_at: payload.closeAt || '', starts_at: payload.startsAt || '', ends_at: payload.endsAt || '', location: payload.location || '', description: payload.description || '', apply_url: payload.applyUrl || '', created_at: new Date().toISOString() };
  data.course_events.unshift(record);
  saveRaw(data);
  return record;
}

export function createDemoAssignment(payload) {
  const data = loadRaw();
  const record = { id: uid('asg'), course_id: payload.courseId, week_no: Number(payload.weekNo || 1), title: payload.title, description: payload.description || '', due_at: payload.dueAt || '', material_url: payload.materialUrl || '', is_required: payload.isRequired ?? true, created_at: new Date().toISOString() };
  data.course_assignments.unshift(record);
  saveRaw(data);
  return record;
}

export function createDemoToken(payload) {
  const data = loadRaw();
  const record = { id: uid('tok'), course_id: payload.courseId, token: payload.token, token_name: payload.tokenName || '', welcome_message: payload.welcomeMessage || '', expires_at: payload.expiresAt || '', max_uses: Number(payload.maxUses || 0) || null, is_active: true, created_at: new Date().toISOString() };
  data.signup_tokens.unshift(record);
  saveRaw(data);
  return record;
}

export function deleteDemoRecord(table, id) {
  const data = loadRaw();
  if (!Array.isArray(data[table])) return;
  data[table] = data[table].filter((item) => item.id !== id);
  saveRaw(data);
}
