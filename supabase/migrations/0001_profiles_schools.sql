-- Migration 1 (T2): profiles, schools, RLS helper functions, base policies.
-- Requirements: R2, R4, R22, R29, R34

-- ---------------------------------------------------------------- schools
-- Populated only by the search route handler using the service role. (R22, R34)
create table if not exists public.schools (
  id             uuid primary key default gen_random_uuid(),
  kakao_place_id text        not null unique,
  name           text        not null,
  address        text,
  lat            double precision,
  lng            double precision,
  created_at     timestamptz not null default now()
);

comment on table public.schools is
  'Schools imported from the Kakao local API. kakao_place_id is the natural key (R22).';

-- --------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text        not null,
  full_name  text        not null,
  nickname   text        not null,
  school_id  uuid        references public.schools (id) on delete set null,
  role       text        not null default 'teacher' check (role in ('teacher', 'admin')),
  status     text        not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- R29: nickname is unique across the whole platform.
create unique index if not exists profiles_nickname_key
  on public.profiles (lower(nickname));

create index if not exists profiles_status_idx on public.profiles (status);
create index if not exists profiles_school_id_idx on public.profiles (school_id);

-- ------------------------------------------------------- helper functions
-- SECURITY DEFINER so policies can read profiles without recursing into
-- profiles' own RLS. STABLE so the planner evaluates it once per statement
-- instead of once per row.
create or replace function public.is_approved()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'approved'
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.status = 'approved'
  );
$$;

revoke all on function public.is_approved() from public;
revoke all on function public.is_admin() from public;
grant execute on function public.is_approved() to authenticated, anon;
grant execute on function public.is_admin() to authenticated, anon;

-- Lets the signup form warn about a taken nickname before calling signUp.
-- The unique index above is the actual guarantee. (R29)
create or replace function public.nickname_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select not exists (
    select 1 from public.profiles p
    where lower(p.nickname) = lower(trim(candidate))
  );
$$;

grant execute on function public.nickname_available(text) to anon, authenticated;

-- ------------------------------------------------- profile creation on signup
-- Runs as definer, so it writes the row without any INSERT policy existing.
-- Users therefore cannot forge a profile with role = 'admin'. (R2)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name, nickname, school_id, role, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'nickname', ''),
    nullif(new.raw_user_meta_data ->> 'school_id', '')::uuid,
    'teacher',
    'pending'   -- R2: every new account starts pending.
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- A user may edit their own nickname and school (R27) but must not be able to
-- approve themselves or become an admin. RLS WITH CHECK cannot see OLD, so this
-- is a trigger. Triggers also run for the service role, hence the auth.uid()
-- IS NULL escape for server-side approval writes.
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (new.role is distinct from old.role or new.status is distinct from old.status)
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'role and status are managed by administrators'
      using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_guard_privileges on public.profiles;
create trigger profiles_guard_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- ------------------------------------------------------------------- RLS
alter table public.schools  enable row level security;
alter table public.profiles enable row level security;

-- Own row is readable regardless of status: the "waiting for approval" screen
-- has to be able to read its own status. This is the one exception to
-- is_approved(); it must not spread to any other table. (R2)
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = auth.uid());

-- Approved users see each other so posts and comments can show nicknames.
create policy profiles_select_approved on public.profiles
  for select to authenticated
  using (public.is_approved());

create policy profiles_select_admin on public.profiles
  for select to authenticated
  using (public.is_admin());

-- R27: edit your own nickname / school. The trigger above blocks role+status.
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- R22 / R34: schools are readable by approved users and writable by nobody
-- holding a user session. No insert/update/delete policy exists, so RLS denies
-- those for anon and authenticated. Only the service role can write. (AC22)
create policy schools_select_approved on public.schools
  for select to authenticated
  using (public.is_approved());
