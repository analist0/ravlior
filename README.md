# Or HaMeir — the Torah of Rabbi Lior Cohen

A Hebrew RTL site for watching, listening, browsing and asking. It includes a public library, a persistent audio player, a Q&A system with private tracking, a full CMS (CRUD, workflow, versions, audit), a module system and Supabase (Postgres/Auth/Storage with RLS).

> **Current status:** the code is complete and works in **demo mode** (no database, clearly labelled). It is not yet connected to a Supabase project and has not been deployed. Details are in [`STATUS.md`](STATUS.md).

## Stack (decision)

**React 19 + TypeScript 6 + Vite 7** (Rollup + esbuild, which ship documented android-arm64 builds), without Vite 8/Rolldown or SWC. Public pages are **pre-rendered** after the build (`scripts/prerender.ts`) with real titles/descriptions/OG for SEO. The API is a small **Node server** with web-standard handlers (`server/handlers.ts`) that runs the same way locally and in Vercel Functions. Why not Astro: to avoid a second build layer; one layer, verified here, with pre-rendering, is enough. Full reasoning is in `COMPATIBILITY.md`.

## Structure

```
src/
  shared/      logic shared by browser, server and tests (types, Hebrew search, workflow, blocks, uploads, questions)
  data/        Repository: demo-repo (in-browser, labelled) | supabase-repo (real, RLS) | seed.json (generated)
  app/ components/ pages/ player/   public site
  admin/       CMS (/admin)
  modules/     module manifest + example module (parasha-shelf)
  styles/      design tokens + CSS
server/        Node API: question submission, voice-answer signed URLs, URL probe (SSRF-guarded), user management
api/           Vercel Function entry point (uses server/handlers.ts)
supabase/migrations/   SQL: schema, workflow/audit, RLS, storage+search, public-answer guard
supabase/seed/seed.sql generated seed (public metadata only)
supabase/verify/       rls_checks.sql (runs in a transaction and rolls back) + local-shim.sql (local only)
scripts/       build-seed, seed-to-sql, prerender, env-check, termux-smoke, import-media, verify-db-local
data/research-appendix.md   the source dossier (seed input)
tests/         node:test — no native tools
docs/screenshots/           real screenshots taken with Chromium in a cloud container (demo mode)
```

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

No `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` → **demo mode**. A permanent "מצב הדגמה" (demo mode) banner is shown, data comes from the seed, and changes are saved in that browser's localStorage only. The CMS is reached by picking a demo role. This is **never** a claim that the system is connected.

## Connecting Supabase

**Status:** connected to the `or-hameir` project (`https://anofukdvpkeqmqlvglyw.supabase.co`). Migrations 000100–000600 are applied and `rls_checks.sql` passes 48/48 there. Still open: loading the seed, the first owner, and the secret key for the server. For a new project, follow these steps:

1. Create a project in Supabase (the free tier is enough to start; do not upgrade without a decision).
2. In the SQL Editor, run in order: `supabase/migrations/20260930000100_…` through `…000600_…`, then `supabase/seed/seed.sql`.
3. Run `supabase/verify/rls_checks.sql` in the SQL Editor. It rolls back at the end; every line should print `PASS`.
4. Create the first user (Authentication → Invite), then grant the owner role (one time, in the SQL Editor):
   ```sql
   begin;
   select set_config('request.jwt.claims', '{"role":"service_role"}', true);
   insert into public.user_roles (user_id, role) select id, 'owner' from auth.users where email = 'OWNER_EMAIL';
   commit;
   ```
5. Create `.env.local` from `.env.example`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (the publishable key only), and server-only `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `RATE_LIMIT_SALT`, `IMPORT_URL_ALLOWLIST`. The secret key **never** goes in a `VITE_` variable; `src/app/config.ts` refuses to run if a secret key reaches the browser.
6. Authentication → URL Configuration: add the site address (and `http://127.0.0.1:5173` for development).

## Media

Priority: official embed (YouTube only, `youtube-nocookie`, loaded on click) → authorised direct URL → our own file in Storage → link to the source. No YouTube extraction, no DRM/login bypass, no crawling. Large uploads go straight from the browser to Storage (TUS, 6MB chunks) and never through our server. For authorised files from an external source: `scripts/import-media.ts` is resumable, with a manifest, retries, a checksum and SSRF protection. It runs on the phone and does not promise 24/7 operation.

## Deploy — end of the project only

Not deployed. When instructed: connect the repository to Vercel, set the environment variables (public `VITE_*` + server-only), build command `npm run build`, output `dist`. Security headers and redirects are in `vercel.json`. Setting `VITE_SITE_URL` produces canonical URLs and a sitemap.

## Documents

[STATUS](STATUS.md) · [COMPATIBILITY](COMPATIBILITY.md) · [DESIGN_SYSTEM](DESIGN_SYSTEM.md) · [MODULES](MODULES.md) · [TEST_REPORT](TEST_REPORT.md) · [BACKUP_RESTORE](BACKUP_RESTORE.md)
