create extension if not exists pgcrypto;

-- reset app objects in public schema only
drop function if exists public.app_public_list_courses() cascade;
drop function if exists public.app_get_signup_token_info(text) cascade;
drop function if exists public.app_member_sign_up(text,text,text) cascade;
drop function if exists public.app_member_sign_in(text,text) cascade;
drop function if exists public.app_member_get_dashboard(text) cascade;
drop function if exists public.app_member_submit_event(text,uuid,jsonb) cascade;
drop function if exists public.app_admin_sign_in(text,text) cascade;
drop function if exists public.app_admin_request_signup(text,text,uuid,text) cascade;
drop function if exists public.app_admin_get_bootstrap(text) cascade;
drop function if exists public.app_admin_save_course(text,jsonb) cascade;
drop function if exists public.app_admin_save_schedule(text,jsonb) cascade;
drop function if exists public.app_admin_save_assignment(text,jsonb) cascade;
drop function if exists public.app_admin_save_event(text,jsonb) cascade;
drop function if exists public.app_admin_save_token(text,jsonb) cascade;
drop function if exists public.app_admin_delete_item(text,text,uuid) cascade;
drop function if exists public.app_admin_upsert_member(text,uuid,text,text) cascade;
drop function if exists public.app_admin_assign_role(text,uuid,text,uuid) cascade;
drop function if exists public.app_admin_resolve_request(text,uuid,text,uuid) cascade;
drop function if exists public.app_sign_out(text) cascade;
drop function if exists public.set_updated_at() cascade;
drop function if exists public.slugify_text(text) cascade;
drop function if exists public.normalize_phone(text) cascade;
drop function if exists public.issue_app_session(uuid,text,integer) cascade;
drop function if exists public.resolve_app_session(text) cascade;
drop function if exists public.ensure_profile(text,text) cascade;
drop function if exists public.admin_can_manage_course(text,uuid) cascade;
drop function if exists public.current_profile_id(text) cascade;
drop function if exists public.current_session_kind(text) cascade;
drop function if exists public.is_super_session(text) cascade;

drop table if exists public.event_applications cascade;
drop table if exists public.course_events cascade;
drop table if exists public.course_assignments cascade;
drop table if exists public.course_schedule cascade;
drop table if exists public.signup_tokens cascade;
drop table if exists public.admin_signup_requests cascade;
drop table if exists public.course_admin_roles cascade;
drop table if exists public.course_memberships cascade;
drop table if exists public.admin_credentials cascade;
drop table if exists public.app_sessions cascade;
drop table if exists public.courses cascade;
drop table if exists public.profiles cascade;

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  instructor_name text not null,
  cohort_label text not null,
  title text not null,
  description text not null default '',
  accent_color text not null default '#ff9d4d',
  status text not null default 'active',
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.course_memberships (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  member_role text not null default 'student',
  created_at timestamptz not null default now(),
  unique(course_id, profile_id)
);

create table public.course_admin_roles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid references public.courses(id) on delete cascade,
  role_type text not null check (role_type in ('super_admin','course_admin')),
  created_at timestamptz not null default now()
);
create unique index course_admin_roles_super_idx on public.course_admin_roles(profile_id, role_type) where role_type = 'super_admin';
create unique index course_admin_roles_course_idx on public.course_admin_roles(profile_id, course_id, role_type) where role_type = 'course_admin';

