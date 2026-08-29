-- Constraint and RLS test suite. Run via ./scripts/db-test.sh
-- Covers AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10, AC11, AC13, AC14, AC15,
-- AC16, AC17, AC22 at the database level.
--
-- Every check either prints PASS or aborts the script.

\set ON_ERROR_STOP on
\timing off

create schema if not exists tests;

-- Runs `sql` and fails the suite unless it raises. Used for every rule that is
-- supposed to be enforced by the database rather than by a form.
create or replace function tests.expect_error(stmt text, label text)
returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice 'PASS  % -- rejected: %', label, sqlerrm;
    return;
  end;
  raise exception 'FAIL  % -- statement succeeded but should have been rejected', label;
end;
$$;

-- RLS denies an UPDATE/DELETE with no matching policy by matching zero rows
-- rather than by raising. That is still a denial, so assert on the row count.
create or replace function tests.expect_denied_write(stmt text, label text)
returns void language plpgsql as $$
declare
  affected int;
begin
  begin
    execute stmt;
    get diagnostics affected = row_count;
  exception when others then
    raise notice 'PASS  % -- rejected: %', label, sqlerrm;
    return;
  end;
  if affected <> 0 then
    raise exception 'FAIL  % -- % row(s) were written', label, affected;
  end if;
  raise notice 'PASS  % -- 0 rows written (no policy matched)', label;
end;
$$;

create or replace function tests.expect_ok(stmt text, label text)
returns void language plpgsql as $$
begin
  execute stmt;
  raise notice 'PASS  %', label;
end;
$$;

create or replace function tests.assert_eq(actual anyelement, expected anyelement, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL  % -- expected %, got %', label, expected, actual;
  end if;
  raise notice 'PASS  % (= %)', label, actual;
end;
$$;

grant usage on schema tests to anon, authenticated, service_role;
grant execute on all functions in schema tests to anon, authenticated, service_role;

-- ============================================================== fixtures
\echo ''
\echo '--- fixtures ---'

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a0', 'admin@example.com',
   '{"full_name":"관리자","nickname":"admin"}'),
  ('00000000-0000-0000-0000-0000000000a1', 'teacher.a@example.com',
   '{"full_name":"교사A","nickname":"teacherA"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'teacher.b@example.com',
   '{"full_name":"교사B","nickname":"teacherB"}'),
  ('00000000-0000-0000-0000-0000000000a3', 'teacher.c@example.com',
   '{"full_name":"교사C","nickname":"teacherC"}'),
  ('00000000-0000-0000-0000-0000000000a9', 'pending@example.com',
   '{"full_name":"미승인","nickname":"pendingTeacher"}');

-- AC1 at the database level: the signup trigger lands everyone on pending.
select tests.assert_eq(
  (select count(*) from public.profiles where status = 'pending')::int, 5,
  'AC1  every new profile starts pending');

update public.profiles set role = 'admin', status = 'approved'
  where id = '00000000-0000-0000-0000-0000000000a0';
update public.profiles set status = 'approved'
  where id in ('00000000-0000-0000-0000-0000000000a1',
               '00000000-0000-0000-0000-0000000000a2',
               '00000000-0000-0000-0000-0000000000a3');

insert into public.schools (id, kakao_place_id, name, address, lat, lng) values
  ('00000000-0000-0000-0000-0000000000c1', 'kakao-1', '언남초등학교', '용인시 기흥구', 37.27, 127.11),
  ('00000000-0000-0000-0000-0000000000c2', 'kakao-2', '남의초등학교', '수원시 영통구', 37.25, 127.07);

-- Migration 11 (R24): reviewing is scoped to your own school, so the teachers
-- need one. All three belong to c1; nobody belongs to c2.
update public.profiles set school_id = '00000000-0000-0000-0000-0000000000c1'
  where id in ('00000000-0000-0000-0000-0000000000a1',
               '00000000-0000-0000-0000-0000000000a2',
               '00000000-0000-0000-0000-0000000000a3');

insert into public.item_types (id, label, carbon_g) values
  ('00000000-0000-0000-0000-0000000000d1', '교구', 500),
  ('00000000-0000-0000-0000-0000000000d2', '도서', 120);

insert into public.school_review_questions (id, text, sort_order) values
  ('00000000-0000-0000-0000-0000000000e1', '동료 교사 분위기는 어떤가요?', 1),
  ('00000000-0000-0000-0000-0000000000e2', '업무 강도는 어떤가요?', 2);

-- ================================================== AC4  category pairing
\echo ''
\echo '--- AC4  school level / category pairing (R6, R7) ---'

-- item_type_id is supplied so the failure can only come from the taxonomy
-- CHECK, not from migration 9's item-type guard.
-- 마이그레이션 14: 학교급 x 카테고리 x (학년군 | 교과목).
select tests.expect_error($$
  insert into public.share_posts (author_id, title, school_level, category, condition, item_type_id)
  values ('00000000-0000-0000-0000-0000000000a1', '없어진 분류', 'elementary', '학급자료',
          '사용감 있음', '00000000-0000-0000-0000-0000000000d1')
$$, 'AC4  없어진 카테고리(학급자료)는 거부된다');

