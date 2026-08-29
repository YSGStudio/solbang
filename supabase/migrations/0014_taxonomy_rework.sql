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
