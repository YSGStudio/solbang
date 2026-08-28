-- Migration 7 (T19): cumulative carbon saving per user.
-- Requirements: R17  |  Acceptance: AC10
--
-- Only `completed` posts count. A reserved post contributes nothing.
-- security_invoker so RLS on share_posts still applies; combined with the
-- share_posts select policy this means a user only ever sees rows they are
-- allowed to see. There is no leaderboard by design (Non-Goals).
create or replace view public.user_carbon_totals
with (security_invoker = true) as
select
  p.author_id                        as user_id,
  coalesce(sum(p.carbon_g), 0)::bigint as total_carbon_g,
  count(*)::bigint                   as completed_count
from public.share_posts p
where p.status = 'completed'
group by p.author_id;

comment on view public.user_carbon_totals is
  'R17: sum of carbon_g over the user''s completed share posts.';
