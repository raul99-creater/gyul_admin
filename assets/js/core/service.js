import { APP_CONFIG } from '../config.js';
import { groupBy, isBetween, sortByDate, slugify } from './utils.js';
import {
  assignDemoAdminRole,
  bootstrapDemoAdminSignUp,
  buildDemoDashboard,
  clearDemoSession,
  createDemoAdminRequest,
  createDemoAssignment,
  createDemoCourse,
  createDemoEvent,
  createDemoSchedule,
  createDemoToken,
  deleteDemoRecord,
  demoSignIn,
  demoSignUpWithToken,
  getDemoAdminData,
  getDemoSession,
  getDemoToken,
  getDemoUserContext,
} from './demo-store.js';

let supabaseSingleton = null;

export function getMode() {
  if (APP_CONFIG.mode === 'demo') return 'demo';
  if (APP_CONFIG.mode === 'supabase') return 'supabase';
  return APP_CONFIG.supabaseUrl && APP_CONFIG.supabasePublishableKey ? 'supabase' : 'demo';
}

export async function getSupabase() {
  if (getMode() !== 'supabase') return null;
  if (supabaseSingleton) return supabaseSingleton;
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm');
  supabaseSingleton = createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabasePublishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  return supabaseSingleton;
}

export async function getSession() {
  if (getMode() === 'demo') return getDemoSession();
  const supabase = await getSupabase();
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function signIn(email, password) {
  if (getMode() === 'demo') return demoSignIn(email, password);
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  if (getMode() === 'demo') {
    clearDemoSession();
    return;
  }
  const supabase = await getSupabase();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function signUpWithToken(payload) {
  if (getMode() === 'demo') return demoSignUpWithToken(payload);
  const supabase = await getSupabase();
  const tokenInfo = await fetchTokenInfo(payload.token);
  if (!tokenInfo) throw new Error('유효하지 않은 토큰입니다.');

  const redirectUrl = `${window.location.origin}${APP_CONFIG.siteBasePath || ''}/dashboard.html`;
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: payload.email,
    password: payload.password,
    options: {
      emailRedirectTo: redirectUrl,
      data: {
        full_name: payload.fullName,
        phone: payload.phone,
      },
    },
  });
  if (authError) throw authError;

  const userId = authData.user?.id;
  if (!userId) return { session: authData.session, invite: tokenInfo };

  const { error: profileError } = await supabase.from('profiles').upsert({ id: userId, email: payload.email, full_name: payload.fullName, phone: payload.phone }, { onConflict: 'id' });
  if (profileError) throw profileError;

  const { error: membershipError } = await supabase.from('course_memberships').upsert({ course_id: tokenInfo.course_id, user_id: userId, role: 'student' }, { onConflict: 'course_id,user_id' });
  if (membershipError) throw membershipError;
  return { session: authData.session, invite: tokenInfo };
}

export async function requestAdminAccess(payload) {
  if (getMode() === 'demo') return createDemoAdminRequest(payload);
  const supabase = await getSupabase();
  const redirectUrl = `${window.location.origin}${APP_CONFIG.siteBasePath || ''}/index.html`;
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: payload.email,
    password: payload.password,
    options: {
      emailRedirectTo: redirectUrl,
      data: { full_name: payload.fullName, phone: payload.phone || '' },
    },
  });
  if (authError) throw authError;
  const userId = authData.user?.id;
  if (!userId) return authData;
  const { error: profileError } = await supabase.from('profiles').upsert({ id: userId, email: payload.email, full_name: payload.fullName, phone: payload.phone || '' }, { onConflict: 'id' });
  if (profileError) throw profileError;
  const { error: requestError } = await supabase.from('admin_signup_requests').insert({
    requester_id: userId,
    requester_email: payload.email,
    full_name: payload.fullName,
    phone: payload.phone || '',
    requested_role_type: payload.requestedRole || 'course_admin',
    requested_course_id: payload.requestedCourseId || null,
    memo: payload.memo || '',
    status: 'pending',
  });
  if (requestError) throw requestError;
  return authData;
}

export async function fetchTokenInfo(token) {
  if (getMode() === 'demo') return getDemoToken(token);
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('signup_tokens')
    .select('id, course_id, token, token_name, welcome_message, expires_at, max_uses, is_active, courses(id, title, subtitle, description, instructor_name, cohort_label)')
    .eq('token', token)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { ...data, course: Array.isArray(data.courses) ? data.courses[0] : data.courses };
}

