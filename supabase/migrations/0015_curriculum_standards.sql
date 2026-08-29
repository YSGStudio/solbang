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