select tests.expect_error($$
  insert into public.share_posts (author_id, title, school_level, category, condition, item_type_id)
  values ('00000000-0000-0000-0000-0000000000a1', '학년군 없음', 'elementary', '수업교구',
          '사용감 있음', '00000000-0000-0000-0000-0000000000d1')
$$, 'AC4  초등 수업교구인데 학년군이 없으면 거부된다');

select tests.expect_error($$
  insert into public.share_posts (author_id, title, school_level, category, subject, condition, item_type_id)
  values ('00000000-0000-0000-0000-0000000000a1', '초등에 교과목', 'elementary', '수업교구', '과학',
          '사용감 있음', '00000000-0000-0000-0000-0000000000d1')
$$, 'AC4  초등 수업교구에 교과목을 넣으면 거부된다');

select tests.expect_error($$
  insert into public.share_posts (author_id, title, school_level, category, grade_band, condition, item_type_id)
  values ('00000000-0000-0000-0000-0000000000a1', '중등에 학년군', 'secondary', '수업교구', '3-4학년',
          '사용감 있음', '00000000-0000-0000-0000-0000000000d1')
$$, 'AC4  중등 수업교구에 학년군을 넣으면 거부된다');

select tests.expect_error($$
  insert into public.share_posts (author_id, title, school_level, category, grade_band, condition, item_type_id)
  values ('00000000-0000-0000-0000-0000000000a1', '학급경영에 학년군', 'elementary', '학급경영', '1-2학년',
          '사용감 있음', '00000000-0000-0000-0000-0000000000d1')
$$, 'AC4  학급경영에 세부 항목을 넣으면 거부된다');

select tests.expect_ok($$
  insert into public.share_posts (id, author_id, title, school_level, category, grade_band, condition, item_type_id, carbon_g)
  values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1',
          '예약 흐름용 글', 'elementary', '수업교구', '3-4학년', '사용감 있음',
          '00000000-0000-0000-0000-0000000000d1', 500)
$$, 'AC4  초등 + 수업교구 + 학년군 is accepted');

select tests.expect_ok($$
  insert into public.share_posts (author_id, title, school_level, category, subject, condition, item_type_id)
  values ('00000000-0000-0000-0000-0000000000a1', '중등 과학 교구', 'secondary', '수업교구', '과학',
          '미개봉/새것', '00000000-0000-0000-0000-0000000000d2')
$$, 'AC4  중등 + 수업교구 + 교과목 is accepted');

select tests.expect_ok($$
  insert into public.share_posts (author_id, title, school_level, category, condition, item_type_id)
  values ('00000000-0000-0000-0000-0000000000a1', '교사용 의자', 'secondary', '교사용품',
          '사용감 있음', '00000000-0000-0000-0000-0000000000d2')
$$, 'AC4  교사용품은 세부 항목 없이 통과한다');

insert into public.share_posts (id, author_id, title, school_level, category, subject, condition, item_type_id, carbon_g)
values ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a1',
        '탄소 500g 글', 'elementary', '학급경영', null, '사용감 있음',
        '00000000-0000-0000-0000-0000000000d1', 500),
       ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000a1',
        '중등 과학 글', 'secondary', '수업교구', '과학', '사용감 적음',
        '00000000-0000-0000-0000-0000000000d2', 120),
       ('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000a1',
        '사진 개수 테스트', 'secondary', '교사용품', null, '사용감 있음',
        '00000000-0000-0000-0000-0000000000d2', 120);

-- =========================================== AC11 (club) category + limits
insert into public.club_posts (id, author_id, title, school_level, category)
values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1',
        '독서 모임', 'secondary', '국어');

-- ================================================ AC6  share image limit
\echo ''
\echo '--- AC6  share posts accept 4 photos, reject the 5th (R10) ---'

insert into public.share_post_images (post_id, storage_path, sort_order)
select '00000000-0000-0000-0000-0000000000b4', 'p/' || i, i
from generate_series(1, 4) i;

select tests.assert_eq(
  (select count(*) from public.share_post_images
   where post_id = '00000000-0000-0000-0000-0000000000b4')::int, 4,
  'AC6  4 photos stored');

select tests.expect_error($$
  insert into public.share_post_images (post_id, storage_path, sort_order)
  values ('00000000-0000-0000-0000-0000000000b4', 'p/5', 5)
$$, 'AC6  5th photo is rejected');

-- The trigger is per-row, so check the obvious bypass: five photos pushed in
-- one statement rather than five.
insert into public.share_posts (id, author_id, title, school_level, category, subject, condition, item_type_id)
values ('00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000000a1',
        '한 문장에 5장', 'secondary', '수업교구', '음악', '사용감 있음',
        '00000000-0000-0000-0000-0000000000d2');

select tests.expect_error($$
  insert into public.share_post_images (post_id, storage_path, sort_order)
  select '00000000-0000-0000-0000-0000000000b5', 'x/' || i, i
  from generate_series(1, 5) i
$$, 'AC6  5 photos in a single multi-row INSERT is also rejected');

select tests.assert_eq(
  (select count(*) from public.share_post_images
   where post_id = '00000000-0000-0000-0000-0000000000b5')::int, 0,
  'AC6  ...and nothing from that statement was written');

-- ================================================= AC11 club image limit
\echo ''
\echo '--- AC11 club posts accept 2 photos, reject the 3rd (R19) ---'

