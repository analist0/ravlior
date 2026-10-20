# Or HaMeir — the Torah of Rabbi Lior Cohen

A Hebrew RTL site for watching, listening, browsing and asking. It includes a public library, a persistent audio player, a Q&A system with private tracking, a full CMS (CRUD, workflow, versions, audit), a module system, and Postgres (Neon) with row-level security enforced through the server API.

> **Current status:** the code works in **demo mode** (no database, clearly labelled) and, when configured, against Postgres. SQL was verified on a local Postgres 18. It has **not** been applied to the Neon project and has not been deployed. Details are in [`STATUS.md`](STATUS.md).

## Stack (decision)

**React 19 + TypeScript 6 + Vite 7** (Rollup + esbuild, which ship documented android-arm64 builds), without Vite 8/Rolldown or SWC. Public pages are **pre-rendered** after the build (`scripts/prerender.ts`) with real titles/descriptions/OG for SEO. The API is a small **Node server** with web-standard handlers (`server/handlers.ts`) that runs the same way locally and in Vercel Functions. Why not Astro: to avoid a second build layer; one layer, verified here, with pre-rendering, is enough. Full reasoning is in `COMPATIBILITY.md`.

The browser talks only to `/api`. Postgres credentials stay on the server (`DATABASE_URL`). Neon hosts use `@neondatabase/serverless`; localhost uses `pg`.

## Structure

```
src/
  shared/      logic shared by browser, server and tests (types, Hebrew search, workflow, blocks, uploads, questions)
  data/        Repository: demo-repo (in-browser, labelled) | api-repo (cookie session, /api) | seed.json (generated)
  app/ components/ pages/ player/   public site
  admin/       CMS (/admin)
  modules/     module manifest + example module (parasha-shelf)
  styles/      design tokens + CSS
server/        Node API: Postgres, sessions, media, question submission, URL probe, user invites
api/           Vercel Function entry point (uses server/handlers.ts)
neon/migrations/   SQL: schema, workflow/audit, RLS, storage+search, public-answer guard, grants
neon/seed.sql      generated seed (public metadata only, stable UUIDs)
neon/verify/       rls_checks.sql (rolls back) + row_counts.sql
scripts/       build-seed, seed-to-sql, prerender, env-check, termux-smoke, import-media, verify-db-local
data/research-appendix.md   the source dossier (seed input)
tests/         node:test — no native tools
docs/screenshots/           real screenshots taken with Chromium in a cloud container (demo mode)
```

`supabase/` is the previous target. Apply `neon/` only.

## Commands (Termux — **require on-device checking**, see COMPATIBILITY.md)

```sh
pkg install nodejs-lts git          # Node >= 22.18
cd ~ && git clone <repo> or-hameir && cd or-hameir
npm run env:check                   # read-only: arch/platform/versions/disk/memory, no secrets
npm ci
npm run dev                         # http://127.0.0.1:5173 in Chrome on the phone
npm run api                         # (second tab) http://127.0.0.1:8787 — Vite forwards /api to it
npm run typecheck && npm test
npm run build && npm run preview    # http://127.0.0.1:4173
sh scripts/termux-smoke.sh          # the full compatibility gate + log
```

Seed regeneration (after changing the dossier): `npm run seed`.

## Demo mode vs. connected

Leave `VITE_DATA_MODE` unset → **demo mode**. A permanent "מצב הדגמה" (demo mode) banner is shown, data comes from the seed, and changes are saved in that browser's localStorage only. The CMS is reached by picking a demo role. This is **never** a claim that the system is connected.

Set `VITE_DATA_MODE=api` only when the server has `DATABASE_URL` and `AUTH_SECRET`. The browser then calls `/api` with an httpOnly session cookie.

## Loading Postgres (Neon)

The target database is the empty Neon project `ravlior` (id `frosty-mode-58590842`, region `aws-eu-central-1`, Postgres 18, database `ravlior`). This repository does **not** apply the SQL there. Apply it yourself, in order, on an empty database:

1. `neon/migrations/001_schema.sql`
2. `neon/migrations/002_workflow.sql`
3. `neon/migrations/003_rls.sql`
4. `neon/migrations/004_search.sql`
5. `neon/migrations/005_public_answer.sql`
6. `neon/migrations/006_grants.sql`
7. `neon/migrations/009_media_hall.sql`
8. `neon/seed.sql`

Then, optionally, `neon/verify/row_counts.sql` and `neon/verify/rls_checks.sql`. The checks run in a transaction and roll back. Every line should print `PASS`.

Local check (throwaway database, not Neon): `sh scripts/verify-db-local.sh`.

### First owner

There is no mailer. Create the first owner once in SQL (replace the email and choose a password; the email must already be lowercase). Do not commit the password.

```sql
begin;
select set_config('app.actor', 'service', true);
insert into public.app_users (email, password_hash, display_name)
values ('owner@example.com', extensions.crypt('CHOOSE-A-PASSWORD', extensions.gen_salt('bf')), 'בעלים');
insert into public.profiles (id, display_name)
select id, display_name from public.app_users where email = 'owner@example.com';
insert into public.user_roles (user_id, role)
select id, 'owner' from public.app_users where email = 'owner@example.com';
commit;
```

Later staff are invited from the CMS. The one-time link (`/accept?token=…`) is shown in the admin UI; it is not emailed.

### Environment

Copy `.env.example` to `.env.local`. Server-only: `DATABASE_URL`, `AUTH_SECRET` (at least 16 characters), `RATE_LIMIT_SALT`, `IMPORT_URL_ALLOWLIST`. Public: `VITE_DATA_MODE=api`, `VITE_SITE_URL`, `VITE_API_BASE`. `src/app/config.ts` refuses to run if a database URL or secret is placed in a `VITE_` variable.

Sessions are an httpOnly cookie (`or_session`). Authorization is `SET LOCAL ROLE app_anon` or `app_api` plus `app.user_id`, so anonymous visitors see published rows only. The table owner is used only for login, invites, question intake, rate limits, and assembling uploads.

## Media

Priority: official embed (YouTube only, `youtube-nocookie`, loaded on click) → authorised direct URL → our own file in Postgres storage → link to the source. No YouTube extraction, no DRM/login bypass, no crawling. Browser uploads are chunked to `/api/media/upload` (about 1.5MB). Private voice answers are served with a short HMAC URL (`AUTH_SECRET`, 300 seconds). Public buckets stream without a signature. For authorised files from an external source: `scripts/import-media.ts` is resumable, with a manifest, retries, a checksum and SSRF protection. It runs on the phone and does not promise 24/7 operation.

## Deploy — end of the project only

Not deployed. When instructed: connect the repository to Vercel, set the environment variables (public `VITE_*` + server-only), build command `npm run build`, output `dist`. Security headers and redirects are in `vercel.json`. Setting `VITE_SITE_URL` produces canonical URLs and a sitemap. If `DATABASE_URL` is present at build time, pre-render reads published rows from Postgres; if the query fails, the build fails.

## Documents

[STATUS](STATUS.md) · [COMPATIBILITY](COMPATIBILITY.md) · [DESIGN_SYSTEM](DESIGN_SYSTEM.md) · [MODULES](MODULES.md) · [TEST_REPORT](TEST_REPORT.md) · [BACKUP_RESTORE](BACKUP_RESTORE.md)
