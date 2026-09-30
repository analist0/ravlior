# BACKUP_RESTORE

## What needs backing up
1. **Postgres** (all tables in `public`, including private questions and the audit log).
2. **Storage** (the `public-media`, `public-books`, `private-submissions`, `private-drafts` buckets).
3. **Code and migrations**: in Git. The seed can be regenerated from `data/research-appendix.md` (`npm run seed`).

## Backing up the DB
- **Supabase managed backups:** daily on paid plans (check the current plan; the free tier does not guarantee point-in-time restore). Do not upgrade without a decision.
- **Your own backup (recommended, any plan):** from a computer with `pg_dump` and the connection string (Project Settings → Database). Not from the phone if Postgres client tools are not installed there.
  ```sh
  pg_dump "$DATABASE_URL" --schema=public --no-owner --no-privileges -Fc -f or-hameir-$(date +%F).dump
  ```
  The file contains **private questions**: store it encrypted (e.g. `age`/`gpg`) and not in Git.
- **Partial content export from the CMS:** Admin → Import & export → "Download export" (JSON of public content and structure, **without** private questions, users or audit). Useful for moving content, not a full backup.

## Backing up Storage
Public files can be downloaded by a list script (Storage API list + download) or from the Dashboard. Private files need the secret key and must run in a trusted environment only. Record the checksum next to each file (`media_sources.checksum` for files imported via `import-media`).

## Restore
1. A new/empty project → run the migrations in order (`supabase/migrations/*.sql`).
2. `pg_restore --data-only --disable-triggers -d "$DATABASE_URL" or-hameir-YYYY-MM-DD.dump` (`--disable-triggers` so versioning/audit do not change rows during the restore; requires suitable privileges).
3. Upload the Storage files to the same paths (paths are recorded in `media_sources.storage_path` / `answer_audio_path`).
4. Run `supabase/verify/rls_checks.sql` (rolls back automatically) to confirm permissions.
5. Rebuild the site (`npm run build`) so the pre-rendered pages reflect the data.

## Deleting private data
- Deleting a question at the asker's request: in the SQL Editor (admin), `delete from public.question_submissions where tracking_code = '…'`. If there is a voice answer, also delete the file from `private-submissions`. A public copy (`public_questions`) is separate and edited: move it to trash or delete it in the CMS if it must be removed.
- Deleting a public file: delete it from the bucket **and** remove the source row. A public file stays reachable by URL until the file itself is deleted.
