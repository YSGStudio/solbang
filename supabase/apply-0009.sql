-- 이미 apply-all.sql(구버전)을 실행한 경우 이 파일만 추가로 Run 하세요.
-- 아직 실행 전이라면 새 apply-all.sql 에 이미 포함되어 있으니 불필요합니다.

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
