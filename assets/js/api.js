import { APP_CONFIG } from './config.js';

let supabaseClient;

async function getSupabase() {
  if (supabaseClient) return supabaseClient;
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm');
  supabaseClient = createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'public' }
  });
  return supabaseClient;
}

async function rpc(name, params = {}) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw error;
  return data;
}

export const api = {
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
  listSupportLinks(sessionToken, courseId) { return rpc('app_admin_list_support_links', { p_session_token: sessionToken, p_course_id: courseId }); },
  saveSupportLink(sessionToken, payload) { return rpc('app_admin_save_support_link', { p_session_token: sessionToken, p_item: payload }); },
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

  updateSupportLink(sessionToken, supportId, label, url, sortOrder) {
    return rpc('app_admin_update_support_link', {
      p_session_token: sessionToken,
      p_support_id: supportId,
      p_label: label,
      p_url: url,
      p_sort_order: sortOrder || null
    });
  },
  deleteSupportLink(sessionToken, supportId) {
    return rpc('app_admin_delete_support_link', {
      p_session_token: sessionToken,
      p_support_id: supportId
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
