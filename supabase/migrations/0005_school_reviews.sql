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
