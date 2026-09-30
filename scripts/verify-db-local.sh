#!/bin/sh
# Applies shim + migrations + seed + RLS checks to a THROWAWAY local Postgres (not Supabase).
# Usage: PGHOST=/var/tmp/orpg PGPORT=54329 PGUSER=postgres sh scripts/verify-db-local.sh
set -eu
DB=${VERIFY_DB:-or_verify}
export PGOPTIONS="-c client_min_messages=warning"
psql -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f supabase/verify/local-shim.sql
for f in supabase/migrations/*.sql; do
  echo "apply $f"
  psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f"
done
if [ -f supabase/seed/seed.sql ]; then echo "apply seed"; psql -v ON_ERROR_STOP=1 -q -d "$DB" -f supabase/seed/seed.sql; fi
echo "run rls checks"
PGOPTIONS="-c client_min_messages=notice" psql -v ON_ERROR_STOP=1 -q -At -d "$DB" -f supabase/verify/rls_checks.sql 2>&1 | grep -E "PASS|FAIL|ERROR"
