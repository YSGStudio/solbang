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
