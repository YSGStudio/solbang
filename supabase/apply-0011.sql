-- apply-0010.sql 까지 실행한 프로젝트에 이 파일만 추가로 Run 하세요.
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 Run.
--
-- 바뀌는 규칙 2가지
--  1. 별점 평가는 본인이 속한 학교에만 가능 (기존: 아무 학교나 가능했음)
--  2. 예약중인 나눔글 댓글은 예약자와 글쓴이만 작성 가능 (기존: 전원 차단)

-- Migration 11: two rule changes, both enforced in the database.
--
-- 1. R24 change: a teacher may only rate the school they belong to. The old
--    policy checked user_id and nothing else, so any approved user could POST
--    a review for any school id.
-- 2. R15 change: a reserved post is no longer comment-silent. The reservation
--    opens a private thread between the reserver and the author instead.

-- ------------------------------------------------- own-school reviews (R24)
-- security definer so the lookup is not itself subject to the profiles policy.
create or replace function public.my_school_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select school_id from public.profiles where id = auth.uid();
$$;

revoke all on function public.my_school_id() from public;
grant execute on function public.my_school_id() to authenticated;

comment on function public.my_school_id() is
  'R24: the caller''s own school. Null when they have not set one.';

drop policy if exists reviews_write_own on public.school_reviews;
create policy reviews_write_own on public.school_reviews
  for all to authenticated
  using (
    public.is_approved()
    and user_id = auth.uid()
    and school_id = public.my_school_id()
  )
  with check (
    public.is_approved()
    and user_id = auth.uid()
    -- null school_id would make this null rather than false, so be explicit.
    and public.my_school_id() is not null
    and school_id = public.my_school_id()
  );

-- The answers policy hangs off the review row, so it inherits the school
-- check; restated here so a stale review row cannot be used as a side door.
drop policy if exists answers_write_own on public.school_review_answers;
create policy answers_write_own on public.school_review_answers
  for all to authenticated
  using (
    public.is_approved()
    and exists (
      select 1 from public.school_reviews r
      where r.id = review_id
        and r.user_id = auth.uid()
        and r.school_id = public.my_school_id()
    )
  )
  with check (
    public.is_approved()
    and exists (
      select 1 from public.school_reviews r
      where r.id = review_id
        and r.user_id = auth.uid()
        and r.school_id = public.my_school_id()
    )
  );

-- ------------------------------------- reserved posts: private thread (R15)
-- Was: nobody may comment while reserved. Now: only the two people the
-- reservation actually concerns. Once it is released or completed the thread
-- opens back up to everyone, and existing comments are never touched.
create or replace function public.block_comment_while_reserved()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  post_status   text;
  post_author   uuid;
  post_reserver uuid;
begin
  select status, author_id, reserved_by
    into post_status, post_author, post_reserver
  from public.share_posts where id = new.post_id;

  if post_status = 'reserved'
     and new.author_id is distinct from post_reserver
     and new.author_id is distinct from post_author then
    raise exception '예약중에는 예약한 선생님과 글쓴이만 댓글을 쓸 수 있습니다'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists share_comments_block_reserved on public.share_comments;
create trigger share_comments_block_reserved
  before insert on public.share_comments
  for each row execute function public.block_comment_while_reserved();
