-- apply-0015.sql 까지 실행한 프로젝트에 이 파일만 추가로 Run 하세요.
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 Run.
--
-- 게시판 글에 카테고리 두 축을 추가합니다. 둘 다 필수입니다.
--   경력 단계 : 신규적응 / 저경력 / 중견 / 은퇴준비 / 자유
--   주제      : 수업 / 업무 / 인간관계 / 진로 / 잡담

-- Migration 16: 게시판 글에 카테고리 두 축을 붙인다.
--
--   경력 단계  신규적응 / 저경력 / 중견 / 은퇴준비 / 자유
--   주제       수업 / 업무 / 인간관계 / 진로 / 잡담
--
-- 두 축은 서로 독립이고 둘 다 필수다. 글을 쓸 때 제목보다 먼저 고르고,
-- 읽는 사람은 이 둘로 목록을 걸러 본다.

alter table public.board_posts
  add column if not exists career_stage text,
  add column if not exists topic        text;

-- 지금 board_posts 는 비어 있어 아무 행도 건드리지 않는다. 데이터가 있는
-- 환경에서 실행되더라도 NOT NULL 로 넘어갈 수 있도록 남겨 둔다.
update public.board_posts set career_stage = '자유' where career_stage is null;
update public.board_posts set topic        = '잡담' where topic is null;

alter table public.board_posts
  alter column career_stage set not null,
  alter column topic        set not null;

alter table public.board_posts drop constraint if exists board_posts_career_stage_valid;
alter table public.board_posts
  add constraint board_posts_career_stage_valid
    check (career_stage in ('신규적응', '저경력', '중견', '은퇴준비', '자유'));

alter table public.board_posts drop constraint if exists board_posts_topic_valid;
alter table public.board_posts
  add constraint board_posts_topic_valid
    check (topic in ('수업', '업무', '인간관계', '진로', '잡담'));

-- 목록은 두 축으로 걸러 최신순으로 본다.
create index if not exists board_posts_index_idx
  on public.board_posts (career_stage, topic, created_at desc);
