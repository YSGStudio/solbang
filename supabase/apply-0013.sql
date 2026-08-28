-- apply-0012.sql 까지 실행한 프로젝트에 이 파일만 추가로 Run 하세요.
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 Run.
--
-- 나눔글 댓글 규칙이 바뀝니다.
--   나눔중   : 아무도 댓글을 쓸 수 없음 (예약해야 문의 가능)
--   예약중   : 예약자와 글쓴이만
--   나눔완료 : 예약자와 글쓴이만
-- 예약을 취소하면 나눔중으로 돌아가며 잠금도 함께 풀립니다.
-- 이미 달린 댓글은 어떤 경우에도 지워지지 않습니다.

-- Migration 13: commenting on a share post is earned by reserving it.
--
-- R15 rewritten again. The rule is now:
--
--   available  나눔중    아무도 댓글을 쓸 수 없다. 예약이 곧 문의 자격이다.
--   reserved   예약중    예약자와 글쓴이만.
--   completed  나눔완료  예약자와 글쓴이만. 거래 당사자끼리 마무리할 수 있게.
--
-- 예약이 취소되면 status 가 available 로 돌아가므로 잠금도 함께 풀리고,
-- 다음 사람이 예약해서 다시 문의할 수 있다. 이미 달린 댓글은 어느 경우에도
-- 지워지지 않는다.
--
-- reserved_by survives the move to completed (guard_share_post_transition only
-- stamps completed_at), so the finished thread keeps both of its participants.

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

  if post_status is null then
    raise exception '글을 찾을 수 없습니다' using errcode = 'check_violation';
  end if;

  -- Nobody talks on an unreserved item, not even its owner. The owner has the
  -- post body for anything they want to say up front.
  if post_status = 'available' then
    raise exception '예약한 뒤에야 댓글을 쓸 수 있습니다'
      using errcode = 'check_violation';
  end if;

  if new.author_id is distinct from post_reserver
     and new.author_id is distinct from post_author then
    raise exception '예약한 선생님과 글쓴이만 댓글을 쓸 수 있습니다'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists share_comments_block_reserved on public.share_comments;
create trigger share_comments_block_reserved
  before insert on public.share_comments
  for each row execute function public.block_comment_while_reserved();
