-- Migration 2 (T6): school level / category pairing, enforced in the database.
-- Requirements: R6, R7  |  Acceptance: AC4
--
-- This mapping is duplicated in src/lib/categories.ts. Change both together.

create or replace function public.is_valid_category(
  level text,
  category text
) returns boolean
language sql
immutable
as $$
  select case level
    when 'elementary' then category in ('수업자료', '학급자료')
    when 'secondary'  then category in (
      '국어', '수학', '사회', '영어', '역사',
      '과학', '기술', '미술', '음악', '체육'
    )
    else false
  end;
$$;

comment on function public.is_valid_category(text, text) is
  'R7: a detail category is only valid within its own school level. Used by the CHECK constraint on share_posts and club_posts.';

-- Shared updated_at maintenance for the post tables.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
