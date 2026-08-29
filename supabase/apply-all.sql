-- =============================================================
-- 솔방울(shareSchool) 스키마 : 마이그레이션 0001~0017 + 시드
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 Run.
-- =============================================================


-- >>>>>>>>>> 0001_profiles_schools.sql <<<<<<<<<<

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


-- >>>>>>>>>> 0002_categories.sql <<<<<<<<<<

-- Migration 2 (T6): school level / category pairing, enforced in the database.
-- Requirements: R6, R7  |  Acceptance: AC4
--
-- This mapping is duplicated in src/lib/categories.ts. Change both together.

create or replace function public.is_valid_category(
  level text,
  category text
) returns boolean
language sql
immutable
as $$
  select case level
    when 'elementary' then category in ('수업자료', '학급자료')
    when 'secondary'  then category in (
      '국어', '수학', '사회', '영어', '역사',
      '과학', '기술', '미술', '음악', '체육'
    )
    else false
  end;
$$;

comment on function public.is_valid_category(text, text) is
  'R7: a detail category is only valid within its own school level. Used by the CHECK constraint on share_posts and club_posts.';

-- Shared updated_at maintenance for the post tables.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- >>>>>>>>>> 0003_share.sql <<<<<<<<<<

-- Migration 3 (T7): item types and the whole share feature.
-- Requirements: R8-R16  |  Acceptance: AC4, AC5, AC6, AC7, AC8, AC9, AC10

-- ------------------------------------------------------------- item_types
-- Carbon coefficients. Admin-writable only. (R16)
create table if not exists public.item_types (
  id         uuid primary key default gen_random_uuid(),
  label      text    not null unique,
  carbon_g   integer not null check (carbon_g >= 0),
  sort_order integer not null default 0,
  is_active  boolean not null default true
);

-- ------------------------------------------------------------ share_posts
create table if not exists public.share_posts (
  id           uuid primary key default gen_random_uuid(),
  author_id    uuid        not null references public.profiles (id) on delete cascade,
  title        text        not null check (length(btrim(title)) > 0),
  description  text        not null default '',
  school_level text        not null check (school_level in ('elementary', 'secondary')),
  category     text        not null,
  item_type_id uuid        references public.item_types (id) on delete set null,
  -- R16: snapshot of item_types.carbon_g taken when the post is written.
  -- Editing the coefficient table later does not rewrite past posts.
  carbon_g     integer     not null default 0 check (carbon_g >= 0),
  status       text        not null default 'available'
                 check (status in ('available', 'reserved', 'completed')),
  reserved_by  uuid        references public.profiles (id) on delete set null,
  reserved_at  timestamptz,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- R6, R7 (AC4)
  constraint share_posts_category_matches_level
    check (public.is_valid_category(school_level, category))
);

-- R8: list filtering by level + category.
create index if not exists share_posts_filter_idx
  on public.share_posts (school_level, category, created_at desc);
create index if not exists share_posts_created_idx
  on public.share_posts (created_at desc);
-- R17: partial index for the carbon total aggregate.
create index if not exists share_posts_completed_author_idx
  on public.share_posts (author_id) where status = 'completed';

