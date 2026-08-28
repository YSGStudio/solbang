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

-- item_type_id is supplied so the failure can only come from the category
-- CHECK, not from migration 9's item-type guard.
-- Migration 10: category is now the 대분류 and 과목 is a separate column.
select tests.expect_error($$
  insert into public.share_posts (author_id, title, school_level, category, subject, condition, item_type_id)
  values ('00000000-0000-0000-0000-0000000000a1', '대분류 자리에 과목', 'elementary', '수학', '공통',
          '사용감 있음', '00000000-0000-0000-0000-0000000000d1')
$$, 'AC4  a subject name in the 대분류 column is rejected');

select tests.expect_error($$
  insert into public.share_posts (author_id, title, school_level, category, subject, condition, item_type_id)
  values ('00000000-0000-0000-0000-0000000000a1', '없는 과목', 'elementary', '수업교구', '한문',
          '사용감 있음', '00000000-0000-0000-0000-0000000000d1')
$$, 'AC4  an unknown 과목 is rejected');

select tests.expect_error($$
  insert into public.share_posts (author_id, title, school_level, category, subject, condition, item_type_id)
  values ('00000000-0000-0000-0000-0000000000a1', '없는 상태', 'elementary', '수업교구', '공통',
          '아주 좋음', '00000000-0000-0000-0000-0000000000d1')
$$, 'AC4  an unknown 물건상태 is rejected');

select tests.expect_ok($$
  insert into public.share_posts (id, author_id, title, school_level, category, subject, condition, item_type_id, carbon_g)
  values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1',
          '예약 흐름용 글', 'elementary', '수업교구', '공통', '사용감 있음',
          '00000000-0000-0000-0000-0000000000d1', 500)
$$, 'AC4  elementary + 수업교구 + 공통 is accepted');

-- 초등도 과목을 고른다 (초·중등 동일 3단계).
select tests.expect_ok($$
  insert into public.share_posts (author_id, title, school_level, category, subject, condition, item_type_id)
  values ('00000000-0000-0000-0000-0000000000a1', '초등 수학 교구', 'elementary', '수업교구', '수학',
          '미개봉/새것', '00000000-0000-0000-0000-0000000000d1')
$$, 'AC4  elementary may also carry a 과목');

insert into public.share_posts (id, author_id, title, school_level, category, subject, condition, item_type_id, carbon_g)
values ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a1',
        '탄소 500g 글', 'elementary', '학급자료', '공통', '사용감 있음',
        '00000000-0000-0000-0000-0000000000d1', 500),
       ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000a1',
        '중등 과학 글', 'secondary', '수업교구', '과학', '사용감 적음',
        '00000000-0000-0000-0000-0000000000d2', 120),
       ('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000a1',
        '사진 개수 테스트', 'secondary', '수업교구', '미술', '사용감 있음',
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

-- Migration 10: filtering is now level + 대분류 + 과목.
select tests.assert_eq(
  (select count(*) from public.share_posts
   where school_level = 'secondary' and category = '수업교구' and subject = '과학')::int, 1,
  'AC5  secondary + 수업교구 + 과학 matches exactly one post');
select tests.assert_eq(
  (select title from public.share_posts
   where school_level = 'secondary' and category = '수업교구' and subject = '과학'), '중등 과학 글',
  'AC5  ...and it is the right one');

-- The 대분류 alone is a coarser filter, and the 과목 axis is independent of it.
select tests.assert_eq(
  (select count(*) from public.share_posts
   where school_level = 'secondary' and category = '수업교구')::int, 3,
  'AC5  secondary + 수업교구 alone matches every secondary post so far');
select tests.assert_eq(
  (select count(*) from public.share_posts where subject = '공통')::int, 2,
  'AC5  공통 spans both school levels');

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

reset role;
insert into public.share_comments (post_id, author_id, body)
values ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000a2',
        '이 글은 available 이라 댓글이 됩니다');

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
   where post_id = '00000000-0000-0000-0000-0000000000b3')::int, 1,
  'AC8  comments already on other posts are untouched');

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

-- comments work again once it is no longer reserved
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', false);
set role authenticated;
select tests.expect_ok($$
  insert into public.share_comments (post_id, author_id, body)
  values ('00000000-0000-0000-0000-0000000000b1',
          '00000000-0000-0000-0000-0000000000a3', '다시 댓글이 됩니다')
$$, 'AC8  commenting works again after the reservation is cancelled');

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
