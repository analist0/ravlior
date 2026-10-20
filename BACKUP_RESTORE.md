# BACKUP_RESTORE

## What needs backing up
1. **Postgres** (all tables in `public`, including private questions, the audit log, and file bytes in `storage_objects`).
2. **Code and migrations**: in Git. The seed can be regenerated from `data/research-appendix.md` (`npm run seed`).

## Backing up the DB
- **Supabase managed backups:** daily on paid plans (check the current plan; the free tier does not guarantee point-in-time restore). Do not upgrade without a decision.
- **Your own backup (recommended, any plan):** from a computer with `pg_dump` and the connection string (Project Settings → Database). Not from the phone if Postgres client tools are not installed there.
  ```sh
  pg_dump "$DATABASE_URL" --schema=public --no-owner --no-privileges -Fc -f or-hameir-$(date +%F).dump
  ```
  The file contains **private questions**: store it encrypted (e.g. `age`/`gpg`) and not in Git.
- **Partial content export from the CMS:** Admin → Import & export → "Download export" (JSON of public content and structure, **without** private questions, users or audit). Useful for moving content, not a full backup.

## Files
Uploaded files are rows in `public.storage_objects` (`bytes` is `bytea`), so `pg_dump` of `public` includes them. Record the checksum next to imported files (`media_sources.checksum`).

## Restore
1. An empty database → run, in order: `neon/migrations/001_schema.sql` … `006_grants.sql`, then `neon/seed.sql` if you are restoring the dossier rather than a dump, then `007_qa_workflow.sql`, `008_qa_bank.sql`, `009_site_updates.sql`, `020_cms_books_events_contact.sql`, `021_media_hall.sql` and `022_search_skeleton.sql`. On a database that already has 001–006 and the seed, apply only `007`, then `008`, then 009 (site updates), 020, 021, 022.
2. `pg_restore --data-only --disable-triggers -d "$DATABASE_URL" or-hameir-YYYY-MM-DD.dump` (`--disable-triggers` so versioning/audit do not change rows during the restore; requires the table owner).
3. Run `neon/verify/rls_checks.sql` (rolls back automatically) to confirm permissions. `neon/verify/row_counts.sql` checks the dossier seed, not a later CMS dump.
4. Rebuild the site (`npm run build`) so the pre-rendered pages reflect the data.

## Deleting private data
- Deleting a question at the asker's request: as the table owner, `delete from public.question_submissions where tracking_code = '…'`. If there is a voice answer, also `delete from public.storage_objects where bucket_id = 'private-submissions' and name = '…'`. A public copy (`public_questions`) is separate and edited: move it to trash or delete it in the CMS if it must be removed.
- Deleting a public file: delete the `storage_objects` row **and** the `media_sources` row. A public file stays reachable by URL until the object row is deleted.
