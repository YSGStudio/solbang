#!/usr/bin/env bash
# Applies every migration to a throwaway local Postgres cluster and runs the
# constraint / RLS test suite against it.
#
# This is a stand-in for `npx supabase db reset`, which needs Docker. It proves
# the SQL in supabase/migrations/ is correct; it does not exercise Supabase Auth,
# Storage, or PostgREST.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-/opt/homebrew/opt/postgresql@17/bin}"
PGDATA="${PGDATA:-$ROOT/.pgdata}"
PGPORT="${PGPORT:-55433}"
export PATH="$PGBIN:$PATH"
export PGHOST="$PGDATA/socket"
export PGPORT

cleanup() {
  pg_ctl -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true
}

if [ ! -d "$PGDATA" ]; then
  echo "==> initdb $PGDATA"
  initdb -D "$PGDATA" -U postgres --no-sync >/dev/null
  mkdir -p "$PGDATA/socket"
fi

cleanup
trap cleanup EXIT

echo "==> starting postgres on port $PGPORT"
pg_ctl -D "$PGDATA" -o "-p $PGPORT -k $PGDATA/socket -c listen_addresses=''" -w start >/dev/null

dropdb   -U postgres --if-exists shareschool_test
createdb -U postgres shareschool_test

psql_run() { psql -U postgres -d shareschool_test -v ON_ERROR_STOP=1 -q "$@"; }

echo "==> applying test harness (auth schema + roles)"
psql_run -f "$ROOT/supabase/test-harness.sql"

echo "==> applying migrations"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "    $(basename "$f")"
  psql_run -f "$f"
done

psql_run -f "$ROOT/supabase/test-grants.sql"

echo "==> running tests"
psql -U postgres -d shareschool_test -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/rls_and_constraints.sql"

echo ""
echo "==> applying supabase/seed.sql (checks it parses and inserts cleanly)"
psql -U postgres -d shareschool_test -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/seed.sql"
psql -U postgres -d shareschool_test -v ON_ERROR_STOP=1 -c \
  "select 'seeded item_types: ' || count(*) from public.item_types;"
psql -U postgres -d shareschool_test -v ON_ERROR_STOP=1 -c \
  "select 'seeded questions: ' || count(*) from public.school_review_questions;"
