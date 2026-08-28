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
