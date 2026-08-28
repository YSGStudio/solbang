-- Table grants. Supabase applies these automatically; the throwaway cluster
-- does not, and without them RLS never even gets consulted.
grant select, insert, update, delete on all tables in schema public
  to authenticated, service_role;
grant select on all tables in schema public to anon;
grant execute on all functions in schema public
  to anon, authenticated, service_role;
grant usage, select on all sequences in schema public
  to anon, authenticated, service_role;
