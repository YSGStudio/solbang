-- 이미 apply-all.sql(0001~0009)을 실행한 프로젝트에 이 파일만 추가로 Run 하세요.
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 Run.
--
-- 적용 전에는 배포된 앱이 동작하지 않습니다: 앱이 share_posts.subject /
-- usage_tips / condition, club_posts.kind, board_* 테이블을 참조합니다.

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
