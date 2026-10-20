#!/bin/sh
# Applies Neon migrations + seed + row-count and RLS checks to a THROWAWAY local Postgres.
# Usage: PGPORT=5432 sh scripts/verify-db-local.sh
# The SQL in neon/ is what to apply to the Neon project (in this order). Do not point this at Neon.
set -eu
DB=${VERIFY_DB:-or_verify}
PSQL=${PSQL:-psql}
export PGOPTIONS="-c client_min_messages=warning"
$PSQL -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists \"$DB\"" -c "create database \"$DB\""
for f in neon/migrations/*.sql; do
  echo "apply $f"
  $PSQL -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f"
done
echo "apply neon/seed.sql"
$PSQL -v ON_ERROR_STOP=1 -q -d "$DB" -f neon/seed.sql
echo "row counts"
PGOPTIONS="-c client_min_messages=notice" $PSQL -v ON_ERROR_STOP=1 -q -d "$DB" -f neon/verify/row_counts.sql
echo "rls checks"
PGOPTIONS="-c client_min_messages=notice" $PSQL -v ON_ERROR_STOP=1 -q -At -d "$DB" -f neon/verify/rls_checks.sql 2>&1 | grep -E "PASS|FAIL|ERROR"
