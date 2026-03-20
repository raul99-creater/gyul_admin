create or replace function public.app_admin_assign_role(
  p_session_token text,
  p_profile_id uuid,
  p_role_type text,
  p_course_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_instructor_name text;
begin
  if not public.is_super_session(p_session_token) then
    return jsonb_build_object('ok', false, 'message', '슈퍼어드민만 권한을 변경할 수 있습니다.');
  end if;

  if p_role_type = 'super_admin' then
    insert into public.course_admin_roles(profile_id, course_id, role_type)
    values (p_profile_id, null, 'super_admin')
    on conflict do nothing;
  elsif p_role_type = 'course_admin' then
    if p_course_id is null then
      return jsonb_build_object('ok', false, 'message', '강사 기준이 필요합니다.');
    end if;

    select instructor_name into v_instructor_name
    from public.courses
    where id = p_course_id;

    insert into public.course_admin_roles(profile_id, course_id, role_type)
    select p_profile_id, c.id, 'course_admin'
    from public.courses c
    where c.instructor_name = v_instructor_name
    on conflict do nothing;
  else
    return jsonb_build_object('ok', false, 'message', '잘못된 권한입니다.');
  end if;

  return jsonb_build_object('ok', true);
end $$;

create or replace function public.app_admin_resolve_request(
  p_session_token text,
  p_request_id uuid,
  p_status text,
  p_course_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.admin_signup_requests%rowtype;
  v_profile_id uuid;
  v_target_course uuid;
  v_instructor_name text;
begin
  if not public.is_super_session(p_session_token) then
    return jsonb_build_object('ok', false, 'message', '슈퍼어드민만 신청을 처리할 수 있습니다.');
  end if;

  select * into v_req from public.admin_signup_requests where id = p_request_id limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'message', '신청 내역을 찾을 수 없습니다.');
  end if;

  v_target_course := coalesce(p_course_id, v_req.requested_course_id);

  update public.admin_signup_requests
     set status = case when p_status in ('approved','rejected') then p_status else 'pending' end,
         requested_course_id = v_target_course
   where id = p_request_id;

  if p_status = 'approved' then
    v_profile_id := public.ensure_profile(v_req.full_name, v_req.phone);
    select instructor_name into v_instructor_name from public.courses where id = v_target_course;

    insert into public.course_admin_roles(profile_id, course_id, role_type)
    select v_profile_id, c.id, 'course_admin'
    from public.courses c
    where c.instructor_name = v_instructor_name
    on conflict do nothing;
  end if;

  return jsonb_build_object('ok', true);
end $$;

create or replace function public.app_admin_delete_role(
  p_session_token text,
  p_profile_id uuid,
  p_role_type text,
  p_course_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_instructor_name text;
begin
  if not public.is_super_session(p_session_token) then
    return jsonb_build_object('ok', false, 'message', '슈퍼어드민만 권한을 삭제할 수 있습니다.');
  end if;

  if p_role_type = 'super_admin' then
    delete from public.course_admin_roles
    where profile_id = p_profile_id
      and role_type = 'super_admin';
  elsif p_role_type = 'course_admin' then
    if p_course_id is null then
      delete from public.course_admin_roles
      where profile_id = p_profile_id
        and role_type = 'course_admin';
    else
      select instructor_name into v_instructor_name from public.courses where id = p_course_id;
      delete from public.course_admin_roles r
      using public.courses c
      where r.course_id = c.id
        and r.profile_id = p_profile_id
        and r.role_type = 'course_admin'
        and c.instructor_name = v_instructor_name;
    end if;
  else
    return jsonb_build_object('ok', false, 'message', '잘못된 권한입니다.');
  end if;

  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.app_admin_assign_role(text,uuid,text,uuid) to anon, authenticated;
grant execute on function public.app_admin_resolve_request(text,uuid,text,uuid) to anon, authenticated;
grant execute on function public.app_admin_delete_role(text,uuid,text,uuid) to anon, authenticated;

notify pgrst, 'reload schema';