async function getCurrentProfile(session) {
  if (!session) return null;
  if (getMode() === 'demo') return session.profile || getDemoUserContext(session.user.id).profile;
  const supabase = await getSupabase();
  const { data, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
  if (error) throw error;
  return data;
}

async function getAdminScope(userId) {
  if (getMode() === 'demo') return getDemoAdminData(userId).scope;
  const supabase = await getSupabase();
  const { data, error } = await supabase.from('course_admin_roles').select('role_type, course_id').eq('user_id', userId);
  if (error) throw error;
  const isSuperAdmin = data.some((item) => item.role_type === 'super_admin');
  return {
    roles: data,
    isSuperAdmin,
    courseIds: isSuperAdmin ? [] : data.filter((item) => item.role_type === 'course_admin' && item.course_id).map((item) => item.course_id),
  };
}

export function classifyEvents(events) {
  const now = new Date();
  const result = { open: [], closed: [], upcoming: [] };
  for (const event of events) {
    if (event.registration_open_at || event.registration_close_at) {
      const opened = isBetween(now, event.registration_open_at, event.registration_close_at);
      const upcoming = event.registration_open_at && new Date(event.registration_open_at) > now;
      if (opened) result.open.push(event);
      else if (upcoming) result.upcoming.push(event);
      else result.closed.push(event);
    } else if (event.starts_at && new Date(event.starts_at) >= now) {
      result.upcoming.push(event);
    } else {
      result.closed.push(event);
    }
  }
  return result;
}

export async function loadDashboardData() {
  const session = await getSession();
  if (!session) return { session: null, profile: null, courses: [], schedule: [], events: [], assignments: [], groupedAssignments: {}, eventGroups: classifyEvents([]), adminScope: null };
  if (getMode() === 'demo') {
    const demo = buildDemoDashboard(session.user.id);
    return {
      session,
      profile: demo.profile,
      courses: demo.courses,
      schedule: demo.schedule,
      events: demo.events,
      assignments: demo.assignments,
      groupedAssignments: groupBy(sortByDate(demo.assignments, 'due_at'), (item) => item.week_no || 0),
      eventGroups: classifyEvents(demo.events),
      adminScope: getDemoAdminData(session.user.id).scope,
    };
  }
  const supabase = await getSupabase();
  const profile = await getCurrentProfile(session);
  const { data: memberships, error: membershipError } = await supabase
    .from('course_memberships')
    .select('course_id, role, courses(id, slug, title, subtitle, description, accent_color, status, is_visible, instructor_name, cohort_label)')
    .eq('user_id', session.user.id);
  if (membershipError) throw membershipError;
  const courses = memberships.map((item) => Array.isArray(item.courses) ? item.courses[0] : item.courses).filter(Boolean);
  const courseIds = courses.map((item) => item.id);
  const [scheduleRes, eventsRes, assignmentsRes, adminScope] = await Promise.all([
    courseIds.length ? supabase.from('course_schedule').select('*').in('course_id', courseIds).order('starts_at', { ascending: true }) : Promise.resolve({ data: [] }),
    courseIds.length ? supabase.from('course_events').select('*').in('course_id', courseIds).order('starts_at', { ascending: true }) : Promise.resolve({ data: [] }),
    courseIds.length ? supabase.from('course_assignments').select('*').in('course_id', courseIds).order('week_no', { ascending: true }) : Promise.resolve({ data: [] }),
    getAdminScope(session.user.id),
  ]);
  if (scheduleRes.error) throw scheduleRes.error;
  if (eventsRes.error) throw eventsRes.error;
  if (assignmentsRes.error) throw assignmentsRes.error;
  return {
    session,
    profile,
    courses,
    schedule: scheduleRes.data || [],
    events: eventsRes.data || [],
    assignments: assignmentsRes.data || [],
    groupedAssignments: groupBy(sortByDate(assignmentsRes.data || [], 'due_at'), (item) => item.week_no || 0),
    eventGroups: classifyEvents(eventsRes.data || []),
    adminScope,
  };
}

export async function loadAdminData() {
  const session = await getSession();
  if (!session) return { session: null, scope: null, courses: [], schedule: [], events: [], assignments: [], tokens: [], memberships: [], profiles: [], adminRoles: [], adminRequests: [] };
  if (getMode() === 'demo') return { session, ...getDemoAdminData(session.user.id) };
  const scope = await getAdminScope(session.user.id);
  const supabase = await getSupabase();
  const courseQuery = supabase.from('courses').select('*').order('created_at', { ascending: false });
  const { data: courses, error: courseError } = scope.isSuperAdmin ? await courseQuery : await courseQuery.in('id', scope.courseIds.length ? scope.courseIds : ['00000000-0000-0000-0000-000000000000']);
  if (courseError) throw courseError;
  const courseIds = (courses || []).map((item) => item.id);
  const selectScoped = (table, orderCol='created_at') => courseIds.length
    ? supabase.from(table).select('*').in('course_id', courseIds).order(orderCol, { ascending: false })
    : Promise.resolve({ data: [] });
  const [scheduleRes, eventsRes, assignmentsRes, tokensRes, membershipsRes, adminRolesRes, adminRequestsRes] = await Promise.all([
    selectScoped('course_schedule', 'starts_at'),
    selectScoped('course_events', 'starts_at'),
    selectScoped('course_assignments', 'due_at'),
    selectScoped('signup_tokens', 'created_at'),
    selectScoped('course_memberships', 'created_at'),
    scope.isSuperAdmin ? supabase.from('course_admin_roles').select('*').order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
    scope.isSuperAdmin ? supabase.from('admin_signup_requests').select('*').order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
  ]);
  for (const res of [scheduleRes, eventsRes, assignmentsRes, tokensRes, membershipsRes, adminRolesRes, adminRequestsRes]) {
    if (res.error) throw res.error;
  }
  const relevantUserIds = Array.from(new Set([
    ...((membershipsRes.data || []).map((m) => m.user_id)),
    ...((adminRolesRes.data || []).map((r) => r.user_id)),
    session.user.id,
  ]));
  const profilesRes = relevantUserIds.length
    ? await supabase.from('profiles').select('*').in('id', relevantUserIds)
    : { data: [] };
  if (profilesRes.error) throw profilesRes.error;
  return {
    session,
    scope,
    courses: courses || [],
    schedule: scheduleRes.data || [],
    events: eventsRes.data || [],
    assignments: assignmentsRes.data || [],
    tokens: tokensRes.data || [],
    memberships: membershipsRes.data || [],
    adminRoles: adminRolesRes.data || [],
    adminRequests: adminRequestsRes.data || [],
    profiles: profilesRes.data || [],
  };
}

export async function createCourse(payload) {
  if (getMode() === 'demo') return createDemoCourse(payload);
  const supabase = await getSupabase();
  const { data, error } = await supabase.from('courses').insert({
    title: payload.title,
    slug: payload.slug || slugify(payload.title),
    subtitle: payload.subtitle || '',
    description: payload.description || '',
    accent_color: payload.accentColor || '#ff9d4d',
    instructor_name: payload.instructorName || '',
    cohort_label: payload.cohortLabel || '',
  }).select().single();
  if (error) throw error;
  return data;
}

export async function createSchedule(payload) {
  if (getMode() === 'demo') return createDemoSchedule(payload);
  const supabase = await getSupabase();
  const { data, error } = await supabase.from('course_schedule').insert({ course_id: payload.courseId, week_no: Number(payload.weekNo || 1), title: payload.title, starts_at: payload.startsAt, ends_at: payload.endsAt || null, location: payload.location || '', description: payload.description || '' }).select().single();
  if (error) throw error;
  return data;
}

export async function createEvent(payload) {
  if (getMode() === 'demo') return createDemoEvent(payload);
  const supabase = await getSupabase();
  const { data, error } = await supabase.from('course_events').insert({ course_id: payload.courseId, title: payload.title, category: payload.category || 'recruitment', registration_open_at: payload.openAt || null, registration_close_at: payload.closeAt || null, starts_at: payload.startsAt || null, ends_at: payload.endsAt || null, location: payload.location || '', description: payload.description || '', apply_url: payload.applyUrl || '' }).select().single();
  if (error) throw error;
  return data;
}

export async function createAssignment(payload) {
  if (getMode() === 'demo') return createDemoAssignment(payload);
  const supabase = await getSupabase();
  const { data, error } = await supabase.from('course_assignments').insert({ course_id: payload.courseId, week_no: Number(payload.weekNo || 1), title: payload.title, description: payload.description || '', due_at: payload.dueAt || null, material_url: payload.materialUrl || '', is_required: payload.isRequired ?? true }).select().single();
  if (error) throw error;
  return data;
}

export async function createToken(payload) {
  if (getMode() === 'demo') return createDemoToken(payload);
  const supabase = await getSupabase();
  const { data, error } = await supabase.from('signup_tokens').insert({ course_id: payload.courseId, token: payload.token, token_name: payload.tokenName || '', welcome_message: payload.welcomeMessage || '', expires_at: payload.expiresAt || null, max_uses: payload.maxUses ? Number(payload.maxUses) : null, is_active: true }).select().single();
  if (error) throw error;
  return data;
}

export async function assignAdminRole(payload) {
  if (getMode() === 'demo') return assignDemoAdminRole(payload);
  const supabase = await getSupabase();
  const { data: profile, error: profileError } = await supabase.from('profiles').select('id, email, full_name').eq('email', payload.email).maybeSingle();
  if (profileError) throw profileError;
  if (!profile) throw new Error('해당 이메일의 계정을 찾지 못했습니다. 먼저 회원가입 또는 가입 신청을 완료하세요.');
  const insertPayload = {
    user_id: profile.id,
    course_id: payload.roleType === 'course_admin' ? payload.courseId : null,
    role_type: payload.roleType,
  };
  const { data, error } = await supabase.from('course_admin_roles').insert(insertPayload).select().single();
  if (error) throw error;
  const { error: requestUpdateError } = await supabase.from('admin_signup_requests').update({ status: 'approved', reviewed_at: new Date().toISOString() }).eq('requester_email', payload.email).eq('status', 'pending');
  if (requestUpdateError) console.warn(requestUpdateError);
  return data;
}

export async function deleteRecord(table, id) {
  if (getMode() === 'demo') return deleteDemoRecord(table, id);
  const supabase = await getSupabase();
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw error;
}

export async function bootstrapAdminSignUp(email, password, fullName) {
  if (getMode() === 'demo') return bootstrapDemoAdminSignUp(email, password, fullName);
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
  if (error) throw error;
  return data;
}

export function getModeLabel() {
  return getMode() === 'demo' ? '데모 모드' : 'Supabase 연결 모드';
}

export function buildEventBucketsForCourse(events, courseId) {
  return classifyEvents(events.filter((event) => event.course_id === courseId));
}