insert into public.club_post_images (post_id, storage_path, sort_order)
select '00000000-0000-0000-0000-0000000000f1', 'c/' || i, i
from generate_series(1, 2) i;

select tests.assert_eq(
  (select count(*) from public.club_post_images
   where post_id = '00000000-0000-0000-0000-0000000000f1')::int, 2,
  'AC11 2 photos stored');

select tests.expect_error($$
  insert into public.club_post_images (post_id, storage_path, sort_order)
  values ('00000000-0000-0000-0000-0000000000f1', 'c/3', 3)
$$, 'AC11 3rd photo is rejected');

-- ================================================ AC13 / AC17 schools upsert
\echo ''
\echo '--- AC13/AC17 schools keyed by kakao_place_id (R22) ---'

insert into public.schools (kakao_place_id, name, address, lat, lng)
values ('kakao-1', '언남초등학교', '용인시 기흥구', 37.27, 127.11)
on conflict (kakao_place_id) do update set name = excluded.name;

select tests.assert_eq(
  (select count(*) from public.schools where kakao_place_id = 'kakao-1')::int, 1,
  'AC13 same kakao_place_id twice still yields one row');

insert into public.schools (kakao_place_id, name)
select 'bulk-' || i, '학교' || i from generate_series(1, 10) i
on conflict (kakao_place_id) do nothing;

select tests.assert_eq(
  (select count(*) from public.schools where kakao_place_id like 'bulk-%')::int, 10,
  'AC17 a 10-result page stores 10 school rows');

-- ============================================== AC3  RLS blocks pending user
\echo ''
\echo '--- AC3  an unapproved account reads nothing (R4) ---'

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a9","role":"authenticated"}', false);
set role authenticated;

select tests.assert_eq((select count(*) from public.share_posts)::int, 0,
  'AC3  pending user sees 0 share_posts');
select tests.assert_eq((select count(*) from public.club_posts)::int, 0,
  'AC3  pending user sees 0 club_posts');
select tests.assert_eq((select count(*) from public.school_reviews)::int, 0,
  'AC3  pending user sees 0 school_reviews');
select tests.assert_eq((select count(*) from public.schools)::int, 0,
  'AC3  pending user sees 0 schools');
-- The one deliberate exception: your own profile row, so /pending can render.
select tests.assert_eq((select count(*) from public.profiles)::int, 1,
  'AC3  pending user sees only their own profile row');
select tests.assert_eq((select nickname from public.profiles), 'pendingTeacher',
  'AC3  ...and it is their own row');

reset role;

-- ============================================ AC22 write denial for teachers
\echo ''
\echo '--- AC22 approved teachers cannot write schools or the cache (R34) ---'

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', false);
set role authenticated;

select tests.expect_error($$
  insert into public.schools (kakao_place_id, name) values ('forged', '가짜학교')
$$, 'AC22 teacher INSERT into schools is denied');

select tests.expect_error($$
  insert into public.school_search_cache (query_key) values ('forged')
$$, 'AC22 teacher INSERT into school_search_cache is denied');

select tests.expect_error($$
  insert into public.school_search_cache_items (cache_id, school_id, rank)
  values (gen_random_uuid(), '00000000-0000-0000-0000-0000000000c1', 1)
$$, 'AC22 teacher INSERT into school_search_cache_items is denied');

select tests.expect_denied_write($$
  update public.schools set name = '바뀐이름' where kakao_place_id = 'kakao-1'
$$, 'AC22 teacher UPDATE on schools is denied');

select tests.expect_denied_write($$
  delete from public.schools where kakao_place_id = 'kakao-1'
$$, 'AC22 teacher DELETE on schools is denied');

-- privilege escalation must not be possible through the profile edit path
select tests.expect_error($$
  update public.profiles set role = 'admin'
  where id = '00000000-0000-0000-0000-0000000000a1'
$$, 'R4   teacher cannot promote themselves to admin');

select tests.expect_denied_write($$
  update public.profiles set status = 'approved'
  where id = '00000000-0000-0000-0000-0000000000a9'
$$, 'R4   teacher cannot approve another account');

-- ================================================== AC5  category filter
\echo ''
\echo '--- AC5  list filtering by level + category (R8) ---'

-- 마이그레이션 14: 학교급 + 카테고리 + (학년군 | 교과목)
select tests.assert_eq(
  (select count(*) from public.share_posts
   where school_level = 'secondary' and category = '수업교구' and subject = '과학')::int, 2,
  'AC5  중등 + 수업교구 + 과학');
select tests.assert_eq(
  (select count(*) from public.share_posts
   where school_level = 'elementary' and category = '수업교구' and grade_band = '3-4학년')::int, 1,
  'AC5  초등 + 수업교구 + 3-4학년');
select tests.assert_eq(
  (select count(*) from public.share_posts
   where category = '교사용품' and subject is null and grade_band is null)::int, 2,
  'AC5  교사용품에는 세부 항목이 없다');

-- ================================================= AC7  reservation rules
\echo ''
\echo '--- AC7  reserve / double-reserve (R12) ---'

select tests.expect_error($$
  update public.share_posts
     set status = 'reserved', reserved_by = '00000000-0000-0000-0000-0000000000a1'
   where id = '00000000-0000-0000-0000-0000000000b1'
$$, 'R12  author cannot reserve their own post');

reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', false);
set role authenticated;

update public.share_posts
   set status = 'reserved', reserved_by = '00000000-0000-0000-0000-0000000000a2'
 where id = '00000000-0000-0000-0000-0000000000b1';

reset role;
select tests.assert_eq(
  (select status from public.share_posts where id = '00000000-0000-0000-0000-0000000000b1'),
  'reserved', 'AC7  teacher B reserved the post');
select tests.assert_eq(
  (select reserved_at is not null from public.share_posts
   where id = '00000000-0000-0000-0000-0000000000b1'), true,
  'AC7  reserved_at was stamped');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', false);
set role authenticated;

-- The reserved post no longer satisfies teacher C's UPDATE policy, so RLS
-- filters it out and the statement writes nothing. Postgres re-checks the
-- policy against the locked row version, so a concurrent second reserver
-- loses the same way.
select tests.expect_denied_write($$
  update public.share_posts
     set status = 'reserved', reserved_by = '00000000-0000-0000-0000-0000000000a3'
   where id = '00000000-0000-0000-0000-0000000000b1'
$$, 'AC7  a third account cannot reserve an already reserved post');

-- ...and the post is still held by teacher B.
reset role;
select tests.assert_eq(
  (select reserved_by from public.share_posts
   where id = '00000000-0000-0000-0000-0000000000b1'),
  '00000000-0000-0000-0000-0000000000a2'::uuid,
  'AC7  the original reserver still holds the post');
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', false);
set role authenticated;

-- b3 is available, so the UPDATE policy lets teacher C through and the
-- transition trigger is what stops the edit. (R12)
select tests.expect_error($$
  update public.share_posts set title = '남의 글 수정'
   where id = '00000000-0000-0000-0000-0000000000b3'
$$, 'R12  a non-author cannot edit an available post''s body');

-- ============================================ AC8  comments while reserved
\echo ''
\echo '--- AC8  reserved = private thread between reserver and author (R15) ---'

-- 마이그레이션 13: 나눔중(available) 글에는 아무도 댓글을 쓸 수 없다.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', false);
set role authenticated;
select tests.expect_error($$
  insert into public.share_comments (post_id, author_id, body)
  values ('00000000-0000-0000-0000-0000000000b3',
          '00000000-0000-0000-0000-0000000000a2', '예약도 안 했는데 댓글')
$$, 'AC8  나눔중 글에는 제3자가 댓글을 쓸 수 없다');

-- 글쓴이도 예외가 아니다. 할 말은 본문에 쓰면 된다.
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', false);
set role authenticated;
select tests.expect_error($$
  insert into public.share_comments (post_id, author_id, body)
  values ('00000000-0000-0000-0000-0000000000b3',
          '00000000-0000-0000-0000-0000000000a1', '글쓴이가 남기는 메모')
$$, 'AC8  나눔중 글에는 글쓴이도 댓글을 쓸 수 없다');

reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', false);
set role authenticated;

-- b1 is reserved: author a1, reserver a2. Teacher C is neither.
select tests.expect_error($$
  insert into public.share_comments (post_id, author_id, body)
  values ('00000000-0000-0000-0000-0000000000b1',
          '00000000-0000-0000-0000-0000000000a3', 'API로 직접 넣어봅니다')
$$, 'AC8  a bystander cannot comment on a reserved post');

-- Migration 11: the two people the reservation concerns still can.
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', false);
set role authenticated;
select tests.expect_ok($$
  insert into public.share_comments (post_id, author_id, body)
  values ('00000000-0000-0000-0000-0000000000b1',
          '00000000-0000-0000-0000-0000000000a2', '언제 찾으러 가면 될까요?')
$$, 'AC8  the reserver may comment while reserved');

reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', false);
set role authenticated;
select tests.expect_ok($$
  insert into public.share_comments (post_id, author_id, body)
  values ('00000000-0000-0000-0000-0000000000b1',
          '00000000-0000-0000-0000-0000000000a1', '내일 오후 좋습니다')
$$, 'AC8  the author may reply while reserved');

reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', false);
set role authenticated;

select tests.assert_eq(
  (select count(*) from public.share_comments
   where post_id = '00000000-0000-0000-0000-0000000000b3')::int, 0,
  'AC8  나눔중 글에는 결국 한 건도 쓰이지 않았다');

-- =========================================== AC9  cancel / complete / lock
\echo ''
\echo '--- AC9  cancel returns to available, completed is terminal (R13, R14) ---'

reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', false);
set role authenticated;

update public.share_posts set status = 'available', reserved_by = null
 where id = '00000000-0000-0000-0000-0000000000b1';

reset role;
select tests.assert_eq(
  (select status from public.share_posts where id = '00000000-0000-0000-0000-0000000000b1'),
  'available', 'AC9  reserver cancelled, post is back to available');
select tests.assert_eq(
  (select reserved_by from public.share_posts where id = '00000000-0000-0000-0000-0000000000b1'),
  null::uuid, 'AC9  reserved_by was cleared');

