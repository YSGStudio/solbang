-- Reference data (T20). Safe to run more than once.
--
-- Carbon coefficients are placeholders chosen to be plausible, not measured.
-- Replace them with sourced figures before launch; see the report's Risks.

insert into public.item_types (label, carbon_g, sort_order) values
  ('책·교재',            1200,  1),
  ('학용품·문구',         300,  2),
  ('교구·실험도구',      2500,  3),
  ('보드게임·놀이도구',  3200,  4),
  ('의류·체육복',        6000,  5),
  ('가구·수납',         18000,  6),
  ('전자기기',          25000,  7),
  ('기타',                500, 99)
on conflict (label) do nothing;

insert into public.school_review_questions (text, sort_order) values
  ('동료 교사들과 협력하기 좋은 분위기인가요?', 1),
  ('업무 분장이 공정하게 이루어지나요?',       2),
  ('관리자와 소통이 원활한가요?',              3),
  ('수업에 집중할 수 있는 환경인가요?',        4),
  ('신규 교사가 적응하기 좋은 학교인가요?',    5)
on conflict do nothing;
