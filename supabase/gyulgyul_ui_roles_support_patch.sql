-- 고객센터 함수/관리자 권한 목록/일반 회원 전화번호 검증 패치
create table if not exists public.course_support_links (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  label text,
  url text not null default '',
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists course_support_links_course_idx on public.course_support_links(course_id, sort_order, created_at);

grant select, insert, update, delete on table public.course_support_links to authenticated;
grant select on table public.course_support_links to anon;

create or replace function public.app_admin_save_support_link(p_session_token text, p_item jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := nullif(p_item->>'id','')::uuid;
  v_course_id uuid := nullif(p_item->>'course_id','')::uuid;
  v_row public.course_support_links%rowtype;
begin
  if v_course_id is null or not public.admin_can_manage_course(p_session_token, v_course_id) then
    return jsonb_build_object('ok', false, 'message', '고객센터 저장 권한이 없습니다.');
  end if;

  if v_id is null then
    insert into public.course_support_links(course_id, label, url, sort_order, is_active)
    values (
      v_course_id,
      nullif(trim(coalesce(p_item->>'label', p_item->>'title', p_item->>'name', p_item->>'item')), ''),
      coalesce(nullif(trim(p_item->>'url'),''), ''),
      coalesce(nullif(p_item->>'sort_order','')::integer, 100),
      true
    )
    returning * into v_row;
  else
    update public.course_support_links
       set label = nullif(trim(coalesce(p_item->>'label', p_item->>'title', p_item->>'name', p_item->>'item')), ''),
           url = coalesce(nullif(trim(p_item->>'url'),''), url),
           sort_order = coalesce(nullif(p_item->>'sort_order','')::integer, sort_order),
           is_active = coalesce((p_item->>'is_active')::boolean, is_active),
           updated_at = now()
     where id = v_id and course_id = v_course_id
     returning * into v_row;
  end if;

  return jsonb_build_object('ok', true, 'item', to_jsonb(v_row));
end $$;

grant execute on function public.app_admin_save_support_link(text,jsonb) to anon, authenticated;

create or replace function public.app_admin_get_bootstrap(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id(p_session_token);
  v_kind text := public.current_session_kind(p_session_token);
  v_is_super boolean := public.is_super_session(p_session_token);
  v_profile public.profiles%rowtype;
  v_course_ids uuid[];
  v_courses jsonb;
  v_memberships jsonb;
  v_schedule jsonb;
  v_events jsonb;
  v_assignments jsonb;
  v_tokens jsonb;
  v_roles jsonb := '[]'::jsonb;
  v_requests jsonb := '[]'::jsonb;
  v_profiles jsonb := '[]'::jsonb;
  v_applications jsonb := '[]'::jsonb;
begin
  if v_kind not in ('course_admin','super_admin') then
    return jsonb_build_object('ok', false, 'message', '관리자 권한이 없습니다.');
  end if;

  if v_profile_id is not null then
    select * into v_profile from public.profiles where id = v_profile_id;
  end if;

  if v_is_super then
    select array(select id from public.courses order by instructor_name, cohort_label) into v_course_ids;
  else
    select array_agg(course_id) into v_course_ids
      from public.course_admin_roles
     where profile_id = v_profile_id and role_type = 'course_admin';
  end if;
  v_course_ids := coalesce(v_course_ids, '{}'::uuid[]);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'slug', c.slug,
    'title', c.title,
    'instructor_name', c.instructor_name,
    'cohort_label', c.cohort_label,
    'description', c.description,
    'accent_color', c.accent_color,
    'status', c.status,
    'is_visible', c.is_visible,
    'member_count', (select count(*) from public.course_memberships m where m.course_id = c.id)
  ) order by c.instructor_name, c.cohort_label), '[]'::jsonb)
    into v_courses
    from public.courses c
   where (v_is_super or c.id = any(v_course_ids));

  select coalesce(jsonb_agg(jsonb_build_object(
    'course_id', m.course_id,
    'profile_id', m.profile_id,
    'member_role', m.member_role,
    'created_at', m.created_at,
    'full_name', p.full_name,
    'phone', p.phone
  ) order by p.full_name), '[]'::jsonb)
    into v_memberships
    from public.course_memberships m
    join public.profiles p on p.id = m.profile_id
   where (v_is_super or m.course_id = any(v_course_ids));

  select coalesce(jsonb_agg(to_jsonb(s) order by s.starts_at), '[]'::jsonb)
    into v_schedule
    from public.course_schedule s
   where (v_is_super or s.course_id = any(v_course_ids));

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id,
    'course_id', e.course_id,
    'title', e.title,
    'description', e.description,
    'starts_at', e.starts_at,
    'ends_at', e.ends_at,
    'registration_open_at', e.registration_open_at,
    'registration_close_at', e.registration_close_at,
    'max_applicants', e.max_applicants,
    'form_schema', e.form_schema,
    'status', e.status,
    'application_count', (select count(*) from public.event_applications a where a.event_id = e.id)
  ) order by e.starts_at nulls last, e.created_at desc), '[]'::jsonb)
    into v_events
    from public.course_events e
   where (v_is_super or e.course_id = any(v_course_ids));

  select coalesce(jsonb_agg(to_jsonb(a) order by a.week_no, a.due_at), '[]'::jsonb)
    into v_assignments
    from public.course_assignments a
   where (v_is_super or a.course_id = any(v_course_ids));

  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
    into v_tokens
    from public.signup_tokens t
   where (v_is_super or t.course_id = any(v_course_ids));

  select coalesce(jsonb_agg(jsonb_build_object(
    'event_id', ea.event_id,
    'profile_id', ea.profile_id,
    'answers', ea.answers,
    'created_at', ea.created_at,
    'full_name', p.full_name,
    'phone', p.phone
  ) order by ea.created_at desc), '[]'::jsonb)
    into v_applications
    from public.event_applications ea
    join public.profiles p on p.id = ea.profile_id
   where exists (
      select 1 from public.course_events e
      where e.id = ea.event_id and (v_is_super or e.course_id = any(v_course_ids))
   );

  if v_is_super then
    select coalesce(jsonb_agg(role_item order by role_item->>'full_name', role_item->>'role_type'), '[]'::jsonb)
      into v_roles
      from (
        select jsonb_build_object(
          'profile_id', r.profile_id,
          'course_id', null,
          'role_type', 'super_admin',
          'created_at', min(r.created_at),
          'full_name', p.full_name,
          'phone', p.phone,
          'target_instructor_name', '전체'
        ) as role_item
        from public.course_admin_roles r
        left join public.profiles p on p.id = r.profile_id
        where r.role_type = 'super_admin'
        group by r.profile_id, p.full_name, p.phone
        union all
        select jsonb_build_object(
          'profile_id', r.profile_id,
          'course_id', min(r.course_id),
          'role_type', 'course_admin',
          'created_at', min(r.created_at),
          'full_name', p.full_name,
          'phone', p.phone,
          'target_instructor_name', c.instructor_name
        ) as role_item
        from public.course_admin_roles r
        join public.courses c on c.id = r.course_id
        left join public.profiles p on p.id = r.profile_id
        where r.role_type = 'course_admin'
        group by r.profile_id, p.full_name, p.phone, c.instructor_name
      ) role_src;

    select coalesce(jsonb_agg(to_jsonb(req) order by req.created_at desc), '[]'::jsonb)
      into v_requests
      from public.admin_signup_requests req;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'full_name', p.full_name,
      'phone', p.phone,
      'created_at', p.created_at
    ) order by p.created_at desc), '[]'::jsonb)
      into v_profiles
      from public.profiles p;
  end if;

  return jsonb_build_object(
    'ok', true,
    'profile', case when v_profile.id is null then null else jsonb_build_object('id', v_profile.id, 'full_name', v_profile.full_name, 'phone', v_profile.phone) end,
    'is_super_admin', v_is_super,
    'courses', v_courses,
    'memberships', v_memberships,
    'schedule', v_schedule,
    'events', v_events,
    'assignments', v_assignments,
    'tokens', v_tokens,
    'roles', v_roles,
    'requests', v_requests,
    'profiles', v_profiles,
    'applications', v_applications
  );