-- 마이그레이션 13: 취소하면 다시 available 이므로 잠금이 풀리고, 그 결과
-- 아무도 못 쓰는 상태로 돌아간다. 다음 사람이 예약하면 다시 열린다.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', false);
set role authenticated;
select tests.expect_error($$
  insert into public.share_comments (post_id, author_id, body)
  values ('00000000-0000-0000-0000-0000000000b1',
          '00000000-0000-0000-0000-0000000000a3', '취소됐으니 써볼까')
$$, 'AC8  예약이 취소되면 다시 아무도 댓글을 쓸 수 없다');

-- 이미 달린 댓글은 취소로 사라지지 않는다.
select tests.assert_eq(
  (select count(*) from public.share_comments
   where post_id = '00000000-0000-0000-0000-0000000000b1')::int, 2,
  'AC8  예약중에 오간 댓글은 취소 후에도 남는다');

-- 다음 사람이 예약하면 그 사람에게 댓글 권한이 넘어간다.
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', false);
set role authenticated;
update public.share_posts
   set status = 'reserved', reserved_by = '00000000-0000-0000-0000-0000000000a3'
 where id = '00000000-0000-0000-0000-0000000000b1';
select tests.expect_ok($$
  insert into public.share_comments (post_id, author_id, body)
  values ('00000000-0000-0000-0000-0000000000b1',
          '00000000-0000-0000-0000-0000000000a3', '새 예약자입니다')
$$, 'AC8  새 예약자는 댓글을 쓸 수 있다');

-- 직전 예약자는 더 이상 못 쓴다.
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', false);
set role authenticated;
select tests.expect_error($$
  insert into public.share_comments (post_id, author_id, body)
  values ('00000000-0000-0000-0000-0000000000b1',
          '00000000-0000-0000-0000-0000000000a2', '이전 예약자입니다')
$$, 'AC8  예약이 넘어가면 이전 예약자는 못 쓴다');

-- 원상복구: 이 뒤의 AC9/AC10 테스트가 available 을 기대한다.
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', false);
set role authenticated;
update public.share_posts set status = 'available', reserved_by = null
 where id = '00000000-0000-0000-0000-0000000000b1';
reset role;

-- available -> completed must not skip the reserved step
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', false);
set role authenticated;

select tests.expect_error($$
  update public.share_posts set status = 'completed'
   where id = '00000000-0000-0000-0000-0000000000b1'
$$, 'AC9  available -> completed is rejected (R11)');

-- ==================================================== AC10 carbon totals
\echo ''
\echo '--- AC10 carbon total counts completed posts only (R17) ---'

reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', false);
set role authenticated;
update public.share_posts
   set status = 'reserved', reserved_by = '00000000-0000-0000-0000-0000000000a2'
 where id = '00000000-0000-0000-0000-0000000000b2';

reset role;
select tests.assert_eq(
  (select coalesce(sum(carbon_g), 0)::bigint from public.share_posts
   where author_id = '00000000-0000-0000-0000-0000000000a1' and status = 'completed'),
  0::bigint, 'AC10 reserved contributes nothing to the carbon total');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', false);
set role authenticated;
update public.share_posts set status = 'completed'
 where id = '00000000-0000-0000-0000-0000000000b2';

select tests.assert_eq(
  (select total_carbon_g from public.user_carbon_totals
   where user_id = '00000000-0000-0000-0000-0000000000a1'),
  500::bigint, 'AC10 completing a 500g post adds exactly 500g');

select tests.expect_error($$
  update public.share_posts set status = 'available', reserved_by = null
   where id = '00000000-0000-0000-0000-0000000000b2'
$$, 'AC9  completed -> available is rejected');

select tests.expect_error($$
  update public.share_posts set status = 'reserved',
         reserved_by = '00000000-0000-0000-0000-0000000000a2'
   where id = '00000000-0000-0000-0000-0000000000b2'
$$, 'AC9  completed -> reserved is rejected');

select tests.assert_eq(
  (select total_carbon_g from public.user_carbon_totals
   where user_id = '00000000-0000-0000-0000-0000000000a1'),
  500::bigint, 'AC10 carbon total unchanged after the failed rollbacks');

-- ================================================ carbon ledger integrity
\echo ''
\echo '--- R16 the carbon snapshot cannot be forged (migration 9) ---'

-- Author holds a completed 500g post here. Try to inflate it.
select tests.expect_error($$
  update public.share_posts set carbon_g = 999999
   where id = '00000000-0000-0000-0000-0000000000b2'
$$, 'R16  the author cannot rewrite carbon_g on their own post');

select tests.expect_error($$
  update public.share_posts set item_type_id = '00000000-0000-0000-0000-0000000000d2'
   where id = '00000000-0000-0000-0000-0000000000b2'
$$, 'R16  the author cannot swap the item type after the fact');

select tests.assert_eq(
  (select total_carbon_g from public.user_carbon_totals
   where user_id = '00000000-0000-0000-0000-0000000000a1'),
  500::bigint, 'R16  carbon total survives the forgery attempts');

-- carbon_g is derived on insert, so a hand-picked value is simply ignored.
insert into public.share_posts (id, author_id, title, school_level, category, subject,
                                condition, item_type_id, carbon_g)
values ('00000000-0000-0000-0000-0000000000b6', '00000000-0000-0000-0000-0000000000a1',
        '계수 위조 시도', 'secondary', '수업교구', '기술', '사용감 있음',
        '00000000-0000-0000-0000-0000000000d2', 88888);

