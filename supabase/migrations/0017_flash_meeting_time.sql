-- Migration 17: 번개모임에 만나는 날짜와 시간을 붙인다.
--
-- 번개모임은 언제 만나는지가 글의 핵심이라 필수로 둔다. 소모임은 정해진
-- 일시가 없는 모임이라 이 칸을 쓰지 않는다.
--
-- 목록 위 달력이 이 값을 읽어 스케줄처럼 보여준다.

alter table public.club_posts
  add column if not exists meet_at timestamptz;

-- 이미 올라온 번개모임 1건("9월 1일 오전 7시 노량진 맥모닝 드실 분")은
-- 제목에 적힌 시각을 그대로 옮긴다. 연도는 글이 쓰인 2026년으로 본다.
-- 글쓴이가 수정 화면에서 고칠 수 있다.
update public.club_posts
   set meet_at = timestamptz '2026-09-01 07:00+09'
 where kind = 'flash' and meet_at is null;

alter table public.club_posts drop constraint if exists club_posts_meet_at_valid;
alter table public.club_posts
  add constraint club_posts_meet_at_valid
    check (
      case
        when kind = 'flash' then meet_at is not null
        else meet_at is null
      end
    );

-- 달력은 한 달치를 meet_at 범위로 훑는다.
create index if not exists club_posts_meet_at_idx
  on public.club_posts (kind, meet_at);