create table public.admin_signup_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  requested_course_id uuid references public.courses(id) on delete set null,
  memo text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.signup_tokens (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  token text not null unique,
  token_name text not null,
  welcome_message text not null default '',
  expires_at timestamptz,
  max_uses integer,
  used_count integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.course_schedule (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null,
  description text not null default '',
  location text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.course_assignments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  week_no integer not null default 1,
  title text not null,
  description text not null default '',
  due_at timestamptz,
  link_url text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.course_events (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null,
  description text not null default '',
  starts_at timestamptz,
  ends_at timestamptz,
  registration_open_at timestamptz,
  registration_close_at timestamptz,
  max_applicants integer,
  form_schema jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft','published','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.event_applications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.course_events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(event_id, profile_id)
);

create table public.admin_credentials (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  login_id text not null unique,
  password_hash text not null,
  is_super_admin boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.app_sessions (
  token text primary key,
  profile_id uuid references public.profiles(id) on delete cascade,
  session_kind text not null check (session_kind in ('member','course_admin','super_admin')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index app_sessions_profile_idx on public.app_sessions(profile_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger trg_profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger trg_courses_updated before update on public.courses for each row execute function public.set_updated_at();
create trigger trg_admin_signup_requests_updated before update on public.admin_signup_requests for each row execute function public.set_updated_at();
create trigger trg_signup_tokens_updated before update on public.signup_tokens for each row execute function public.set_updated_at();
create trigger trg_course_schedule_updated before update on public.course_schedule for each row execute function public.set_updated_at();
create trigger trg_course_assignments_updated before update on public.course_assignments for each row execute function public.set_updated_at();
create trigger trg_course_events_updated before update on public.course_events for each row execute function public.set_updated_at();
create trigger trg_admin_credentials_updated before update on public.admin_credentials for each row execute function public.set_updated_at();

create or replace function public.normalize_phone(p_phone text)
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g')
$$;

create or replace function public.slugify_text(p_value text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(lower(coalesce(p_value,'')), '[^a-z0-9가-힣]+', '-', 'g'))
$$;

create or replace function public.ensure_profile(p_full_name text, p_phone text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := public.normalize_phone(p_phone);
  v_profile_id uuid;
begin
  if coalesce(trim(p_full_name),'') = '' or coalesce(v_phone,'') = '' then
    raise exception '이름과 전화번호를 입력해주세요.';
  end if;

  select id into v_profile_id from public.profiles where phone = v_phone limit 1;

  if v_profile_id is null then
    insert into public.profiles(full_name, phone)
    values (trim(p_full_name), v_phone)
    returning id into v_profile_id;
  else
    update public.profiles
       set full_name = trim(p_full_name),
           phone = v_phone,
           is_active = true
     where id = v_profile_id;
  end if;

  return v_profile_id;
end $$;

create or replace function public.issue_app_session(p_profile_id uuid, p_session_kind text, p_hours integer default 720)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := encode(gen_random_bytes(24),'hex');
begin
  insert into public.app_sessions(token, profile_id, session_kind, expires_at)
  values (v_token, p_profile_id, p_session_kind, now() + make_interval(hours => greatest(coalesce(p_hours,720),1)));
  return v_token;
end $$;

create or replace function public.resolve_app_session(p_session_token text)
returns table(profile_id uuid, session_kind text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select s.profile_id, s.session_kind
    from public.app_sessions s
   where s.token = p_session_token
     and s.expires_at > now();
end $$;

create or replace function public.current_profile_id(p_session_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
begin
  select r.profile_id into v_profile_id
    from public.resolve_app_session(p_session_token) r
   limit 1;
  return v_profile_id;
end $$;

create or replace function public.current_session_kind(p_session_token text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
begin
  select r.session_kind into v_kind
    from public.resolve_app_session(p_session_token) r
   limit 1;
  return v_kind;
end $$;

create or replace function public.is_super_session(p_session_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id(p_session_token);
  v_exists boolean;
begin
  if v_profile_id is null then return false; end if;
  select exists(
    select 1 from public.course_admin_roles
    where profile_id = v_profile_id and role_type = 'super_admin'
  ) into v_exists;
  return coalesce(v_exists,false);
end $$;

create or replace function public.admin_can_manage_course(p_session_token text, p_course_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id(p_session_token);
  v_kind text := public.current_session_kind(p_session_token);
  v_exists boolean;
begin
  if v_profile_id is null then return false; end if;
  if v_kind = 'super_admin' or public.is_super_session(p_session_token) then return true; end if;
  select exists(
    select 1 from public.course_admin_roles
    where profile_id = v_profile_id
      and role_type = 'course_admin'
      and course_id = p_course_id
  ) into v_exists;
  return coalesce(v_exists,false);
end $$;

create or replace function public.app_public_list_courses()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'title', c.title,
    'instructor_name', c.instructor_name,
    'cohort_label', c.cohort_label,
    'slug', c.slug
  ) order by c.instructor_name, c.cohort_label), '[]'::jsonb)
  from public.courses c
  where c.is_visible = true
$$;

create or replace function public.app_get_signup_token_info(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  select st.*, c.title, c.instructor_name, c.cohort_label
    into v_row
    from public.signup_tokens st
    join public.courses c on c.id = st.course_id
   where st.token = trim(p_token)
     and st.is_active = true
     and (st.expires_at is null or st.expires_at > now())
     and (st.max_uses is null or st.used_count < st.max_uses)
   limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'message', '유효하지 않거나 만료된 토큰입니다.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'token', v_row.token,
    'token_name', v_row.token_name,
    'course_id', v_row.course_id,
    'course_title', v_row.title,
    'instructor_name', v_row.instructor_name,
    'cohort_label', v_row.cohort_label,
    'welcome_message', v_row.welcome_message
  );
end $$;

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
begin
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

  v_profile_id := public.ensure_profile(p_full_name, p_phone);

  insert into public.course_memberships(course_id, profile_id, member_role)
  values (v_token.course_id, v_profile_id, 'student')
  on conflict (course_id, profile_id) do nothing;

  update public.signup_tokens
     set used_count = used_count + 1
   where id = v_token.id;

  v_session_token := public.issue_app_session(v_profile_id, 'member');

  return jsonb_build_object('ok', true, 'session_token', v_session_token, 'profile_id', v_profile_id, 'course_id', v_token.course_id);
end $$;

create or replace function public.app_member_sign_in(p_full_name text, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := public.normalize_phone(p_phone);
  v_profile public.profiles%rowtype;
  v_has_membership boolean;
  v_session_token text;
begin
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

create or replace function public.app_member_get_dashboard(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id(p_session_token);
  v_profile public.profiles%rowtype;
  v_courses jsonb;
  v_schedule jsonb;
  v_events jsonb;
  v_assignments jsonb;
  v_applications jsonb;
begin
  if v_profile_id is null then
    return jsonb_build_object('ok', false, 'message', '로그인이 만료되었습니다.');
  end if;

  select * into v_profile from public.profiles where id = v_profile_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'slug', c.slug,
    'title', c.title,
    'instructor_name', c.instructor_name,
    'cohort_label', c.cohort_label,
    'description', c.description,
    'accent_color', c.accent_color
  ) order by c.instructor_name, c.cohort_label), '[]'::jsonb)
    into v_courses
    from public.course_memberships m
    join public.courses c on c.id = m.course_id
   where m.profile_id = v_profile_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'course_id', s.course_id,
    'title', s.title,
    'description', s.description,
    'location', s.location,
    'starts_at', s.starts_at,
    'ends_at', s.ends_at
  ) order by s.starts_at), '[]'::jsonb)
    into v_schedule
    from public.course_schedule s
   where s.course_id in (select course_id from public.course_memberships where profile_id = v_profile_id);

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
   where e.course_id in (select course_id from public.course_memberships where profile_id = v_profile_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'course_id', a.course_id,
    'week_no', a.week_no,
    'title', a.title,
    'description', a.description,
    'due_at', a.due_at,
    'link_url', a.link_url
  ) order by a.week_no, a.due_at), '[]'::jsonb)
    into v_assignments
    from public.course_assignments a
   where a.course_id in (select course_id from public.course_memberships where profile_id = v_profile_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'event_id', ea.event_id,
    'answers', ea.answers,
    'created_at', ea.created_at
  ) order by ea.created_at desc), '[]'::jsonb)
    into v_applications
    from public.event_applications ea
   where ea.profile_id = v_profile_id;

  return jsonb_build_object(
    'ok', true,
    'profile', jsonb_build_object('id', v_profile.id, 'full_name', v_profile.full_name, 'phone', v_profile.phone),
    'courses', v_courses,
    'schedule', v_schedule,
    'events', v_events,
    'assignments', v_assignments,
    'applications', v_applications
  );
end $$;

create or replace function public.app_member_submit_event(p_session_token text, p_event_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id(p_session_token);
  v_event public.course_events%rowtype;
  v_in_course boolean;
  v_total integer;
  v_question jsonb;
  v_option jsonb;
  v_value text;
  v_count integer;
begin
  if v_profile_id is null then
    return jsonb_build_object('ok', false, 'message', '로그인이 만료되었습니다.');
  end if;

  select * into v_event from public.course_events where id = p_event_id limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'message', '행사를 찾을 수 없습니다.');
  end if;

  select exists(
    select 1 from public.course_memberships
    where course_id = v_event.course_id and profile_id = v_profile_id
  ) into v_in_course;
  if not v_in_course then
    return jsonb_build_object('ok', false, 'message', '신청 권한이 없습니다.');
  end if;

  if v_event.registration_open_at is not null and v_event.registration_open_at > now() then
    return jsonb_build_object('ok', false, 'message', '아직 신청 시작 전입니다.');
  end if;
  if v_event.registration_close_at is not null and v_event.registration_close_at < now() then
    return jsonb_build_object('ok', false, 'message', '신청이 마감되었습니다.');
  end if;

  if exists(select 1 from public.event_applications where event_id = p_event_id and profile_id = v_profile_id) then
    return jsonb_build_object('ok', false, 'message', '이미 신청했습니다.');
  end if;

  if v_event.max_applicants is not null then
    select count(*) into v_total from public.event_applications where event_id = p_event_id;
    if v_total >= v_event.max_applicants then
      return jsonb_build_object('ok', false, 'message', '전체 신청이 마감되었습니다.');
    end if;
  end if;

  for v_question in select value from jsonb_array_elements(coalesce(v_event.form_schema, '[]'::jsonb)) loop
    if coalesce(v_question->>'type','') = 'choice' then
      v_value := p_answers->>(v_question->>'id');
      if coalesce(v_value,'') <> '' then
        for v_option in select value from jsonb_array_elements(coalesce(v_question->'options','[]'::jsonb)) loop
          if v_option->>'value' = v_value and nullif(v_option->>'limit','') is not null then
            select count(*) into v_count
              from public.event_applications ea
             where ea.event_id = p_event_id
               and ea.answers->>(v_question->>'id') = v_value;
            if v_count >= (v_option->>'limit')::integer then
              return jsonb_build_object('ok', false, 'message', format('%s 항목은 마감되었습니다.', coalesce(v_option->>'label', v_value)));
            end if;
          end if;
        end loop;
      end if;
    end if;
  end loop;

  insert into public.event_applications(event_id, profile_id, answers)
  values (p_event_id, v_profile_id, coalesce(p_answers, '{}'::jsonb));

  return jsonb_build_object('ok', true, 'message', '신청이 완료되었습니다.');
end $$;

create or replace function public.app_admin_sign_in(p_login text, p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cred public.admin_credentials%rowtype;
  v_profile public.profiles%rowtype;
  v_session_token text;
  v_is_super boolean := false;
  v_has_admin boolean := false;
begin
  select * into v_cred
    from public.admin_credentials
   where login_id = trim(p_login)
     and is_active = true
   limit 1;

  if found and v_cred.password_hash = crypt(coalesce(p_secret,''), v_cred.password_hash) then
    v_is_super := v_cred.is_super_admin;
    if v_cred.profile_id is not null then
      select * into v_profile from public.profiles where id = v_cred.profile_id;
    else
      v_profile := null;
    end if;
    v_session_token := public.issue_app_session(v_cred.profile_id, case when v_is_super then 'super_admin' else 'course_admin' end);
    return jsonb_build_object('ok', true, 'session_token', v_session_token, 'is_super_admin', v_is_super);
  end if;

  select * into v_profile
    from public.profiles
   where full_name = trim(p_login)
     and phone = public.normalize_phone(p_secret)
     and is_active = true
   limit 1;

  if found then
    select exists(select 1 from public.course_admin_roles where profile_id = v_profile.id and role_type = 'super_admin') into v_is_super;
    select exists(select 1 from public.course_admin_roles where profile_id = v_profile.id and role_type in ('super_admin','course_admin')) into v_has_admin;
    if v_has_admin then
      v_session_token := public.issue_app_session(v_profile.id, case when v_is_super then 'super_admin' else 'course_admin' end);
      return jsonb_build_object('ok', true, 'session_token', v_session_token, 'is_super_admin', v_is_super);
    end if;
  end if;

  return jsonb_build_object('ok', false, 'message', '로그인 정보를 확인해주세요.');
end $$;

create or replace function public.app_admin_request_signup(p_full_name text, p_phone text, p_requested_course_id uuid default null, p_memo text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := public.normalize_phone(p_phone);
begin
  if coalesce(trim(p_full_name),'') = '' or coalesce(v_phone,'') = '' then
    return jsonb_build_object('ok', false, 'message', '이름과 전화번호를 입력해주세요.');
  end if;

  insert into public.admin_signup_requests(full_name, phone, requested_course_id, memo, status)
  values (trim(p_full_name), v_phone, p_requested_course_id, coalesce(p_memo,''), 'pending');

  return jsonb_build_object('ok', true, 'message', '강사 admin 신청이 접수되었습니다.');
end $$;

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
    select coalesce(jsonb_agg(jsonb_build_object(
      'profile_id', r.profile_id,
      'course_id', r.course_id,
      'role_type', r.role_type,
      'created_at', r.created_at,
      'full_name', p.full_name,
      'phone', p.phone
    ) order by r.created_at desc), '[]'::jsonb)
      into v_roles
      from public.course_admin_roles r
      left join public.profiles p on p.id = r.profile_id;

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

create or replace function public.app_admin_save_course(p_session_token text, p_course jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course_id uuid := nullif(p_course->>'id','')::uuid;
  v_slug text;
  v_row public.courses%rowtype;
begin
  if not public.is_super_session(p_session_token) then
    return jsonb_build_object('ok', false, 'message', '슈퍼어드민만 강의를 생성/수정할 수 있습니다.');
  end if;

  v_slug := public.slugify_text(coalesce(p_course->>'slug',''));
  if v_slug = '' then
    v_slug := public.slugify_text(coalesce(p_course->>'instructor_name','') || '-' || coalesce(p_course->>'cohort_label','') || '-' || coalesce(p_course->>'title',''));
  end if;

  if v_course_id is null then
    insert into public.courses(slug, instructor_name, cohort_label, title, description, accent_color, status, is_visible)
    values (
      v_slug,
      coalesce(trim(p_course->>'instructor_name'),'미정'),
      coalesce(trim(p_course->>'cohort_label'),'1기'),
      coalesce(trim(p_course->>'title'),'새 강의'),
      coalesce(p_course->>'description',''),
      coalesce(p_course->>'accent_color','#ff9d4d'),
      coalesce(p_course->>'status','active'),
      coalesce((p_course->>'is_visible')::boolean, true)
    ) returning * into v_row;
  else
    update public.courses
       set slug = v_slug,
           instructor_name = coalesce(trim(p_course->>'instructor_name'),'미정'),
           cohort_label = coalesce(trim(p_course->>'cohort_label'),'1기'),
           title = coalesce(trim(p_course->>'title'),'새 강의'),
           description = coalesce(p_course->>'description',''),
           accent_color = coalesce(p_course->>'accent_color','#ff9d4d'),
           status = coalesce(p_course->>'status','active'),
           is_visible = coalesce((p_course->>'is_visible')::boolean, true)
     where id = v_course_id
     returning * into v_row;
  end if;

  return jsonb_build_object('ok', true, 'course', to_jsonb(v_row));
end $$;

create or replace function public.app_admin_save_schedule(p_session_token text, p_item jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := nullif(p_item->>'id','')::uuid;
  v_course_id uuid := nullif(p_item->>'course_id','')::uuid;
  v_row public.course_schedule%rowtype;
begin
  if v_course_id is null or not public.admin_can_manage_course(p_session_token, v_course_id) then
    return jsonb_build_object('ok', false, 'message', '일정 등록 권한이 없습니다.');
  end if;

  if v_id is null then
    insert into public.course_schedule(course_id, title, description, location, starts_at, ends_at)
    values (
      v_course_id,
      coalesce(trim(p_item->>'title'),'일정'),
      coalesce(p_item->>'description',''),
      coalesce(p_item->>'location',''),
      (p_item->>'starts_at')::timestamptz,
      nullif(p_item->>'ends_at','')::timestamptz
    ) returning * into v_row;
  else
    update public.course_schedule
       set title = coalesce(trim(p_item->>'title'),'일정'),
           description = coalesce(p_item->>'description',''),
           location = coalesce(p_item->>'location',''),
           starts_at = (p_item->>'starts_at')::timestamptz,
           ends_at = nullif(p_item->>'ends_at','')::timestamptz
     where id = v_id and course_id = v_course_id
     returning * into v_row;
  end if;

  return jsonb_build_object('ok', true, 'item', to_jsonb(v_row));
end $$;

create or replace function public.app_admin_save_assignment(p_session_token text, p_item jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := nullif(p_item->>'id','')::uuid;
  v_course_id uuid := nullif(p_item->>'course_id','')::uuid;
  v_row public.course_assignments%rowtype;
begin
  if v_course_id is null or not public.admin_can_manage_course(p_session_token, v_course_id) then
    return jsonb_build_object('ok', false, 'message', '과제 등록 권한이 없습니다.');
  end if;

  if v_id is null then
    insert into public.course_assignments(course_id, week_no, title, description, due_at, link_url)
    values (
      v_course_id,
      greatest(coalesce((p_item->>'week_no')::integer,1),1),
      coalesce(trim(p_item->>'title'),'과제'),
      coalesce(p_item->>'description',''),
      nullif(p_item->>'due_at','')::timestamptz,
      coalesce(p_item->>'link_url','')
    ) returning * into v_row;
  else
    update public.course_assignments
       set week_no = greatest(coalesce((p_item->>'week_no')::integer,1),1),
           title = coalesce(trim(p_item->>'title'),'과제'),
           description = coalesce(p_item->>'description',''),
           due_at = nullif(p_item->>'due_at','')::timestamptz,
           link_url = coalesce(p_item->>'link_url','')
     where id = v_id and course_id = v_course_id
     returning * into v_row;
  end if;

  return jsonb_build_object('ok', true, 'item', to_jsonb(v_row));
end $$;

create or replace function public.app_admin_save_event(p_session_token text, p_item jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := nullif(p_item->>'id','')::uuid;
  v_course_id uuid := nullif(p_item->>'course_id','')::uuid;
  v_row public.course_events%rowtype;
begin
  if v_course_id is null or not public.admin_can_manage_course(p_session_token, v_course_id) then
    return jsonb_build_object('ok', false, 'message', '행사 등록 권한이 없습니다.');
  end if;

  if v_id is null then
    insert into public.course_events(course_id, title, description, starts_at, ends_at, registration_open_at, registration_close_at, max_applicants, form_schema, status)
    values (
      v_course_id,
      coalesce(trim(p_item->>'title'),'행사'),
      coalesce(p_item->>'description',''),
      nullif(p_item->>'starts_at','')::timestamptz,
      nullif(p_item->>'ends_at','')::timestamptz,
      nullif(p_item->>'registration_open_at','')::timestamptz,
      nullif(p_item->>'registration_close_at','')::timestamptz,
      nullif(p_item->>'max_applicants','')::integer,
      coalesce(p_item->'form_schema','[]'::jsonb),
      coalesce(p_item->>'status','published')
    ) returning * into v_row;
  else
    update public.course_events
       set title = coalesce(trim(p_item->>'title'),'행사'),
           description = coalesce(p_item->>'description',''),
           starts_at = nullif(p_item->>'starts_at','')::timestamptz,
           ends_at = nullif(p_item->>'ends_at','')::timestamptz,
           registration_open_at = nullif(p_item->>'registration_open_at','')::timestamptz,
           registration_close_at = nullif(p_item->>'registration_close_at','')::timestamptz,
           max_applicants = nullif(p_item->>'max_applicants','')::integer,
           form_schema = coalesce(p_item->'form_schema','[]'::jsonb),
           status = coalesce(p_item->>'status','published')
     where id = v_id and course_id = v_course_id
     returning * into v_row;
  end if;

  return jsonb_build_object('ok', true, 'item', to_jsonb(v_row));
end $$;

create or replace function public.app_admin_save_token(p_session_token text, p_item jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := nullif(p_item->>'id','')::uuid;
  v_course_id uuid := nullif(p_item->>'course_id','')::uuid;
  v_row public.signup_tokens%rowtype;
  v_token text := coalesce(nullif(trim(p_item->>'token'),''), encode(gen_random_bytes(8),'hex'));
begin
  if v_course_id is null or not public.admin_can_manage_course(p_session_token, v_course_id) then
    return jsonb_build_object('ok', false, 'message', '토큰 생성 권한이 없습니다.');
  end if;

  if v_id is null then
    insert into public.signup_tokens(course_id, token, token_name, welcome_message, expires_at, max_uses, is_active)
    values (
      v_course_id,
      v_token,
      coalesce(trim(p_item->>'token_name'),'기본 토큰'),
      coalesce(p_item->>'welcome_message',''),
      nullif(p_item->>'expires_at','')::timestamptz,
      nullif(p_item->>'max_uses','')::integer,
      coalesce((p_item->>'is_active')::boolean, true)
    ) returning * into v_row;
  else
    update public.signup_tokens
       set token_name = coalesce(trim(p_item->>'token_name'),'기본 토큰'),
           welcome_message = coalesce(p_item->>'welcome_message',''),
           expires_at = nullif(p_item->>'expires_at','')::timestamptz,
           max_uses = nullif(p_item->>'max_uses','')::integer,
           is_active = coalesce((p_item->>'is_active')::boolean, true)
     where id = v_id and course_id = v_course_id
     returning * into v_row;
  end if;

  return jsonb_build_object('ok', true, 'item', to_jsonb(v_row));
end $$;

create or replace function public.app_admin_delete_item(p_session_token text, p_kind text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course_id uuid;
begin
  if p_kind = 'course' then
    if not public.is_super_session(p_session_token) then
      return jsonb_build_object('ok', false, 'message', '강의 삭제 권한이 없습니다.');
    end if;
    delete from public.courses where id = p_id;
    return jsonb_build_object('ok', true);
  elsif p_kind = 'schedule' then
    select course_id into v_course_id from public.course_schedule where id = p_id;
    if not public.admin_can_manage_course(p_session_token, v_course_id) then return jsonb_build_object('ok', false, 'message', '권한이 없습니다.'); end if;
    delete from public.course_schedule where id = p_id;
  elsif p_kind = 'assignment' then
    select course_id into v_course_id from public.course_assignments where id = p_id;
    if not public.admin_can_manage_course(p_session_token, v_course_id) then return jsonb_build_object('ok', false, 'message', '권한이 없습니다.'); end if;
    delete from public.course_assignments where id = p_id;
  elsif p_kind = 'event' then
    select course_id into v_course_id from public.course_events where id = p_id;
    if not public.admin_can_manage_course(p_session_token, v_course_id) then return jsonb_build_object('ok', false, 'message', '권한이 없습니다.'); end if;
    delete from public.course_events where id = p_id;
  elsif p_kind = 'token' then
    select course_id into v_course_id from public.signup_tokens where id = p_id;
    if not public.admin_can_manage_course(p_session_token, v_course_id) then return jsonb_build_object('ok', false, 'message', '권한이 없습니다.'); end if;
    delete from public.signup_tokens where id = p_id;
  elsif p_kind = 'membership' then
    select course_id into v_course_id from public.course_memberships where id = p_id;
    if not public.admin_can_manage_course(p_session_token, v_course_id) then return jsonb_build_object('ok', false, 'message', '권한이 없습니다.'); end if;
    delete from public.course_memberships where id = p_id;
  else
    return jsonb_build_object('ok', false, 'message', '삭제 종류가 올바르지 않습니다.');
  end if;

  return jsonb_build_object('ok', true);
end $$;

create or replace function public.app_admin_upsert_member(p_session_token text, p_course_id uuid, p_full_name text, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
begin
  if not public.admin_can_manage_course(p_session_token, p_course_id) then
    return jsonb_build_object('ok', false, 'message', '회원 추가 권한이 없습니다.');
  end if;

  v_profile_id := public.ensure_profile(p_full_name, p_phone);

  insert into public.course_memberships(course_id, profile_id, member_role)
  values (p_course_id, v_profile_id, 'student')
  on conflict (course_id, profile_id) do nothing;

  return jsonb_build_object('ok', true, 'profile_id', v_profile_id);
end $$;

create or replace function public.app_admin_assign_role(p_session_token text, p_profile_id uuid, p_role_type text, p_course_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_session(p_session_token) then
    return jsonb_build_object('ok', false, 'message', '슈퍼어드민만 권한을 변경할 수 있습니다.');
  end if;

  if p_role_type = 'super_admin' then
    insert into public.course_admin_roles(profile_id, course_id, role_type)
    values (p_profile_id, null, 'super_admin')
    on conflict do nothing;
  elsif p_role_type = 'course_admin' then
    insert into public.course_admin_roles(profile_id, course_id, role_type)
    values (p_profile_id, p_course_id, 'course_admin')
    on conflict do nothing;
  else
    return jsonb_build_object('ok', false, 'message', '잘못된 권한입니다.');
  end if;

  return jsonb_build_object('ok', true);
end $$;

create or replace function public.app_admin_resolve_request(p_session_token text, p_request_id uuid, p_status text, p_course_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.admin_signup_requests%rowtype;
  v_profile_id uuid;
begin
  if not public.is_super_session(p_session_token) then
    return jsonb_build_object('ok', false, 'message', '슈퍼어드민만 신청을 처리할 수 있습니다.');
  end if;

  select * into v_req from public.admin_signup_requests where id = p_request_id limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'message', '신청 내역을 찾을 수 없습니다.');
  end if;

  update public.admin_signup_requests
     set status = case when p_status in ('approved','rejected') then p_status else 'pending' end,
         requested_course_id = coalesce(p_course_id, requested_course_id)
   where id = p_request_id;

  if p_status = 'approved' then
    v_profile_id := public.ensure_profile(v_req.full_name, v_req.phone);
    insert into public.course_admin_roles(profile_id, course_id, role_type)
    values (v_profile_id, coalesce(p_course_id, v_req.requested_course_id), 'course_admin')
    on conflict do nothing;
  end if;

  return jsonb_build_object('ok', true);
end $$;

create or replace function public.app_sign_out(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.app_sessions where token = p_session_token;
  return jsonb_build_object('ok', true);
end $$;

-- permissions: only RPC exposure
revoke all on schema public from public;
grant usage on schema public to anon, authenticated;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- execute RPCs from browser
grant execute on function public.app_public_list_courses() to anon, authenticated;
grant execute on function public.app_get_signup_token_info(text) to anon, authenticated;
grant execute on function public.app_member_sign_up(text,text,text) to anon, authenticated;
grant execute on function public.app_member_sign_in(text,text) to anon, authenticated;
grant execute on function public.app_member_get_dashboard(text) to anon, authenticated;
grant execute on function public.app_member_submit_event(text,uuid,jsonb) to anon, authenticated;
grant execute on function public.app_admin_sign_in(text,text) to anon, authenticated;
grant execute on function public.app_admin_request_signup(text,text,uuid,text) to anon, authenticated;
grant execute on function public.app_admin_get_bootstrap(text) to anon, authenticated;
grant execute on function public.app_admin_save_course(text,jsonb) to anon, authenticated;
grant execute on function public.app_admin_save_schedule(text,jsonb) to anon, authenticated;
grant execute on function public.app_admin_save_assignment(text,jsonb) to anon, authenticated;
grant execute on function public.app_admin_save_event(text,jsonb) to anon, authenticated;
grant execute on function public.app_admin_save_token(text,jsonb) to anon, authenticated;
grant execute on function public.app_admin_delete_item(text,text,uuid) to anon, authenticated;
grant execute on function public.app_admin_upsert_member(text,uuid,text,text) to anon, authenticated;
grant execute on function public.app_admin_assign_role(text,uuid,text,uuid) to anon, authenticated;
grant execute on function public.app_admin_resolve_request(text,uuid,text,uuid) to anon, authenticated;
grant execute on function public.app_sign_out(text) to anon, authenticated;
grant execute on function public.normalize_phone(text) to anon, authenticated;

-- default super admin
with ensured as (
  insert into public.profiles(full_name, phone)
  values ('슈퍼어드민', '00000000000')
  on conflict (phone) do update set full_name = excluded.full_name
  returning id
)
insert into public.admin_credentials(profile_id, login_id, password_hash, is_super_admin, is_active)
select id, 'wfe2303', crypt('122303', gen_salt('bf')), true, true from ensured
on conflict (login_id) do update
set password_hash = excluded.password_hash,
    is_super_admin = true,
    is_active = true,
    profile_id = excluded.profile_id;

insert into public.course_admin_roles(profile_id, course_id, role_type)
select profile_id, null, 'super_admin'
from public.admin_credentials
where login_id = 'wfe2303'
on conflict do nothing;

notify pgrst, 'reload schema';