select tests.assert_eq(
  (select carbon_g from public.share_posts
   where id = '00000000-0000-0000-0000-0000000000b6'), 120,
  'R16  a forged carbon_g on insert is replaced by the item type coefficient');

select tests.expect_error($$
  insert into public.share_posts (author_id, title, school_level, category, carbon_g)
  values ('00000000-0000-0000-0000-0000000000a1', '품목 없는 글', 'secondary', '기술', 123456)
$$, 'R16  a post with no item type is rejected');

-- R17: the view is scoped to the caller, so it cannot be read as a leaderboard.
select tests.assert_eq(
  (select count(*) from public.user_carbon_totals)::int, 1,
  'R17  a user sees exactly one row in user_carbon_totals - their own');

reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', false);
set role authenticated;

select tests.assert_eq(
  (select count(*) from public.user_carbon_totals
   where user_id = '00000000-0000-0000-0000-0000000000a1')::int, 0,
  'R17  teacher B cannot read teacher A''s carbon total');

-- ================================================ AC11 club comments open
\echo ''
\echo '--- AC11 club comments are never gated (R20) ---'

reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', false);
set role authenticated;

select tests.expect_ok($$
  insert into public.club_comments (post_id, author_id, body)
  values ('00000000-0000-0000-0000-0000000000f1',
          '00000000-0000-0000-0000-0000000000a2', '저도 참여하고 싶어요')
$$, 'AC11 another teacher can comment on a club post');

-- ===================================================== AC14 rating average
\echo ''
\echo '--- AC14 rating averages (R24, R25) ---'

insert into public.school_reviews (id, school_id, user_id)
values ('00000000-0000-0000-0000-000000000091',
        '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a2');
insert into public.school_review_answers (review_id, question_id, score)
values ('00000000-0000-0000-0000-000000000091',
        '00000000-0000-0000-0000-0000000000e1', 4);

reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', false);
set role authenticated;

insert into public.school_reviews (id, school_id, user_id)
values ('00000000-0000-0000-0000-000000000092',
        '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a3');
insert into public.school_review_answers (review_id, question_id, score)
values ('00000000-0000-0000-0000-000000000092',
        '00000000-0000-0000-0000-0000000000e1', 5);

reset role;
select tests.assert_eq(
  (select average_score from public.school_rating_summary
   where school_id = '00000000-0000-0000-0000-0000000000c1'
     and question_id = '00000000-0000-0000-0000-0000000000e1'),
  4.5::numeric, 'AC14 4 and 5 average to 4.5');
select tests.assert_eq(
  (select reviewer_count from public.school_rating_summary
   where school_id = '00000000-0000-0000-0000-0000000000c1'
     and question_id is null),
  2::bigint, 'AC14 participant count is 2');

-- R24: re-rating overwrites rather than adding a second review.
-- Teacher B is the one who scored 4; dropping that to 3 gives (3 + 5) / 2 = 4.0.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', false);
set role authenticated;

insert into public.school_review_answers (review_id, question_id, score)
values ('00000000-0000-0000-0000-000000000091',
        '00000000-0000-0000-0000-0000000000e1', 3)
on conflict (review_id, question_id) do update set score = excluded.score;

reset role;
select tests.assert_eq(
  (select average_score from public.school_rating_summary
   where school_id = '00000000-0000-0000-0000-0000000000c1'
     and question_id = '00000000-0000-0000-0000-0000000000e1'),
  4.0::numeric, 'AC14 re-rating to 3 moves the average to 4.0');
select tests.assert_eq(
  (select count(*) from public.school_reviews
   where school_id = '00000000-0000-0000-0000-0000000000c1')::int, 2,
  'AC14 re-rating did not create an extra review row');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', false);
set role authenticated;
select tests.expect_error($$
  insert into public.school_reviews (school_id, user_id)
  values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a3')
$$, 'R24  a second review by the same user on the same school is rejected');

select tests.expect_error($$
  insert into public.school_review_answers (review_id, question_id, score)
  values ('00000000-0000-0000-0000-000000000092',
          '00000000-0000-0000-0000-0000000000e2', 6)
$$, 'R24  a score of 6 is rejected');

-- Migration 11 (R24): rating is limited to your own school. Teacher C belongs
-- to c1, so c2 has to be refused even with a well-formed insert.
select tests.expect_error($$
  insert into public.school_reviews (school_id, user_id)
  values ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a3')
$$, 'R24  a teacher cannot review a school they do not belong to');

select tests.assert_eq(
  (select count(*) from public.school_reviews
   where school_id = '00000000-0000-0000-0000-0000000000c2')::int, 0,
  'R24  ...and nothing was written for that school');

-- A teacher with no school at all may rate nothing.
reset role;
update public.profiles set school_id = null
  where id = '00000000-0000-0000-0000-0000000000a3';
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', false);
set role authenticated;
select tests.expect_error($$
  insert into public.school_reviews (school_id, user_id)
  values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a3')
$$, 'R24  a teacher with no school set cannot review anything');

reset role;
update public.profiles set school_id = '00000000-0000-0000-0000-0000000000c1'
  where id = '00000000-0000-0000-0000-0000000000a3';
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', false);
set role authenticated;

