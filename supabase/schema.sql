create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  subtitle text,
  description text,
  instructor_name text,
  cohort_label text,
  accent_color text default '#ff9d4d',
  status text not null default 'active',
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.course_memberships (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'student' check (role in ('student')),
  created_at timestamptz not null default now(),
  unique(course_id, user_id)
);

create table if not exists public.course_admin_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid references public.courses(id) on delete cascade,
  role_type text not null check (role_type in ('super_admin','course_admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.course_schedule (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  week_no int,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.course_events (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null,
  category text not null default 'recruitment',
  registration_open_at timestamptz,
  registration_close_at timestamptz,
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  description text,
  apply_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.course_assignments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  week_no int,
  title text not null,
  description text,
  due_at timestamptz,
  material_url text,
  is_required boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.signup_tokens (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  token text unique not null,
  token_name text,
  welcome_message text,
  expires_at timestamptz,
  max_uses int,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_signup_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  requester_email text not null,
  full_name text,
  phone text,
  requested_role_type text not null check (requested_role_type in ('super_admin','course_admin')),
  requested_course_id uuid references public.courses(id) on delete set null,
  memo text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists idx_memberships_user_id on public.course_memberships(user_id);
create index if not exists idx_admin_roles_user_id on public.course_admin_roles(user_id);
create unique index if not exists idx_admin_roles_unique_course on public.course_admin_roles(user_id, course_id, role_type) where course_id is not null;
create unique index if not exists idx_admin_roles_unique_super on public.course_admin_roles(user_id, role_type) where course_id is null;
create index if not exists idx_schedule_course_id on public.course_schedule(course_id);
create index if not exists idx_events_course_id on public.course_events(course_id);
create index if not exists idx_assignments_course_id on public.course_assignments(course_id);
create index if not exists idx_signup_tokens_token on public.signup_tokens(token);
create index if not exists idx_admin_requests_requester_id on public.admin_signup_requests(requester_id);

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.profiles.full_name),
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user_profile();

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.course_admin_roles
    where user_id = auth.uid() and role_type = 'super_admin'
  );
$$;

create or replace function public.can_manage_course(target_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin() or exists(
    select 1 from public.course_admin_roles
    where user_id = auth.uid()
      and role_type = 'course_admin'
      and course_id = target_course_id
  );
$$;

create or replace function public.bootstrap_super_admin(target_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid;
begin
  select id into target_user_id from auth.users where email = target_email limit 1;
  if target_user_id is null then
    raise exception 'User not found for %', target_email;
  end if;

  insert into public.course_admin_roles (user_id, course_id, role_type)
  values (target_user_id, null, 'super_admin')
  on conflict do nothing;

  return 'ok';
end;
$$;

alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.course_memberships enable row level security;
alter table public.course_admin_roles enable row level security;
alter table public.course_schedule enable row level security;
alter table public.course_events enable row level security;
alter table public.course_assignments enable row level security;
alter table public.signup_tokens enable row level security;
alter table public.admin_signup_requests enable row level security;

-- profiles
drop policy if exists profiles_select_scope on public.profiles;
create policy profiles_select_scope on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or public.is_super_admin()
  or exists (
    select 1
    from public.course_memberships m
    where m.user_id = profiles.id
      and public.can_manage_course(m.course_id)
  )
  or exists (
    select 1
    from public.course_admin_roles ar
    where ar.user_id = profiles.id
      and public.is_super_admin()
  )
);

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
for insert to authenticated
with check (id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
for update to authenticated
using (id = auth.uid() or public.is_super_admin())
with check (id = auth.uid() or public.is_super_admin());

-- courses
drop policy if exists courses_select_member on public.courses;
create policy courses_select_member on public.courses
for select to authenticated
using (
  exists(select 1 from public.course_memberships m where m.course_id = courses.id and m.user_id = auth.uid())
  or public.can_manage_course(courses.id)
);

drop policy if exists courses_insert_super on public.courses;
create policy courses_insert_super on public.courses
for insert to authenticated
with check (public.is_super_admin());

drop policy if exists courses_update_admin on public.courses;
create policy courses_update_admin on public.courses
for update to authenticated
using (public.can_manage_course(courses.id))
with check (public.can_manage_course(courses.id));

drop policy if exists courses_delete_admin on public.courses;
create policy courses_delete_admin on public.courses
for delete to authenticated
using (public.can_manage_course(courses.id));

-- memberships
drop policy if exists memberships_select_self_or_admin on public.course_memberships;
create policy memberships_select_self_or_admin on public.course_memberships
for select to authenticated
using (user_id = auth.uid() or public.can_manage_course(course_id));

drop policy if exists memberships_insert_self_or_admin on public.course_memberships;
create policy memberships_insert_self_or_admin on public.course_memberships
for insert to authenticated
with check (user_id = auth.uid() or public.can_manage_course(course_id));

drop policy if exists memberships_delete_admin on public.course_memberships;
create policy memberships_delete_admin on public.course_memberships
for delete to authenticated
using (public.can_manage_course(course_id));

-- admin roles
drop policy if exists admin_roles_select_self_or_super on public.course_admin_roles;
create policy admin_roles_select_self_or_super on public.course_admin_roles
for select to authenticated
using (user_id = auth.uid() or public.is_super_admin());

drop policy if exists admin_roles_insert_super on public.course_admin_roles;
create policy admin_roles_insert_super on public.course_admin_roles
for insert to authenticated
with check (public.is_super_admin());

drop policy if exists admin_roles_delete_super on public.course_admin_roles;
create policy admin_roles_delete_super on public.course_admin_roles
for delete to authenticated
using (public.is_super_admin());

-- schedule / events / assignments / tokens
drop policy if exists schedule_select_scope on public.course_schedule;
create policy schedule_select_scope on public.course_schedule
for select to authenticated using (
  exists(select 1 from public.course_memberships m where m.course_id = course_schedule.course_id and m.user_id = auth.uid())
  or public.can_manage_course(course_schedule.course_id)
);
drop policy if exists schedule_insert_admin on public.course_schedule;
create policy schedule_insert_admin on public.course_schedule
for insert to authenticated with check (public.can_manage_course(course_id));
drop policy if exists schedule_update_admin on public.course_schedule;
create policy schedule_update_admin on public.course_schedule
for update to authenticated using (public.can_manage_course(course_id)) with check (public.can_manage_course(course_id));
drop policy if exists schedule_delete_admin on public.course_schedule;
create policy schedule_delete_admin on public.course_schedule
for delete to authenticated using (public.can_manage_course(course_id));

drop policy if exists events_select_scope on public.course_events;
create policy events_select_scope on public.course_events
for select to authenticated using (
  exists(select 1 from public.course_memberships m where m.course_id = course_events.course_id and m.user_id = auth.uid())
  or public.can_manage_course(course_events.course_id)
);
drop policy if exists events_insert_admin on public.course_events;
create policy events_insert_admin on public.course_events
for insert to authenticated with check (public.can_manage_course(course_id));
drop policy if exists events_update_admin on public.course_events;
create policy events_update_admin on public.course_events
for update to authenticated using (public.can_manage_course(course_id)) with check (public.can_manage_course(course_id));
drop policy if exists events_delete_admin on public.course_events;
create policy events_delete_admin on public.course_events
for delete to authenticated using (public.can_manage_course(course_id));

drop policy if exists assignments_select_scope on public.course_assignments;
create policy assignments_select_scope on public.course_assignments
for select to authenticated using (
  exists(select 1 from public.course_memberships m where m.course_id = course_assignments.course_id and m.user_id = auth.uid())
  or public.can_manage_course(course_assignments.course_id)
);
drop policy if exists assignments_insert_admin on public.course_assignments;
create policy assignments_insert_admin on public.course_assignments
for insert to authenticated with check (public.can_manage_course(course_id));
drop policy if exists assignments_update_admin on public.course_assignments;
create policy assignments_update_admin on public.course_assignments
for update to authenticated using (public.can_manage_course(course_id)) with check (public.can_manage_course(course_id));
drop policy if exists assignments_delete_admin on public.course_assignments;
create policy assignments_delete_admin on public.course_assignments
for delete to authenticated using (public.can_manage_course(course_id));

drop policy if exists tokens_select_scope on public.signup_tokens;
create policy tokens_select_scope on public.signup_tokens
for select to authenticated using (
  exists(select 1 from public.course_memberships m where m.course_id = signup_tokens.course_id and m.user_id = auth.uid())
  or public.can_manage_course(signup_tokens.course_id)
);
drop policy if exists tokens_insert_admin on public.signup_tokens;
create policy tokens_insert_admin on public.signup_tokens
for insert to authenticated with check (public.can_manage_course(course_id));
drop policy if exists tokens_update_admin on public.signup_tokens;
create policy tokens_update_admin on public.signup_tokens
for update to authenticated using (public.can_manage_course(course_id)) with check (public.can_manage_course(course_id));
drop policy if exists tokens_delete_admin on public.signup_tokens;
create policy tokens_delete_admin on public.signup_tokens
for delete to authenticated using (public.can_manage_course(course_id));

-- admin requests
drop policy if exists admin_requests_insert_self on public.admin_signup_requests;
create policy admin_requests_insert_self on public.admin_signup_requests
for insert to authenticated
with check (requester_id = auth.uid());

drop policy if exists admin_requests_select_scope on public.admin_signup_requests;
create policy admin_requests_select_scope on public.admin_signup_requests
for select to authenticated
using (requester_id = auth.uid() or public.is_super_admin());

drop policy if exists admin_requests_update_super on public.admin_signup_requests;
create policy admin_requests_update_super on public.admin_signup_requests
for update to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());
