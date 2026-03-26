create extension if not exists pgcrypto;

alter table public.course_memberships
  add column if not exists room_no text not null default '';

alter table public.course_memberships
  add column if not exists memo text not null default '';

create table if not exists public.event_attendance (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.course_events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  method text not null default 'admin_manual',
  created_at timestamptz not null default now(),
  unique(event_id, profile_id)
);

create index if not exists event_attendance_event_idx on public.event_attendance(event_id, checked_in_at desc);
create index if not exists event_attendance_profile_idx on public.event_attendance(profile_id, checked_in_at desc);

create table if not exists public.admin_activity_logs (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references public.courses(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  actor text not null default '',
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_activity_logs_course_idx on public.admin_activity_logs(course_id, created_at desc);
create index if not exists admin_activity_logs_profile_idx on public.admin_activity_logs(profile_id, created_at desc);

-- custom session 기반 프런트에서 직접 접근하는 테이블 권한
grant select, update on table public.course_memberships to anon, authenticated;
grant select, insert, delete on table public.event_attendance to anon, authenticated;
grant select, insert on table public.admin_activity_logs to anon, authenticated;