-- ======================================= migration 15: 단원과 성취기준
\echo ''
\echo '--- 단원/성취기준은 중등 수업교구에서만 붙는다 (마이그레이션 15) ---'

reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', false);
set role authenticated;

select tests.expect_ok($$
  insert into public.share_posts (author_id, title, school_level, category, subject,
                                  condition, item_type_id, unit, standards)
  values ('00000000-0000-0000-0000-0000000000a1', '정보 교구', 'secondary', '수업교구', '정보',
          '사용감 있음', '00000000-0000-0000-0000-0000000000d2',
          '알고리즘과 프로그래밍', array['9정03-05','9정03-07'])
$$, 'CURR 중등 수업교구에는 단원과 성취기준을 붙일 수 있다');

select tests.expect_error($$
  insert into public.share_posts (author_id, title, school_level, category, grade_band,
                                  condition, item_type_id, unit)
  values ('00000000-0000-0000-0000-0000000000a1', '초등에 단원', 'elementary', '수업교구', '3-4학년',
          '사용감 있음', '00000000-0000-0000-0000-0000000000d1', '데이터')
$$, 'CURR 초등 수업교구에는 단원을 붙일 수 없다');

select tests.expect_error($$
  insert into public.share_posts (author_id, title, school_level, category,
                                  condition, item_type_id, standards)
  values ('00000000-0000-0000-0000-0000000000a1', '교사용품에 성취기준', 'secondary', '교사용품',
          '사용감 있음', '00000000-0000-0000-0000-0000000000d2', array['9정01-01'])
$$, 'CURR 교사용품에는 성취기준을 붙일 수 없다');

select tests.expect_error($$
  insert into public.share_posts (author_id, title, school_level, category, subject,
                                  condition, item_type_id, standards)
  values ('00000000-0000-0000-0000-0000000000a1', '단원 없는 성취기준', 'secondary', '수업교구', '정보',
          '사용감 있음', '00000000-0000-0000-0000-0000000000d2', array['9정01-01'])
$$, 'CURR 단원 없이 성취기준만 담을 수 없다');

select tests.expect_error($$
  insert into public.share_posts (author_id, title, school_level, category, subject,
                                  condition, item_type_id, unit, standards)
  values ('00000000-0000-0000-0000-0000000000a1', '중복 성취기준', 'secondary', '수업교구', '정보',
          '사용감 있음', '00000000-0000-0000-0000-0000000000d2',
          '데이터', array['9정02-01','9정02-01'])
$$, 'CURR 같은 성취기준을 두 번 담을 수 없다');

select tests.expect_error($$
  insert into public.share_posts (author_id, title, school_level, category, subject,
                                  condition, item_type_id, unit, standards)
  values ('00000000-0000-0000-0000-0000000000a1', '빈 코드', 'secondary', '수업교구', '정보',
          '사용감 있음', '00000000-0000-0000-0000-0000000000d2',
          '데이터', array['9정02-01','  '])
$$, 'CURR 빈 성취기준 코드는 거부된다');

select tests.expect_error($$
  insert into public.share_posts (author_id, title, school_level, category, subject,
                                  condition, item_type_id, unit, standards)
  values ('00000000-0000-0000-0000-0000000000a1', '너무 많음', 'secondary', '수업교구', '정보',
          '사용감 있음', '00000000-0000-0000-0000-0000000000d2', '데이터',
          array['a1','a2','a3','a4','a5','a6','a7','a8','a9','b1','b2','b3','b4'])
$$, 'CURR 성취기준은 12개를 넘을 수 없다');

-- 목록 자체는 파일에 있으므로 DB 는 소속까지 보지 않는다. 의도된 한계다.
select tests.expect_ok($$
  insert into public.share_posts (author_id, title, school_level, category, subject,
                                  condition, item_type_id, unit, standards)
  values ('00000000-0000-0000-0000-0000000000a1', '다른 단원 코드', 'secondary', '수업교구', '정보',
          '사용감 있음', '00000000-0000-0000-0000-0000000000d2',
          '데이터', array['9정05-01'])
$$, 'CURR 코드가 그 단원 소속인지는 DB 가 아니라 앱이 막는다');

reset role;

-- ============================================ migration 14: 품목유형 목록
\echo ''
\echo '--- 품목유형은 카테고리별 목록이다 (마이그레이션 14) ---'

reset role;
select tests.assert_eq(
  (select count(*) from public.item_types
   where is_active and category = '학급경영')::int, 6,
  'ITEM 학급경영 품목 6종');
select tests.assert_eq(
  (select count(*) from public.item_types
   where is_active and category = '수업교구')::int, 9,
  'ITEM 수업교구 품목 9종');
select tests.assert_eq(
  (select count(*) from public.item_types
   where is_active and category = '교사용품')::int, 6,
  'ITEM 교사용품 품목 6종');
-- 시드의 재질 기반 8종은 새 드롭다운에서 빠진다. 다만 '의류·체육복' 은 새
-- 교사용품 목록에도 같은 이름으로 있어 label unique 때문에 그 행을 재사용한다.
-- (픽스처가 직접 넣는 '교구'/'도서' 는 이 검사 대상이 아니다.)
select tests.assert_eq(
  (select count(*) from public.item_types
   where is_active and label in ('책·교재','학용품·문구','교구·실험도구',
     '보드게임·놀이도구','가구·수납','전자기기','기타'))::int, 0,
  'ITEM 재사용하지 않는 재질 7종은 비활성화된다');
