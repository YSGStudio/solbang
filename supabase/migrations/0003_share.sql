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