-- ------------------------------------------------------ share_post_images
create table if not exists public.share_post_images (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid    not null references public.share_posts (id) on delete cascade,
  storage_path text    not null,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists share_post_images_post_idx
  on public.share_post_images (post_id, sort_order);

-- ---------------------------------------------------------- share_comments
create table if not exists public.share_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.share_posts (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (length(btrim(body)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists share_comments_post_idx
  on public.share_comments (post_id, created_at);

-- ------------------------------------------------------ image count trigger
-- R10 / R19 (AC6, AC11). One function, both tables, max passed as a trigger arg.
create or replace function public.enforce_post_image_limit()
returns trigger
language plpgsql
as $$
declare
  max_images int := tg_argv[0]::int;
  existing   int;
begin
  execute format('select count(*) from %I.%I where post_id = $1', tg_table_schema, tg_table_name)
    into existing
    using new.post_id;

  if existing >= max_images then
    raise exception '한 게시글에 사진은 최대 %장까지 첨부할 수 있습니다', max_images
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists share_post_images_limit on public.share_post_images;
create trigger share_post_images_limit
  before insert on public.share_post_images
  for each row execute function public.enforce_post_image_limit('4');

-- -------------------------------------------------- status transition guard
-- R11-R14 (AC7, AC9). Also constrains what a non-author may change at all,
-- because the UPDATE policy has to stay open enough for a stranger to reserve.
create or replace function public.guard_share_post_transition()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := auth.uid();
begin
  -- A non-author may only reserve an available post, or release a reservation
  -- they themselves hold. Nothing else about the post may move. (R12, R13)
  if actor is not null and actor <> old.author_id then
    if new.title        is distinct from old.title
    or new.description  is distinct from old.description
    or new.school_level is distinct from old.school_level
    or new.category     is distinct from old.category
    or new.item_type_id is distinct from old.item_type_id
    or new.carbon_g     is distinct from old.carbon_g
    or new.author_id    is distinct from old.author_id
    or new.completed_at is distinct from old.completed_at then
      raise exception '글쓴이만 이 글을 수정할 수 있습니다'
        using errcode = 'check_violation';
    end if;

    if not (
      (old.status = 'available' and new.status = 'reserved'  and new.reserved_by = actor)
      or (old.status = 'reserved'  and old.reserved_by = actor
          and new.status = 'available' and new.reserved_by is null)
    ) then
      raise exception '허용되지 않은 예약 변경입니다'
        using errcode = 'check_violation';
    end if;
  end if;

  -- R14: completed is terminal. Nothing leaves it, not even the author.
  if old.status = 'completed' and new.status <> 'completed' then
    raise exception '나눔완료 상태는 되돌릴 수 없습니다'
      using errcode = 'check_violation';
  end if;

  -- R11: available -> reserved -> completed. No skipping.
  if old.status <> new.status
     and not (
       (old.status = 'available' and new.status = 'reserved')
       or (old.status = 'reserved' and new.status = 'available')
       or (old.status = 'reserved' and new.status = 'completed')
     ) then
    raise exception '허용되지 않은 상태 전이입니다: % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;

  -- R12: an already reserved post cannot be handed to a different reserver.
  if old.status = 'reserved' and new.status = 'reserved'
     and new.reserved_by is distinct from old.reserved_by then
    raise exception '이미 예약된 글입니다'
      using errcode = 'check_violation';
  end if;

  -- R12: the author cannot reserve their own post.
  if new.status = 'reserved' and new.reserved_by = new.author_id then
    raise exception '자기 글은 예약할 수 없습니다'
      using errcode = 'check_violation';
  end if;

  -- Keep the bookkeeping columns honest rather than trusting the caller.
  if new.status = 'reserved' then
    if new.reserved_by is null then
      raise exception '예약자가 필요합니다' using errcode = 'check_violation';
    end if;
    if old.status <> 'reserved' then
      new.reserved_at := now();
    end if;
  elsif new.status = 'available' then
    new.reserved_by := null;
    new.reserved_at := null;
  elsif new.status = 'completed' and old.status <> 'completed' then
    new.completed_at := now();
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists share_posts_transition on public.share_posts;
create trigger share_posts_transition
  before update on public.share_posts
  for each row execute function public.guard_share_post_transition();

-- A brand new post always starts available with no reserver. (R11)
create or replace function public.guard_share_post_insert()
returns trigger
language plpgsql
as $$
begin
  new.status       := 'available';
  new.reserved_by  := null;
  new.reserved_at  := null;
  new.completed_at := null;
  return new;
end;
$$;

drop trigger if exists share_posts_insert_defaults on public.share_posts;
create trigger share_posts_insert_defaults
  before insert on public.share_posts
  for each row execute function public.guard_share_post_insert();

-- ------------------------------------------------ comments blocked while reserved
-- R15 (AC8). Enforced here, not in the form, so an API call cannot slip past.
create or replace function public.block_comment_while_reserved()
returns trigger
language plpgsql
as $$
declare
  post_status text;
begin
  select status into post_status
  from public.share_posts where id = new.post_id;

  if post_status = 'reserved' then
    raise exception '예약중인 나눔 글에는 댓글을 쓸 수 없습니다'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists share_comments_block_reserved on public.share_comments;
create trigger share_comments_block_reserved
  before insert on public.share_comments
  for each row execute function public.block_comment_while_reserved();

-- ------------------------------------------------------------------- RLS
alter table public.item_types        enable row level security;
alter table public.share_posts       enable row level security;
alter table public.share_post_images enable row level security;
alter table public.share_comments    enable row level security;

-- R16: coefficients are readable by approved users, writable by admins only.
create policy item_types_select on public.item_types
  for select to authenticated using (public.is_approved());
create policy item_types_admin_write on public.item_types
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- R4 / AC3: nothing here is readable without an approved profile.
create policy share_posts_select on public.share_posts
  for select to authenticated using (public.is_approved());

create policy share_posts_insert on public.share_posts
  for insert to authenticated
  with check (public.is_approved() and author_id = auth.uid());

-- Open enough for a stranger to reserve an available post (R12); the trigger
-- above is what stops them from changing anything else.
create policy share_posts_update on public.share_posts
  for update to authenticated
  using (
    public.is_approved()
    and (author_id = auth.uid() or reserved_by = auth.uid() or status = 'available')
  )
  with check (public.is_approved());

create policy share_posts_delete on public.share_posts
  for delete to authenticated
  using (public.is_approved() and author_id = auth.uid());

create policy share_post_images_select on public.share_post_images
  for select to authenticated using (public.is_approved());

create policy share_post_images_write on public.share_post_images
  for insert to authenticated
  with check (
    public.is_approved()
    and exists (
      select 1 from public.share_posts p
      where p.id = post_id and p.author_id = auth.uid()
    )
  );

create policy share_post_images_delete on public.share_post_images
  for delete to authenticated
  using (
    public.is_approved()
    and exists (
      select 1 from public.share_posts p
      where p.id = post_id and p.author_id = auth.uid()
    )
  );

create policy share_comments_select on public.share_comments
  for select to authenticated using (public.is_approved());

create policy share_comments_insert on public.share_comments
  for insert to authenticated
  with check (public.is_approved() and author_id = auth.uid());

create policy share_comments_delete on public.share_comments
  for delete to authenticated
  using (public.is_approved() and author_id = auth.uid());


-- >>>>>>>>>> 0004_clubs.sql <<<<<<<<<<

-- Migration 4 (T12): the club (소모임) feature.
-- Requirements: R18, R19, R20  |  Acceptance: AC11
--
-- Clubs are a board: posts plus comments. No membership, no roster, no
-- reservation, and therefore no comment gating. (Non-Goals)

create table if not exists public.club_posts (
  id           uuid primary key default gen_random_uuid(),
  author_id    uuid        not null references public.profiles (id) on delete cascade,
  title        text        not null check (length(btrim(title)) > 0),
  description  text        not null default '',
  school_level text        not null check (school_level in ('elementary', 'secondary')),
  category     text        not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint club_posts_category_matches_level
    check (public.is_valid_category(school_level, category))   -- R6, R7
);

create index if not exists club_posts_filter_idx
  on public.club_posts (school_level, category, created_at desc);
create index if not exists club_posts_created_idx
  on public.club_posts (created_at desc);

create table if not exists public.club_post_images (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid    not null references public.club_posts (id) on delete cascade,
  storage_path text    not null,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists club_post_images_post_idx
  on public.club_post_images (post_id, sort_order);

create table if not exists public.club_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.club_posts (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (length(btrim(body)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists club_comments_post_idx
  on public.club_comments (post_id, created_at);

-- R19 (AC11): at most 2 photos. Same trigger function as share, different arg.
drop trigger if exists club_post_images_limit on public.club_post_images;
create trigger club_post_images_limit
  before insert on public.club_post_images
  for each row execute function public.enforce_post_image_limit('2');

drop trigger if exists club_posts_touch on public.club_posts;
create trigger club_posts_touch
  before update on public.club_posts
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------------- RLS
alter table public.club_posts       enable row level security;
alter table public.club_post_images enable row level security;
alter table public.club_comments    enable row level security;

create policy club_posts_select on public.club_posts
  for select to authenticated using (public.is_approved());
create policy club_posts_insert on public.club_posts
  for insert to authenticated
  with check (public.is_approved() and author_id = auth.uid());
create policy club_posts_update on public.club_posts
  for update to authenticated
  using (public.is_approved() and author_id = auth.uid())
  with check (public.is_approved() and author_id = auth.uid());
create policy club_posts_delete on public.club_posts
  for delete to authenticated
  using (public.is_approved() and author_id = auth.uid());

create policy club_post_images_select on public.club_post_images
  for select to authenticated using (public.is_approved());
create policy club_post_images_write on public.club_post_images
  for insert to authenticated
  with check (
    public.is_approved()
    and exists (select 1 from public.club_posts p
                where p.id = post_id and p.author_id = auth.uid())
  );
create policy club_post_images_delete on public.club_post_images
  for delete to authenticated
  using (
    public.is_approved()
    and exists (select 1 from public.club_posts p
                where p.id = post_id and p.author_id = auth.uid())
  );

-- R20: no status gate here, unlike share_comments.
create policy club_comments_select on public.club_comments
  for select to authenticated using (public.is_approved());
create policy club_comments_insert on public.club_comments
  for insert to authenticated
  with check (public.is_approved() and author_id = auth.uid());
create policy club_comments_delete on public.club_comments
  for delete to authenticated
  using (public.is_approved() and author_id = auth.uid());


-- >>>>>>>>>> 0005_school_reviews.sql <<<<<<<<<<

-- Migration 5 (T16): school review questions, reviews, answers, summary view.
-- Requirements: R23, R24, R25, R26  |  Acceptance: AC14, AC15

-- R26: one nationwide question set, managed by admins.
create table if not exists public.school_review_questions (
  id         uuid primary key default gen_random_uuid(),
  text       text    not null check (length(btrim(text)) > 0),
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- R24: one review per user per school. Re-rating overwrites.
create table if not exists public.school_reviews (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, user_id)
);

create table if not exists public.school_review_answers (
  id          uuid primary key default gen_random_uuid(),
  review_id   uuid    not null references public.school_reviews (id) on delete cascade,
  question_id uuid    not null references public.school_review_questions (id) on delete cascade,
  score       integer not null check (score between 1 and 5),
  unique (review_id, question_id)
);

create index if not exists school_reviews_school_idx on public.school_reviews (school_id);
create index if not exists school_review_answers_question_idx
  on public.school_review_answers (question_id);

drop trigger if exists school_reviews_touch on public.school_reviews;
create trigger school_reviews_touch
  before update on public.school_reviews
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------------ view
-- R23, R25. One row per (school, question) plus a rollup row where
-- question_id is null carrying the school's overall average.
--
-- Deactivated questions stay in here as long as they still have answers, so a
-- school's history does not vanish when an admin retires a question. (AC15)
--
-- security_invoker so the caller's RLS on the base tables still applies. A view
-- that bypassed RLS would make AC3 meaningless.
create or replace view public.school_rating_summary
with (security_invoker = true) as
with answer_rows as (
  select r.school_id,
         a.question_id,
         a.score
  from public.school_review_answers a
  join public.school_reviews r on r.id = a.review_id
),
reviewers as (
  select school_id, count(*)::bigint as reviewer_count
  from public.school_reviews
  group by school_id
)
select
  ar.school_id,
  ar.question_id,
  q.text        as question_text,
  q.sort_order  as question_sort_order,
  q.is_active   as question_is_active,
  round(avg(ar.score)::numeric, 1) as average_score,
  count(*)::bigint                 as answer_count,
  coalesce(rv.reviewer_count, 0)   as reviewer_count
from answer_rows ar
left join public.school_review_questions q on q.id = ar.question_id
left join reviewers rv on rv.school_id = ar.school_id
group by ar.school_id, ar.question_id, q.text, q.sort_order, q.is_active, rv.reviewer_count

union all

select
  ar.school_id,
  null::uuid,
  null::text,
  null::integer,
  null::boolean,
  round(avg(ar.score)::numeric, 1),
  count(*)::bigint,
  coalesce(rv.reviewer_count, 0)
from answer_rows ar
left join reviewers rv on rv.school_id = ar.school_id
group by ar.school_id, rv.reviewer_count;

comment on view public.school_rating_summary is
  'R23/R25. question_id null = the school-wide rollup row. Averages rounded to one decimal.';

-- ------------------------------------------------------------------- RLS
alter table public.school_review_questions enable row level security;
alter table public.school_reviews          enable row level security;
alter table public.school_review_answers   enable row level security;

-- Approved users read every question, active or not: the summary needs the
-- text of retired questions. The rating form filters on is_active itself.
create policy questions_select on public.school_review_questions
  for select to authenticated using (public.is_approved());
create policy questions_admin_write on public.school_review_questions
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy reviews_select on public.school_reviews
  for select to authenticated using (public.is_approved());
create policy reviews_write_own on public.school_reviews
  for all to authenticated
  using (public.is_approved() and user_id = auth.uid())
  with check (public.is_approved() and user_id = auth.uid());

create policy answers_select on public.school_review_answers
  for select to authenticated using (public.is_approved());
create policy answers_write_own on public.school_review_answers
  for all to authenticated
  using (
    public.is_approved()
    and exists (select 1 from public.school_reviews r
                where r.id = review_id and r.user_id = auth.uid())
  )
  with check (
    public.is_approved()
    and exists (select 1 from public.school_reviews r
                where r.id = review_id and r.user_id = auth.uid())
  );


-- >>>>>>>>>> 0006_search_cache.sql <<<<<<<<<<

-- Migration 6 (T21): school search cache.
-- Requirements: R30, R31, R32, R33, R34  |  Acceptance: AC18-AC22
--
-- NOTE: storing Kakao local API responses in our own database is the open
-- question flagged in the PRD's Risks section. Confirm the terms before this
-- ships. If storage is restricted, this migration and R22/R30-R33 change.

create table if not exists public.school_search_cache (
  id         uuid primary key default gen_random_uuid(),
  -- R30: normalized query (trim, collapse inner whitespace, lowercase).
  query_key  text        not null unique,
  fetched_at timestamptz not null default now()
);

create table if not exists public.school_search_cache_items (
  id        uuid    primary key default gen_random_uuid(),
  cache_id  uuid    not null references public.school_search_cache (id) on delete cascade,
  school_id uuid    not null references public.schools (id) on delete cascade,
  -- R33: preserves the order Kakao returned.
  rank      integer not null,
  unique (cache_id, rank)
);

create index if not exists school_search_cache_items_order_idx
  on public.school_search_cache_items (cache_id, rank);

-- ------------------------------------------------------------------- RLS
-- R34 / AC22: read-only for user sessions. No insert/update/delete policy
-- exists, so RLS denies those writes for anon and authenticated. Only the
-- service-role client in app/api/schools/search/route.ts writes here.
alter table public.school_search_cache       enable row level security;
alter table public.school_search_cache_items enable row level security;

create policy search_cache_select on public.school_search_cache
  for select to authenticated using (public.is_approved());
create policy search_cache_items_select on public.school_search_cache_items
  for select to authenticated using (public.is_approved());


-- >>>>>>>>>> 0007_user_carbon_totals.sql <<<<<<<<<<

-- Migration 7 (T19): cumulative carbon saving per user.
-- Requirements: R17  |  Acceptance: AC10
--
-- Only `completed` posts count. A reserved post contributes nothing.
-- security_invoker so RLS on share_posts still applies; combined with the
-- share_posts select policy this means a user only ever sees rows they are
-- allowed to see. There is no leaderboard by design (Non-Goals).
create or replace view public.user_carbon_totals
with (security_invoker = true) as
select
  p.author_id                        as user_id,
  coalesce(sum(p.carbon_g), 0)::bigint as total_carbon_g,
  count(*)::bigint                   as completed_count
from public.share_posts p
where p.status = 'completed'
group by p.author_id;

comment on view public.user_carbon_totals is
  'R17: sum of carbon_g over the user''s completed share posts.';


-- >>>>>>>>>> 0009_carbon_integrity.sql <<<<<<<<<<

-- Migration 9: make the carbon ledger unforgeable.
-- Requirements: R16, R17, R4
--
-- Found by verification: share_posts_update's WITH CHECK is only
-- is_approved(), and guard_share_post_transition() protected carbon_g solely
-- against non-authors. So an author could PATCH /rest/v1/share_posts with their
-- own session token and set carbon_g to anything, which flows straight into
-- user_carbon_totals. The Server Action was correct; the database was not, and
-- R4's doctrine is that the database is the boundary.
--
-- R16 says the coefficient is a snapshot copied from item_types at write time.
-- So: the database derives it on insert, and nobody edits it afterwards.

create or replace function public.enforce_carbon_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  coefficient integer;
begin
  if tg_op = 'INSERT' then
    if new.item_type_id is null then
      raise exception '품목 유형을 선택해야 합니다'
        using errcode = 'check_violation';
    end if;

    select carbon_g into coefficient
    from public.item_types where id = new.item_type_id;

    if coefficient is null then
      raise exception '알 수 없는 품목 유형입니다'
        using errcode = 'check_violation';
    end if;

    -- Derived, never taken from the caller. (R16)
    new.carbon_g := coefficient;
    return new;
  end if;

  -- The snapshot is frozen. Changing the coefficient table must not rewrite
  -- past posts, and neither may the author. auth.uid() is null means the
  -- service role, which is left an operational escape hatch.
  if auth.uid() is not null then
    if new.carbon_g is distinct from old.carbon_g then
      raise exception '탄소 절감량은 작성 시점 값으로 고정됩니다'
        using errcode = 'check_violation';
    end if;
    if new.item_type_id is distinct from old.item_type_id then
      raise exception '품목 유형은 작성 후 변경할 수 없습니다'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

-- Runs before guard_share_post_transition (triggers fire in name order, and
-- "share_posts_carbon_*" sorts before "share_posts_transition").
drop trigger if exists share_posts_carbon_snapshot on public.share_posts;
create trigger share_posts_carbon_snapshot
  before insert or update on public.share_posts
  for each row execute function public.enforce_carbon_snapshot();

-- R17 / PRD: "탄소량은 본인만 본다." The Non-Goals rule out a leaderboard, but
-- security_invoker alone let any approved user read every user's total straight
-- from PostgREST, because share_posts is readable by all approved users.
-- Scope the view to the caller.
create or replace view public.user_carbon_totals
with (security_invoker = true) as
select
  p.author_id                          as user_id,
  coalesce(sum(p.carbon_g), 0)::bigint as total_carbon_g,
  count(*)::bigint                     as completed_count
from public.share_posts p
where p.status = 'completed'
  and p.author_id = auth.uid()
group by p.author_id;

comment on view public.user_carbon_totals is
  'R17: the caller''s own completed-post carbon total. Self only - there is no leaderboard. Returns no rows for the service role (auth.uid() is null).';


-- >>>>>>>>>> seed.sql (품목 유형 + 기본 평가 질문) <<<<<<<<<<

-- Reference data (T20). Safe to run more than once.
--
-- Carbon coefficients are placeholders chosen to be plausible, not measured.
-- Replace them with sourced figures before launch; see the report's Risks.

insert into public.item_types (label, carbon_g, sort_order) values
  ('책·교재',            1200,  1),
  ('학용품·문구',         300,  2),
  ('교구·실험도구',      2500,  3),
  ('보드게임·놀이도구',  3200,  4),
  ('의류·체육복',        6000,  5),
  ('가구·수납',         18000,  6),
  ('전자기기',          25000,  7),
  ('기타',                500, 99)
on conflict (label) do nothing;

insert into public.school_review_questions (text, sort_order) values
  ('동료 교사들과 협력하기 좋은 분위기인가요?', 1),
  ('업무 분장이 공정하게 이루어지나요?',       2),
  ('관리자와 소통이 원활한가요?',              3),
  ('수업에 집중할 수 있는 환경인가요?',        4),
  ('신규 교사가 적응하기 좋은 학교인가요?',    5)
on conflict do nothing;


-- >>>>>>>>>> 0010_categories_boards.sql <<<<<<<<<<

-- Migration 10: three-level share categories, the club/flash split, and the
-- general board (게시판).
--
-- 1. share_posts categories become 학교급 -> 대분류 -> 과목, and gain the
--    fields the write form now collects (활용팁, 물건상태).
-- 2. club_posts drops its category constraint (the club taxonomy is a later
--    piece of work) and gains `kind` so 소모임 and 번개모임 share one table.
-- 3. board_posts / board_post_images / board_comments: the same post +
--    comment shape as clubs, with no taxonomy at all.

-- ------------------------------------------------ share taxonomy (R6, R7)
-- 대분류 and 과목 are the same set at both school levels; the level stays a
-- separate axis. '공통' exists because 학급경영/학급자료 items are usually not
-- subject-specific and the subject is required.
create or replace function public.is_valid_share_category(
  category text,
  subject  text
) returns boolean
language sql
immutable
as $$
  select category in ('수업교구', '학급경영', '학급자료')
     and subject  in (
       '공통', '국어', '수학', '사회', '영어', '역사',
       '과학', '기술', '미술', '음악', '체육'
     );
$$;

comment on function public.is_valid_share_category(text, text) is
  'R7: 대분류/과목 pair for share_posts. Mirrored in src/lib/categories.ts.';

alter table public.share_posts
  drop constraint if exists share_posts_category_matches_level;

alter table public.share_posts
  add column if not exists subject     text,
  add column if not exists usage_tips  text not null default '',
  add column if not exists condition   text;

-- Old rows: elementary used 수업자료/학급자료, secondary used a subject name.
update public.share_posts
   set subject = case
         when category in ('국어','수학','사회','영어','역사',
                           '과학','기술','미술','음악','체육') then category
         else '공통'
       end,
       category = case
         when category = '학급자료' then '학급자료'
         else '수업교구'
       end
 where subject is null;

update public.share_posts set condition = '사용감 있음' where condition is null;

alter table public.share_posts
  alter column subject   set not null,
  alter column condition set not null;

alter table public.share_posts
  add constraint share_posts_category_valid
    check (public.is_valid_share_category(category, subject)),
  add constraint share_posts_condition_valid
    check (condition in ('미개봉/새것', '사용감 적음', '사용감 있음', '낡았지만 사용 가능'));

create index if not exists share_posts_subject_idx
  on public.share_posts (school_level, category, subject, created_at desc);

-- The transition guard lists every column a non-author must not touch, so the
-- three new ones have to be added or a stranger could rewrite them. (R12)
create or replace function public.guard_share_post_transition()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is not null and actor <> old.author_id then
    if new.title        is distinct from old.title
    or new.description  is distinct from old.description
    or new.usage_tips   is distinct from old.usage_tips
    or new.condition    is distinct from old.condition
    or new.school_level is distinct from old.school_level
    or new.category     is distinct from old.category
    or new.subject      is distinct from old.subject
    or new.item_type_id is distinct from old.item_type_id
    or new.carbon_g     is distinct from old.carbon_g
    or new.author_id    is distinct from old.author_id
    or new.completed_at is distinct from old.completed_at then
      raise exception '글쓴이만 이 글을 수정할 수 있습니다'
        using errcode = 'check_violation';
    end if;

    if not (
      (old.status = 'available' and new.status = 'reserved'  and new.reserved_by = actor)
      or (old.status = 'reserved'  and old.reserved_by = actor
          and new.status = 'available' and new.reserved_by is null)
    ) then
      raise exception '허용되지 않은 예약 변경입니다'
        using errcode = 'check_violation';
    end if;
  end if;

  if old.status = 'completed' and new.status <> 'completed' then
    raise exception '나눔완료 상태는 되돌릴 수 없습니다'
      using errcode = 'check_violation';
  end if;

  if old.status <> new.status
     and not (
       (old.status = 'available' and new.status = 'reserved')
       or (old.status = 'reserved' and new.status = 'available')
       or (old.status = 'reserved' and new.status = 'completed')
     ) then
    raise exception '허용되지 않은 상태 전이입니다: % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;

  if old.status = 'reserved' and new.status = 'reserved'
     and new.reserved_by is distinct from old.reserved_by then
    raise exception '이미 예약된 글입니다'
      using errcode = 'check_violation';
  end if;

  if new.status = 'reserved' and new.reserved_by = new.author_id then
    raise exception '자기 글은 예약할 수 없습니다'
      using errcode = 'check_violation';
  end if;

  if new.status = 'reserved' then
    if new.reserved_by is null then
      raise exception '예약자가 필요합니다' using errcode = 'check_violation';
    end if;
    if old.status <> 'reserved' then
      new.reserved_at := now();
    end if;
  elsif new.status = 'available' then
    new.reserved_by := null;
    new.reserved_at := null;
  elsif new.status = 'completed' and old.status <> 'completed' then
    new.completed_at := now();
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- ------------------------------------------- clubs: 소모임 + 번개모임
-- The club taxonomy is deliberately undecided, so the level/category pair is
-- no longer constrained and neither field is required.
alter table public.club_posts
  drop constraint if exists club_posts_category_matches_level;

alter table public.club_posts
  alter column category set default '',
  alter column school_level drop not null;

alter table public.club_posts
  add column if not exists kind text not null default 'club';

alter table public.club_posts
  drop constraint if exists club_posts_kind_valid;
alter table public.club_posts
  add constraint club_posts_kind_valid check (kind in ('club', 'flash'));

create index if not exists club_posts_kind_idx
  on public.club_posts (kind, created_at desc);

-- ------------------------------------------------------------ 게시판
create table if not exists public.board_posts (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid        not null references public.profiles (id) on delete cascade,
  title       text        not null check (length(btrim(title)) > 0),
  description text        not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists board_posts_created_idx
  on public.board_posts (created_at desc);

create table if not exists public.board_post_images (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid    not null references public.board_posts (id) on delete cascade,
  storage_path text    not null,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists board_post_images_post_idx
  on public.board_post_images (post_id, sort_order);

create table if not exists public.board_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.board_posts (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (length(btrim(body)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists board_comments_post_idx
  on public.board_comments (post_id, created_at);

drop trigger if exists board_post_images_limit on public.board_post_images;
create trigger board_post_images_limit
  before insert on public.board_post_images
  for each row execute function public.enforce_post_image_limit('2');

drop trigger if exists board_posts_touch on public.board_posts;
create trigger board_posts_touch
  before update on public.board_posts
  for each row execute function public.touch_updated_at();

alter table public.board_posts       enable row level security;
alter table public.board_post_images enable row level security;
alter table public.board_comments    enable row level security;

drop policy if exists board_posts_select on public.board_posts;
create policy board_posts_select on public.board_posts
  for select to authenticated using (public.is_approved());
drop policy if exists board_posts_insert on public.board_posts;
create policy board_posts_insert on public.board_posts
  for insert to authenticated
  with check (public.is_approved() and author_id = auth.uid());
drop policy if exists board_posts_update on public.board_posts;
create policy board_posts_update on public.board_posts
  for update to authenticated
  using (public.is_approved() and author_id = auth.uid())
  with check (public.is_approved() and author_id = auth.uid());
drop policy if exists board_posts_delete on public.board_posts;
create policy board_posts_delete on public.board_posts
  for delete to authenticated
  using (public.is_approved() and author_id = auth.uid());

drop policy if exists board_post_images_select on public.board_post_images;
create policy board_post_images_select on public.board_post_images
  for select to authenticated using (public.is_approved());
drop policy if exists board_post_images_write on public.board_post_images;
create policy board_post_images_write on public.board_post_images
  for insert to authenticated
  with check (
    public.is_approved()
    and exists (select 1 from public.board_posts p
                where p.id = post_id and p.author_id = auth.uid())
  );
drop policy if exists board_post_images_delete on public.board_post_images;
create policy board_post_images_delete on public.board_post_images
  for delete to authenticated
  using (
    public.is_approved()
    and exists (select 1 from public.board_posts p
                where p.id = post_id and p.author_id = auth.uid())
  );

drop policy if exists board_comments_select on public.board_comments;
create policy board_comments_select on public.board_comments
  for select to authenticated using (public.is_approved());
drop policy if exists board_comments_insert on public.board_comments;
create policy board_comments_insert on public.board_comments
  for insert to authenticated
  with check (public.is_approved() and author_id = auth.uid());
drop policy if exists board_comments_delete on public.board_comments;
create policy board_comments_delete on public.board_comments
  for delete to authenticated
  using (public.is_approved() and author_id = auth.uid());

-- ------------------------------------------------- board image bucket
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not present - skipping bucket setup';
    return;
  end if;

  insert into storage.buckets (id, name, public)
  values ('board-images', 'board-images', false)
  on conflict (id) do nothing;

  -- Recreated rather than added to, because the bucket list is baked into
  -- each policy body. (migration 8)
  drop policy if exists post_images_read   on storage.objects;
  drop policy if exists post_images_insert on storage.objects;
  drop policy if exists post_images_delete on storage.objects;

  execute $p$
    create policy post_images_read on storage.objects
      for select to authenticated
      using (bucket_id in ('share-images','club-images','board-images')
             and public.is_approved())
  $p$;

  execute $p$
    create policy post_images_insert on storage.objects
      for insert to authenticated
      with check (
        bucket_id in ('share-images','club-images','board-images')
        and public.is_approved()
        and (storage.foldername(name))[1] = auth.uid()::text
      )
  $p$;

  execute $p$
    create policy post_images_delete on storage.objects
      for delete to authenticated
      using (
        bucket_id in ('share-images','club-images','board-images')
        and public.is_approved()
        and (storage.foldername(name))[1] = auth.uid()::text
      )
  $p$;
end
$$;


-- >>>>>>>>>> 0011_review_scope_and_reserved_comments.sql <<<<<<<<<<

-- Migration 11: two rule changes, both enforced in the database.
--
-- 1. R24 change: a teacher may only rate the school they belong to. The old
--    policy checked user_id and nothing else, so any approved user could POST
--    a review for any school id.
-- 2. R15 change: a reserved post is no longer comment-silent. The reservation
--    opens a private thread between the reserver and the author instead.

-- ------------------------------------------------- own-school reviews (R24)
-- security definer so the lookup is not itself subject to the profiles policy.
create or replace function public.my_school_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select school_id from public.profiles where id = auth.uid();
$$;

revoke all on function public.my_school_id() from public;
grant execute on function public.my_school_id() to authenticated;

comment on function public.my_school_id() is
  'R24: the caller''s own school. Null when they have not set one.';

drop policy if exists reviews_write_own on public.school_reviews;
create policy reviews_write_own on public.school_reviews
  for all to authenticated
  using (
    public.is_approved()
    and user_id = auth.uid()
    and school_id = public.my_school_id()
  )
  with check (
    public.is_approved()
    and user_id = auth.uid()
    -- null school_id would make this null rather than false, so be explicit.
    and public.my_school_id() is not null
    and school_id = public.my_school_id()
  );

-- The answers policy hangs off the review row, so it inherits the school
-- check; restated here so a stale review row cannot be used as a side door.
drop policy if exists answers_write_own on public.school_review_answers;
create policy answers_write_own on public.school_review_answers
  for all to authenticated
  using (
    public.is_approved()
    and exists (
      select 1 from public.school_reviews r
      where r.id = review_id
        and r.user_id = auth.uid()
        and r.school_id = public.my_school_id()
    )
  )
  with check (
    public.is_approved()
    and exists (
      select 1 from public.school_reviews r
      where r.id = review_id
        and r.user_id = auth.uid()
        and r.school_id = public.my_school_id()
    )
  );

-- ------------------------------------- reserved posts: private thread (R15)
-- Was: nobody may comment while reserved. Now: only the two people the
-- reservation actually concerns. Once it is released or completed the thread
-- opens back up to everyone, and existing comments are never touched.
create or replace function public.block_comment_while_reserved()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  post_status   text;
  post_author   uuid;
  post_reserver uuid;
begin
  select status, author_id, reserved_by
    into post_status, post_author, post_reserver
  from public.share_posts where id = new.post_id;

  if post_status = 'reserved'
     and new.author_id is distinct from post_reserver
     and new.author_id is distinct from post_author then
    raise exception '예약중에는 예약한 선생님과 글쓴이만 댓글을 쓸 수 있습니다'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists share_comments_block_reserved on public.share_comments;
create trigger share_comments_block_reserved
  before insert on public.share_comments
  for each row execute function public.block_comment_while_reserved();


-- >>>>>>>>>> 0012_admin_delete.sql <<<<<<<<<<

-- Migration 12: administrators may delete any post.
--
-- Until now every delete policy was author-only, so moderation was impossible
-- without the service role. Deleting the post row is enough for its images and
-- comments (both cascade), but the stored objects live in Storage and are
-- keyed by the uploader's folder, so that policy has to widen too — otherwise
-- an admin removes the post and leaves the photos orphaned in the bucket.
--
-- Only DELETE is widened. An admin still cannot edit someone else's post: the
-- update policies and guard_share_post_transition() are untouched.

drop policy if exists share_posts_delete on public.share_posts;
create policy share_posts_delete on public.share_posts
  for delete to authenticated
  using (
    public.is_approved()
    and (author_id = auth.uid() or public.is_admin())
  );

drop policy if exists club_posts_delete on public.club_posts;
create policy club_posts_delete on public.club_posts
  for delete to authenticated
  using (
    public.is_approved()
    and (author_id = auth.uid() or public.is_admin())
  );

drop policy if exists board_posts_delete on public.board_posts;
create policy board_posts_delete on public.board_posts
  for delete to authenticated
  using (
    public.is_approved()
    and (author_id = auth.uid() or public.is_admin())
  );

-- ----------------------------------------------------- storage objects
-- Same three buckets as migration 10, plus the admin escape hatch.
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not present - skipping';
    return;
  end if;

  drop policy if exists post_images_delete on storage.objects;

  execute $p$
    create policy post_images_delete on storage.objects
      for delete to authenticated
      using (
        bucket_id in ('share-images','club-images','board-images')
        and public.is_approved()
        and (
          (storage.foldername(name))[1] = auth.uid()::text
          or public.is_admin()
        )
      )
  $p$;
end
$$;


-- >>>>>>>>>> 0013_comments_require_reservation.sql <<<<<<<<<<

-- Migration 13: commenting on a share post is earned by reserving it.
--
-- R15 rewritten again. The rule is now:
--
--   available  나눔중    아무도 댓글을 쓸 수 없다. 예약이 곧 문의 자격이다.
--   reserved   예약중    예약자와 글쓴이만.
--   completed  나눔완료  예약자와 글쓴이만. 거래 당사자끼리 마무리할 수 있게.
--
-- 예약이 취소되면 status 가 available 로 돌아가므로 잠금도 함께 풀리고,
-- 다음 사람이 예약해서 다시 문의할 수 있다. 이미 달린 댓글은 어느 경우에도
-- 지워지지 않는다.
--
-- reserved_by survives the move to completed (guard_share_post_transition only
-- stamps completed_at), so the finished thread keeps both of its participants.

create or replace function public.block_comment_while_reserved()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  post_status   text;
  post_author   uuid;
  post_reserver uuid;
begin
  select status, author_id, reserved_by
    into post_status, post_author, post_reserver
  from public.share_posts where id = new.post_id;

  if post_status is null then
    raise exception '글을 찾을 수 없습니다' using errcode = 'check_violation';
  end if;

  -- Nobody talks on an unreserved item, not even its owner. The owner has the
  -- post body for anything they want to say up front.
  if post_status = 'available' then
    raise exception '예약한 뒤에야 댓글을 쓸 수 있습니다'
      using errcode = 'check_violation';
  end if;

  if new.author_id is distinct from post_reserver
     and new.author_id is distinct from post_author then
    raise exception '예약한 선생님과 글쓴이만 댓글을 쓸 수 있습니다'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists share_comments_block_reserved on public.share_comments;
create trigger share_comments_block_reserved
  before insert on public.share_comments
  for each row execute function public.block_comment_while_reserved();


-- >>>>>>>>>> 0014_taxonomy_rework.sql <<<<<<<<<<

-- Migration 14: 나눔 분류 체계 개편.
--
--   학교급   초등 / 중등
--   카테고리 학급경영 / 수업교구 / 교사용품      ('학급자료' 는 없어진다)
--   세부     초등 + 수업교구 -> 학년군 (1-2 / 3-4 / 5-6)
--            중등 + 수업교구 -> 교과목
--            그 외           -> 없음
--   품목유형 카테고리별로 다른 목록
--
-- 탄소 계수는 새로 지어내지 않는다. 새 품목은 기존 8종(재질·무게 기반)의
-- 값을 그대로 물려받는다. 마이그레이션 9 가 글의 carbon_g 를 작성 시점 값으로
-- 동결하므로 이미 올라간 글의 절감량은 이 작업으로 바뀌지 않는다.

-- ------------------------------------------------- item_types 에 카테고리
alter table public.item_types
  add column if not exists category text;

alter table public.item_types
  drop constraint if exists item_types_category_valid;
alter table public.item_types
  add constraint item_types_category_valid
    check (category is null or category in ('학급경영', '수업교구', '교사용품'));

-- 기존 8종은 재질 기준이라 새 드롭다운에는 내보내지 않는다. 지난 글들이
-- 여전히 참조하므로 행 자체는 남긴다.
update public.item_types set is_active = false where category is null;

-- 새 목록. carbon_g 는 기존 8종에서 가져온 값이다.
--   책·교재 1200 / 학용품·문구 300 / 교구·실험도구 2500
--   보드게임·놀이도구 3200 / 의류·체육복 6000 / 가구·수납 18000
--   전자기기 25000 / 기타 500
insert into public.item_types (label, carbon_g, sort_order, category) values
  -- 학급경영
  ('상장·스티커·보상용품',   300, 11, '학급경영'),
  ('게시판·환경 꾸미기',     300, 12, '학급경영'),
  ('정리함·수납용품',      18000, 13, '학급경영'),
  ('청소·위생용품',          500, 14, '학급경영'),
  ('학급문고 도서',         1200, 15, '학급경영'),
  ('기타 학급용품',          500, 19, '학급경영'),
  -- 수업교구
  ('실험·관찰 도구',        2500, 21, '수업교구'),
  ('조작 교구·모형',        2500, 22, '수업교구'),
  ('보드게임·놀이 교구',    3200, 23, '수업교구'),
  ('체육 용품',             2500, 24, '수업교구'),
  ('악기·음악 교구',        2500, 25, '수업교구'),
  ('미술 재료·도구',         300, 26, '수업교구'),
  ('교과서·문제집·교재',    1200, 27, '수업교구'),
  ('디지털 교구·전자기기',  25000, 28, '수업교구'),
  ('기타 수업 교구',         500, 29, '수업교구'),
  -- 교사용품
  ('교사용 도서·지도서',    1200, 31, '교사용품'),
  ('사무용품·문구',          300, 32, '교사용품'),
  ('전자기기·주변기기',    25000, 33, '교사용품'),
  ('가구·의자·수납',       18000, 34, '교사용품'),
  ('의류·체육복',           6000, 35, '교사용품'),
  ('기타 교사용품',          500, 39, '교사용품')
on conflict (label) do update
  set category   = excluded.category,
      sort_order = excluded.sort_order,
      is_active  = true;

-- ------------------------------------------------------- share_posts 분류
alter table public.share_posts
  add column if not exists grade_band text;

-- 마이그레이션 10 에서 subject 는 필수였다. 이제 중등 수업교구에서만 쓰이므로
-- 비어 있을 수 있어야 한다.
alter table public.share_posts alter column subject drop not null;

-- 이전 분류에서 옮긴다. '학급자료' 는 실제 사용된 적이 없다.
update public.share_posts set category = '학급경영' where category = '학급자료';

-- 학급경영/교사용품 글에는 세부 항목이 없다. 예전의 '공통' 을 지운다.
update public.share_posts
   set subject = null
 where category <> '수업교구' or school_level = 'elementary';

-- 초등 수업교구 글은 학년군이 필요한데 예전 데이터에는 그 정보가 없다.
-- 가운데 값을 넣어 두고, 글쓴이가 수정 화면에서 고칠 수 있다.
update public.share_posts
   set grade_band = '3-4학년'
 where school_level = 'elementary' and category = '수업교구' and grade_band is null;

create or replace function public.is_valid_share_taxonomy(
  level      text,
  category   text,
  subject    text,
  grade_band text
) returns boolean
language sql
immutable
as $$
  -- coalesce 가 없으면 grade_band 가 NULL 일 때 식 전체가 NULL 이 되고,
  -- CHECK 제약은 NULL 을 통과시킨다. 즉 필수 항목이 필수가 아니게 된다.
  select coalesce(
    level in ('elementary', 'secondary')
    and category in ('학급경영', '수업교구', '교사용품')
    and case
      -- 초등 수업교구: 학년군만
      when level = 'elementary' and category = '수업교구' then
        grade_band is not null
        and grade_band in ('1-2학년', '3-4학년', '5-6학년')
        and subject is null
      -- 중등 수업교구: 교과목만
      when level = 'secondary' and category = '수업교구' then
        subject is not null
        and subject in ('공통', '국어', '수학', '사회', '영어', '역사',
                        '과학', '기술', '미술', '음악', '체육')
        and grade_band is null
      -- 학급경영 / 교사용품: 세부 항목 없음
      else subject is null and grade_band is null
    end,
    false
  );
$$;

comment on function public.is_valid_share_taxonomy(text, text, text, text) is
  '분류 규칙. src/lib/categories.ts 와 함께 고쳐야 한다.';

alter table public.share_posts drop constraint if exists share_posts_category_valid;
alter table public.share_posts
  add constraint share_posts_taxonomy_valid
    check (public.is_valid_share_taxonomy(school_level, category, subject, grade_band));

drop index if exists share_posts_subject_idx;
create index if not exists share_posts_taxonomy_idx
  on public.share_posts (school_level, category, subject, grade_band, created_at desc);

-- 비어 있던 예전 함수는 더 이상 쓰이지 않는다.
drop function if exists public.is_valid_share_category(text, text);

-- 비작성자가 손댈 수 없는 칼럼 목록에 grade_band 를 더한다. (R12)
create or replace function public.guard_share_post_transition()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is not null and actor <> old.author_id then
    if new.title        is distinct from old.title
    or new.description  is distinct from old.description
    or new.usage_tips   is distinct from old.usage_tips
    or new.condition    is distinct from old.condition
    or new.school_level is distinct from old.school_level
    or new.category     is distinct from old.category
    or new.subject      is distinct from old.subject
    or new.grade_band   is distinct from old.grade_band
    or new.item_type_id is distinct from old.item_type_id
    or new.carbon_g     is distinct from old.carbon_g
    or new.author_id    is distinct from old.author_id
    or new.completed_at is distinct from old.completed_at then
      raise exception '글쓴이만 이 글을 수정할 수 있습니다'
        using errcode = 'check_violation';
    end if;

    if not (
      (old.status = 'available' and new.status = 'reserved'  and new.reserved_by = actor)
      or (old.status = 'reserved'  and old.reserved_by = actor
          and new.status = 'available' and new.reserved_by is null)
    ) then
      raise exception '허용되지 않은 예약 변경입니다'
        using errcode = 'check_violation';
    end if;
  end if;

  if old.status = 'completed' and new.status <> 'completed' then
    raise exception '나눔완료 상태는 되돌릴 수 없습니다'
      using errcode = 'check_violation';
  end if;

  if old.status <> new.status
     and not (
       (old.status = 'available' and new.status = 'reserved')
       or (old.status = 'reserved' and new.status = 'available')
       or (old.status = 'reserved' and new.status = 'completed')
     ) then
    raise exception '허용되지 않은 상태 전이입니다: % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;

  if old.status = 'reserved' and new.status = 'reserved'
     and new.reserved_by is distinct from old.reserved_by then
    raise exception '이미 예약된 글입니다'
      using errcode = 'check_violation';
  end if;

  if new.status = 'reserved' and new.reserved_by = new.author_id then
    raise exception '자기 글은 예약할 수 없습니다'
      using errcode = 'check_violation';
  end if;

  if new.status = 'reserved' then
    if new.reserved_by is null then
      raise exception '예약자가 필요합니다' using errcode = 'check_violation';
    end if;
    if old.status <> 'reserved' then
      new.reserved_at := now();
    end if;
  elsif new.status = 'available' then
    new.reserved_by := null;
    new.reserved_at := null;
  elsif new.status = 'completed' and old.status <> 'completed' then
    new.completed_at := now();
  end if;

  new.updated_at := now();
  return new;
end;
$$;


-- >>>>>>>>>> 0015_curriculum_standards.sql <<<<<<<<<<

-- Migration 15: 나눔글에 단원과 성취기준을 붙인다.
--
-- 중등 + 수업교구 를 고른 뒤 교과목까지 고르면 단원 하나와 성취기준 여러 개를
-- 고를 수 있다. 고른 결과만 여기에 저장한다.
--
-- 성취기준 목록 자체는 데이터베이스에 두지 않는다.
-- src/lib/curriculum/secondaryInformatics.ts 에 있다. 교육과정 문서에서 온
-- 고정 자료여서 사용자가 고치는 값이 아니고, 개정되면 파일만 갈아끼운다.
--
-- 그래서 여기서 보증할 수 있는 것은 "어떤 조합에서 값이 있을 수 있는가"와
-- "모양과 개수가 말이 되는가"까지다. 고른 코드가 그 단원에 실제로 있는
-- 코드인지는 앱(standardsAreInUnit)이 막는다. 목록을 파일에 두기로 한 대가다.

-- 이 기능의 대상 교과인 '정보' 가 마이그레이션 14 의 과목 목록에 빠져 있었다.
-- 목록을 다시 정의한다. (src/lib/categories.ts 의 SUBJECTS 와 같이 고칠 것)
create or replace function public.is_valid_share_taxonomy(
  level      text,
  category   text,
  subject    text,
  grade_band text
) returns boolean
language sql
immutable
as $$
  select coalesce(
    level in ('elementary', 'secondary')
    and category in ('학급경영', '수업교구', '교사용품')
    and case
      when level = 'elementary' and category = '수업교구' then
        grade_band is not null
        and grade_band in ('1-2학년', '3-4학년', '5-6학년')
        and subject is null
      when level = 'secondary' and category = '수업교구' then
        subject is not null
        and subject in ('공통', '국어', '수학', '사회', '영어', '역사',
                        '과학', '기술', '정보', '미술', '음악', '체육')
        and grade_band is null
      else subject is null and grade_band is null
    end,
    false
  );
$$;

alter table public.share_posts
  add column if not exists unit      text,
  add column if not exists standards text[] not null default '{}';

create or replace function public.is_valid_share_curriculum(
  level     text,
  category  text,
  unit      text,
  standards text[]
) returns boolean
language sql
immutable
as $$
  select coalesce(
    case
      -- 단원과 성취기준은 중등 수업교구에서만 붙는다.
      when level = 'secondary' and category = '수업교구' then
        (unit is null or length(btrim(unit)) > 0)
        -- 성취기준은 단원에 속한다. 단원 없이 성취기준만 있을 수 없다.
        and (unit is not null or coalesce(cardinality(standards), 0) = 0)
        and coalesce(cardinality(standards), 0) <= 12
        -- 빈 문자열이나 지나치게 긴 값이 섞이지 않게.
        and not exists (
          select 1 from unnest(standards) as s
          where length(btrim(s)) = 0 or length(s) > 32
        )
        -- 같은 성취기준을 두 번 담지 않는다.
        and coalesce(cardinality(standards), 0)
            = (select count(distinct s) from unnest(standards) as s)
      else
        unit is null and coalesce(cardinality(standards), 0) = 0
    end,
    false
  );
$$;

comment on function public.is_valid_share_curriculum(text, text, text, text[]) is
  '단원/성취기준이 붙을 수 있는 조합과 모양. 목록 자체는 src/lib/curriculum 에 있다.';

alter table public.share_posts drop constraint if exists share_posts_curriculum_valid;
alter table public.share_posts
  add constraint share_posts_curriculum_valid
    check (public.is_valid_share_curriculum(school_level, category, unit, standards));

create index if not exists share_posts_unit_idx
  on public.share_posts (school_level, category, subject, unit);

-- 비작성자가 손댈 수 없는 칼럼 목록에 unit, standards 를 더한다. (R12)
create or replace function public.guard_share_post_transition()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is not null and actor <> old.author_id then
    if new.title        is distinct from old.title
    or new.description  is distinct from old.description
    or new.usage_tips   is distinct from old.usage_tips
    or new.condition    is distinct from old.condition
    or new.school_level is distinct from old.school_level
    or new.category     is distinct from old.category
    or new.subject      is distinct from old.subject
    or new.grade_band   is distinct from old.grade_band
    or new.unit         is distinct from old.unit
    or new.standards    is distinct from old.standards
    or new.item_type_id is distinct from old.item_type_id
    or new.carbon_g     is distinct from old.carbon_g
    or new.author_id    is distinct from old.author_id
    or new.completed_at is distinct from old.completed_at then
      raise exception '글쓴이만 이 글을 수정할 수 있습니다'
        using errcode = 'check_violation';
    end if;

    if not (
      (old.status = 'available' and new.status = 'reserved'  and new.reserved_by = actor)
      or (old.status = 'reserved'  and old.reserved_by = actor
          and new.status = 'available' and new.reserved_by is null)
    ) then
      raise exception '허용되지 않은 예약 변경입니다'
        using errcode = 'check_violation';
    end if;
  end if;

  if old.status = 'completed' and new.status <> 'completed' then
    raise exception '나눔완료 상태는 되돌릴 수 없습니다'
      using errcode = 'check_violation';
  end if;

  if old.status <> new.status
     and not (
       (old.status = 'available' and new.status = 'reserved')
       or (old.status = 'reserved' and new.status = 'available')
       or (old.status = 'reserved' and new.status = 'completed')
     ) then
    raise exception '허용되지 않은 상태 전이입니다: % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;

  if old.status = 'reserved' and new.status = 'reserved'
     and new.reserved_by is distinct from old.reserved_by then
    raise exception '이미 예약된 글입니다'
      using errcode = 'check_violation';
  end if;

  if new.status = 'reserved' and new.reserved_by = new.author_id then
    raise exception '자기 글은 예약할 수 없습니다'
      using errcode = 'check_violation';
  end if;

  if new.status = 'reserved' then
    if new.reserved_by is null then
      raise exception '예약자가 필요합니다' using errcode = 'check_violation';
    end if;
    if old.status <> 'reserved' then
      new.reserved_at := now();
    end if;
  elsif new.status = 'available' then
    new.reserved_by := null;
    new.reserved_at := null;
  elsif new.status = 'completed' and old.status <> 'completed' then
    new.completed_at := now();
  end if;

  new.updated_at := now();
  return new;
end;
$$;


-- >>>>>>>>>> 0016_board_categories.sql <<<<<<<<<<

-- Migration 16: 게시판 글에 카테고리 두 축을 붙인다.
--
--   경력 단계  신규적응 / 저경력 / 중견 / 은퇴준비 / 자유
--   주제       수업 / 업무 / 인간관계 / 진로 / 잡담
--
-- 두 축은 서로 독립이고 둘 다 필수다. 글을 쓸 때 제목보다 먼저 고르고,
-- 읽는 사람은 이 둘로 목록을 걸러 본다.

alter table public.board_posts
  add column if not exists career_stage text,
  add column if not exists topic        text;

-- 지금 board_posts 는 비어 있어 아무 행도 건드리지 않는다. 데이터가 있는
-- 환경에서 실행되더라도 NOT NULL 로 넘어갈 수 있도록 남겨 둔다.
update public.board_posts set career_stage = '자유' where career_stage is null;
update public.board_posts set topic        = '잡담' where topic is null;

alter table public.board_posts
  alter column career_stage set not null,
  alter column topic        set not null;

alter table public.board_posts drop constraint if exists board_posts_career_stage_valid;
alter table public.board_posts
  add constraint board_posts_career_stage_valid
    check (career_stage in ('신규적응', '저경력', '중견', '은퇴준비', '자유'));

alter table public.board_posts drop constraint if exists board_posts_topic_valid;
alter table public.board_posts
  add constraint board_posts_topic_valid
    check (topic in ('수업', '업무', '인간관계', '진로', '잡담'));

-- 목록은 두 축으로 걸러 최신순으로 본다.
create index if not exists board_posts_index_idx
  on public.board_posts (career_stage, topic, created_at desc);


-- >>>>>>>>>> 0017_flash_meeting_time.sql <<<<<<<<<<

-- Migration 17: 번개모임에 만나는 날짜와 시간을 붙인다.
--
-- 번개모임은 언제 만나는지가 글의 핵심이라 필수로 둔다. 소모임은 정해진
-- 일시가 없는 모임이라 이 칸을 쓰지 않는다.
--
-- 목록 위 달력이 이 값을 읽어 스케줄처럼 보여준다.

alter table public.club_posts
  add column if not exists meet_at timestamptz;

-- 이미 올라온 번개모임 1건("9월 1일 오전 7시 노량진 맥모닝 드실 분")은
-- 제목에 적힌 시각을 그대로 옮긴다. 연도는 글이 쓰인 2026년으로 본다.
-- 글쓴이가 수정 화면에서 고칠 수 있다.
update public.club_posts
   set meet_at = timestamptz '2026-09-01 07:00+09'
 where kind = 'flash' and meet_at is null;

alter table public.club_posts drop constraint if exists club_posts_meet_at_valid;
alter table public.club_posts
  add constraint club_posts_meet_at_valid
    check (
      case
        when kind = 'flash' then meet_at is not null
        else meet_at is null
      end
    );

-- 달력은 한 달치를 meet_at 범위로 훑는다.
create index if not exists club_posts_meet_at_idx
  on public.club_posts (kind, meet_at);