select tests.assert_eq(
  (select category from public.item_types where label = '의류·체육복'),
  '교사용품', 'ITEM 의류·체육복 은 교사용품으로 재사용된다');

-- 탄소 계수는 기존 8종에서 물려받은 값만 쓴다. 새로 지어낸 숫자가 없어야 한다.
select tests.assert_eq(
  (select count(*) from public.item_types
   where category is not null
     and carbon_g not in (1200, 300, 2500, 3200, 6000, 18000, 25000, 500))::int, 0,
  'ITEM 계수는 기존 8종 값에서만 온다');

-- 새 품목에 카테고리 밖 값이 들어가지 않는다.
select tests.expect_error($$
  insert into public.item_types (label, carbon_g, category)
  values ('엉뚱한 분류', 100, '학급자료')
$$, 'ITEM 없는 카테고리는 거부된다');

-- ================================================ migration 12: admin delete
\echo ''
\echo '--- 운영자는 남의 글도 지울 수 있다 (마이그레이션 12) ---'

-- A plain teacher still cannot touch someone else's post.
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', false);
set role authenticated;

select tests.assert_eq(
  (select count(*) from public.share_posts
   where id = '00000000-0000-0000-0000-0000000000b2')::int, 1,
  'ADMIN the target post exists to begin with');

delete from public.share_posts where id = '00000000-0000-0000-0000-0000000000b2';
select tests.assert_eq(
  (select count(*) from public.share_posts
   where id = '00000000-0000-0000-0000-0000000000b2')::int, 1,
  'ADMIN a teacher deleting another teacher post writes nothing');

-- The admin can.
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a0","role":"authenticated"}', false);
set role authenticated;

delete from public.share_posts where id = '00000000-0000-0000-0000-0000000000b2';
select tests.assert_eq(
  (select count(*) from public.share_posts
   where id = '00000000-0000-0000-0000-0000000000b2')::int, 0,
  'ADMIN an admin can delete another teacher share post');

delete from public.club_posts where id = '00000000-0000-0000-0000-0000000000f1';
select tests.assert_eq(
  (select count(*) from public.club_posts
   where id = '00000000-0000-0000-0000-0000000000f1')::int, 0,
  'ADMIN an admin can delete another teacher club post');

-- Widening DELETE must not have widened UPDATE.
select tests.expect_error($$
  update public.share_posts set title = '운영자가 고침'
   where id = '00000000-0000-0000-0000-0000000000b3'
$$, 'ADMIN an admin still cannot edit someone else''s post');

reset role;

-- ============================================= AC15 deactivated questions
\echo ''
\echo '--- AC15 deactivating a question keeps its history (R26) ---'

reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a0","role":"authenticated"}', false);
set role authenticated;

update public.school_review_questions set is_active = false
 where id = '00000000-0000-0000-0000-0000000000e1';

select tests.assert_eq(
  (select count(*) from public.school_review_questions where is_active)::int, 1,
  'AC15 the rating form now offers one question');
select tests.assert_eq(
  (select average_score from public.school_rating_summary
   where school_id = '00000000-0000-0000-0000-0000000000c1'
     and question_id = '00000000-0000-0000-0000-0000000000e1'),
  4.0::numeric, 'AC15 the deactivated question keeps its average in the summary');

reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', false);
set role authenticated;
select tests.expect_denied_write($$
  update public.school_review_questions set is_active = false
   where id = '00000000-0000-0000-0000-0000000000e2'
$$, 'R26  a non-admin cannot edit questions');

select tests.expect_error($$
  insert into public.school_review_questions (text) values ('몰래 넣은 질문')
$$, 'R26  a non-admin cannot add a question');

select tests.expect_error($$
  insert into public.item_types (label, carbon_g) values ('몰래 넣은 품목', 9999)
$$, 'R16  a non-admin cannot edit the carbon coefficient table');

-- ===================================================== AC16 nickname unique
\echo ''
\echo '--- AC16 nicknames are unique (R29) ---'

select tests.expect_error($$
  update public.profiles set nickname = 'teacherB'
   where id = '00000000-0000-0000-0000-0000000000a1'
$$, 'AC16 taking an existing nickname is rejected');

select tests.expect_error($$
  update public.profiles set nickname = 'TEACHERB'
   where id = '00000000-0000-0000-0000-0000000000a1'
$$, 'AC16 ...case-insensitively too');

select tests.expect_ok($$
  update public.profiles set nickname = '나눔하는교사'
   where id = '00000000-0000-0000-0000-0000000000a1'
$$, 'AC16 an unused nickname is accepted');

select tests.assert_eq(public.nickname_available('teacherB'), false,
  'R29  nickname_available reports a taken nickname');
select tests.assert_eq(public.nickname_available('  아직없는닉네임 '), true,
  'R29  nickname_available reports a free nickname');

reset role;
select set_config('request.jwt.claims', '', false);

\echo ''
\echo '======================================================================'
\echo ' all database assertions passed'
\echo '======================================================================'