end $$;

grant execute on function public.app_admin_get_bootstrap(text) to anon, authenticated;

create or replace function public.app_member_sign_up(p_token text, p_full_name text, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token public.signup_tokens%rowtype;
  v_profile_id uuid;
  v_session_token text;
  v_phone text := trim(coalesce(p_phone,''));
begin
  if trim(coalesce(p_full_name,'')) = '' then
    return jsonb_build_object('ok', false, 'message', '이름을 입력해주세요.');
  end if;
  if v_phone !~ '^\d{11}$' then
    return jsonb_build_object('ok', false, 'message', '전화번호는 하이픈 없이 숫자 11자리로 입력해주세요.');
  end if;

  select * into v_token
    from public.signup_tokens
   where token = trim(p_token)
     and is_active = true
     and (expires_at is null or expires_at > now())
     and (max_uses is null or used_count < max_uses)
   limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'message', '유효하지 않거나 만료된 토큰입니다.');
  end if;

  v_profile_id := public.ensure_profile(p_full_name, v_phone);

  insert into public.course_memberships(course_id, profile_id, member_role)
  values (v_token.course_id, v_profile_id, 'student')
  on conflict (course_id, profile_id) do nothing;

  update public.signup_tokens
     set used_count = used_count + 1
   where id = v_token.id;

  v_session_token := public.issue_app_session(v_profile_id, 'member');

  return jsonb_build_object('ok', true, 'session_token', v_session_token, 'profile_id', v_profile_id, 'course_id', v_token.course_id);
end $$;

grant execute on function public.app_member_sign_up(text,text,text) to anon, authenticated;

create or replace function public.app_member_sign_in(p_full_name text, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := trim(coalesce(p_phone,''));
  v_profile public.profiles%rowtype;
  v_has_membership boolean;
  v_session_token text;
begin
  if trim(coalesce(p_full_name,'')) = '' then
    return jsonb_build_object('ok', false, 'message', '이름을 입력해주세요.');
  end if;
  if v_phone !~ '^\d{11}$' then
    return jsonb_build_object('ok', false, 'message', '전화번호는 하이픈 없이 숫자 11자리로 입력해주세요.');
  end if;

  select * into v_profile
    from public.profiles
   where phone = v_phone
     and full_name = trim(p_full_name)
     and is_active = true
   limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'message', '이름 또는 연락처가 일치하지 않습니다.');
  end if;

  select exists(select 1 from public.course_memberships where profile_id = v_profile.id)
    into v_has_membership;

  if not v_has_membership then
    return jsonb_build_object('ok', false, 'message', '배정된 강의가 없습니다.');
  end if;

  v_session_token := public.issue_app_session(v_profile.id, 'member');
  return jsonb_build_object('ok', true, 'session_token', v_session_token, 'profile_id', v_profile.id);
end $$;

grant execute on function public.app_member_sign_in(text,text) to anon, authenticated;

notify pgrst, 'reload schema';
