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


async function supportTableSelect(courseId) {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('course_support_links')
    .select('*')
    .eq('course_id', courseId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => ({
    ...row,
    label: row.label || row.title || row.name || row.item || '',
    title: row.title || row.label || row.name || row.item || '',
    url: row.url || row.link || row.openchat_url || ''
  }));
}

async function supportTableInsert(payload) {
  const supabase = await getSupabase();
  const row = {
    course_id: payload.course_id,
    title: payload.label || payload.title || '',
    label: payload.label || payload.title || '',
    url: payload.url || '',
    sort_order: payload.sort_order || 10
  };
  const { data, error } = await supabase.from('course_support_links').insert(row).select('id').single();
  if (error) throw error;
  return data?.id;
}

async function supportTableUpdate(supportId, label, url, sortOrder, courseId = null) {
  const supabase = await getSupabase();
  let q = supabase.from('course_support_links').update({
    title: label,
    label,
    url,
    sort_order: sortOrder || 10
  }).eq('id', supportId);
  if (courseId) q = q.eq('course_id', courseId);
  const { error } = await q;
  if (error) throw error;
  return { ok: true };
}

async function supportTableDelete(supportId) {
  const supabase = await getSupabase();
  const { error } = await supabase.from('course_support_links').delete().eq('id', supportId);
  if (error) throw error;
  return { ok: true };
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
  async listSupportLinks(sessionToken, courseId) {
    const tryCalls = [
      () => rpc('app_admin_list_support_links', { p_session_token: sessionToken, p_course_id: courseId }),
      () => rpc('app_admin_list_support_links', { p_course_id: courseId, p_session_token: sessionToken }),
      () => rpc('app_admin_list_support_links', { p_course_id: courseId }),
      () => rpc('app_admin_list_support_links', courseId ? { course_id: courseId } : {}),
      () => supportTableSelect(courseId)
    ];
    return (async () => {
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
        } catch (e) {
          lastErr = e;
        }
      }
      throw lastErr;
    })();
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
      } catch (e) {
        lastErr = e;
      }
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


api.listMembershipMeta = async function(courseId) {
  if (!courseId) return [];
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('course_memberships')
    .select('id, course_id, profile_id, member_role, created_at, room_no, memo')
    .eq('course_id', courseId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
};

api.updateMembershipMeta = async function(membershipId, payload = {}) {
  const supabase = await getSupabase();
  const patch = {};
  if (Object.prototype.hasOwnProperty.call(payload, 'room_no')) patch.room_no = payload.room_no || '';
  if (Object.prototype.hasOwnProperty.call(payload, 'memo')) patch.memo = payload.memo || '';
  const { data, error } = await supabase
    .from('course_memberships')
    .update(patch)
    .eq('id', membershipId)
    .select('id, room_no, memo')
    .single();
  if (error) throw error;
  return data;
};

api.listAttendance = async function(eventIds = []) {
  if (!Array.isArray(eventIds) || !eventIds.length) return [];
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('event_attendance')
    .select('*')
    .in('event_id', eventIds)
    .order('checked_in_at', { ascending: false });
  if (error) throw error;
  return data || [];
};

api.markAttendance = async function(eventId, profileId, method = 'admin_manual') {
  const supabase = await getSupabase();
  const payload = {
    event_id: eventId,
    profile_id: profileId,
    checked_in_at: new Date().toISOString(),
    method: method || 'admin_manual'
  };
  const { data, error } = await supabase
    .from('event_attendance')
    .upsert(payload, { onConflict: 'event_id,profile_id' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
};

api.cancelAttendance = async function(attendanceId) {
  const supabase = await getSupabase();
  const { error } = await supabase
    .from('event_attendance')
    .delete()
    .eq('id', attendanceId);
  if (error) throw error;
  return { ok: true };
};

api.listActivityLogs = async function(courseId = null) {
  const supabase = await getSupabase();
  let query = supabase
    .from('admin_activity_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(300);
  if (courseId) query = query.eq('course_id', courseId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

api.addActivityLog = async function(action, detail = {}, courseId = null, profileId = null, actor = '') {
  const supabase = await getSupabase();
  const { error } = await supabase
    .from('admin_activity_logs')
    .insert({
      action,
      detail,
      course_id: courseId || null,
      profile_id: profileId || null,
      actor: actor || ''
    });
  if (error) throw error;
  return { ok: true };
};
