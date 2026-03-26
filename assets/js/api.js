import { APP_CONFIG } from './config.js';

const REST_BASE = `${String(APP_CONFIG.supabaseUrl || '').replace(/\/$/, '')}/rest/v1`;
const API_KEY = APP_CONFIG.supabasePublishableKey;

function baseHeaders(extra = {}) {
  return {
    apikey: API_KEY,
    Authorization: `Bearer ${API_KEY}`,
    ...extra
  };
}

async function parseResponse(res) {
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text || null; }
  if (!res.ok) {
    const message = data?.message || data?.error_description || data?.hint || data?.details || data?.error || text || `HTTP ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data;
}

async function rpc(name, params = {}) {
  const res = await fetch(`${REST_BASE}/rpc/${name}`, {
    method: 'POST',
    headers: baseHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(params || {})
  });
  return parseResponse(res);
}

function qsValue(v) {
  return encodeURIComponent(String(v));
}

async function restSelect(table, query = '') {
  const res = await fetch(`${REST_BASE}/${table}${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: baseHeaders({ Accept: 'application/json' })
  });
  return parseResponse(res);
}

async function restInsert(table, payload, { select = '*' , upsert = false } = {}) {
  const prefer = [upsert ? 'resolution=merge-duplicates' : '', select ? 'return=representation' : 'return=minimal'].filter(Boolean).join(',');
  const res = await fetch(`${REST_BASE}/${table}${select ? `?select=${encodeURIComponent(select)}` : ''}`, {
    method: 'POST',
    headers: baseHeaders({ 'Content-Type': 'application/json', Prefer: prefer }),
    body: JSON.stringify(payload)
  });
  return parseResponse(res);
}

async function restPatch(table, filters = {}, payload = {}, { select = '*' } = {}) {
  const query = Object.entries(filters)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=eq.${qsValue(v)}`)
    .join('&');
  const res = await fetch(`${REST_BASE}/${table}?${query}${select ? `&select=${encodeURIComponent(select)}` : ''}`, {
    method: 'PATCH',
    headers: baseHeaders({ 'Content-Type': 'application/json', Prefer: select ? 'return=representation' : 'return=minimal' }),
    body: JSON.stringify(payload)
  });
  return parseResponse(res);
}

async function restDelete(table, filters = {}) {
  const query = Object.entries(filters)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=eq.${qsValue(v)}`)
    .join('&');
  const res = await fetch(`${REST_BASE}/${table}?${query}`, {
    method: 'DELETE',
    headers: baseHeaders({ Prefer: 'return=minimal' })
  });
  if (!res.ok) return parseResponse(res);
  return { ok: true };
}

function normalizeSupportRow(row = {}) {
  return {
    ...row,
    label: row.label || row.title || row.name || row.item || '',
    title: row.title || row.label || row.name || row.item || '',
    url: row.url || row.link || row.openchat_url || ''
  };
}

async function supportTableSelect(courseId) {
  if (!courseId) return [];
  const rows = await restSelect(
    'course_support_links',
    `select=*&course_id=eq.${qsValue(courseId)}&order=sort_order.asc,created_at.desc`
  );
  return (rows || []).map(normalizeSupportRow);
}

async function supportTableInsert(payload) {
  const row = {
    course_id: payload.course_id,
    title: payload.label || payload.title || '',
    label: payload.label || payload.title || '',
    url: payload.url || '',
    sort_order: Number(payload.sort_order || 10)
  };
  const data = await restInsert('course_support_links', row, { select: 'id' });
  const first = Array.isArray(data) ? data[0] : data;
  return first?.id;
}

async function supportTableUpdate(supportId, label, url, sortOrder, courseId = null) {
  const filters = { id: supportId };
  if (courseId) filters.course_id = courseId;
  await restPatch('course_support_links', filters, {
    title: label,
    label,
    url,
    sort_order: Number(sortOrder || 10)
  }, { select: 'id' });
  return { ok: true };
}

async function supportTableDelete(supportId) {
  await restDelete('course_support_links', { id: supportId });
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
    let lastErr;
    for (const fn of tryCalls) {
      try {
        const data = await fn();
        const rows = Array.isArray(data) ? data : (data?.items || data?.data || []);
        return rows.map(normalizeSupportRow);
      } catch (e) {
        lastErr = e;
      }
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
        p_sort_order: Number(payload.sort_order || 10)
      }),
      () => rpc('app_admin_save_support_link', {
        p_course_id: payload.course_id,
        p_title: payload.label || payload.title || '',
        p_url: payload.url || '',
        p_sort_order: Number(payload.sort_order || 10)
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
        p_sort_order: Number(sortOrder || 10)
      }),
      () => rpc('app_admin_update_support_link', {
        p_session_token: sessionToken,
        p_id: supportId,
        p_title: label,
        p_url: url,
        p_sort_order: Number(sortOrder || 10)
      }),
      () => rpc('app_admin_update_support_link', {
        p_support_id: supportId,
        p_label: label,
        p_url: url,
        p_sort_order: Number(sortOrder || 10)
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
  return restSelect('course_memberships', `select=id,course_id,profile_id,member_role,created_at,room_no,memo&course_id=eq.${qsValue(courseId)}&order=created_at.asc`);
};

api.updateMembershipMeta = async function(membershipId, payload = {}) {
  const patch = {};
  if (Object.prototype.hasOwnProperty.call(payload, 'room_no')) patch.room_no = payload.room_no || '';
  if (Object.prototype.hasOwnProperty.call(payload, 'memo')) patch.memo = payload.memo || '';
  const data = await restPatch('course_memberships', { id: membershipId }, patch, { select: 'id,room_no,memo' });
  return Array.isArray(data) ? data[0] : data;
};

api.listAttendance = async function(eventIds = []) {
  if (!Array.isArray(eventIds) || !eventIds.length) return [];
  const inValue = `in.(${eventIds.map((id) => String(id)).join(',')})`;
  return restSelect('event_attendance', `select=*&event_id=${encodeURIComponent(inValue)}&order=checked_in_at.desc`);
};

api.markAttendance = async function(eventId, profileId, method = 'admin_manual') {
  const payload = {
    event_id: eventId,
    profile_id: profileId,
    checked_in_at: new Date().toISOString(),
    method: method || 'admin_manual'
  };
  const data = await restInsert('event_attendance', payload, { select: '*', upsert: true });
  return Array.isArray(data) ? data[0] : data;
};

api.cancelAttendance = async function(attendanceId) {
  await restDelete('event_attendance', { id: attendanceId });
  return { ok: true };
};

api.listActivityLogs = async function(courseId = null) {
  const q = [`select=*`, `order=created_at.desc`, `limit=300`];
  if (courseId) q.push(`course_id=eq.${qsValue(courseId)}`);
  return restSelect('admin_activity_logs', q.join('&'));
};

api.addActivityLog = async function(action, detail = {}, courseId = null, profileId = null, actor = '') {
  await restInsert('admin_activity_logs', {
    action,
    detail,
    course_id: courseId || null,
    profile_id: profileId || null,
    actor: actor || ''
  }, { select: '', upsert: false });
  return { ok: true };
};
