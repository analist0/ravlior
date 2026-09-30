# STATUS — 30.09.2026

## Completed (in code, with tests in the cloud environment)
- **Stack and gate:** React 19 + TS 6 + Vite 7 (Rollup/esbuild with documented android-arm64 builds), no SWC/Rolldown/sharp. Env check, dependency matrix and a Termux smoke script.
- **DB:** 5 migrations: schema with FK/constraints/indexes/enums/`unique(provider, provider_id)`; content and question workflows enforced by triggers; optimistic concurrency (version); revisions; a protected audit log; RLS on every table; storage buckets with limits and policies; Hebrew search (normalisation + FTS/trigram); a guard against faking "approved by the rabbi". Checked 48/48 on local Postgres.
- **Seed:** every row of the dossier. 216 content items, 223 sources, 11 archives, 19 events, 4 institutions, 15 topics (suggested automatically from titles and labelled as such), 5 system series (labelled "built on this site"). The audit matches: 254 URLs, 182 video IDs, 80/87/2, 5, 8, 41.
- **Public site:** home (sections chosen in the CMS), library (search, type, topic, series, source, sort, grid/list, pagination, all in the URL), lesson page (player by priority, attribution, sources and rights, bookmark, share, related, duplicate versions), series, topics, books/leaflets (with a clear "ימי מלך" distinction), Q&A, ask the rabbi (anonymous, separate consent, secret token in a fragment), tracking (text and voice), rabbi and institutions (sourced only), sources, favourites / continue learning, accessibility/privacy/terms/contact pages, 404, the persistent player (queue, resume, speed, Media Session), light/dark, reduced motion, text size.
- **CMS:** Supabase Auth or a demo role; full CRUD for content, series (order), topics, pages, institutions, events and the public Q&A; block editor (whitelist) with a responsive preview; draft → in_review → approved → published → archived; trash/restore/permanent delete; duplication; revision history and loading a version into the form; version conflicts with a clear message; bulk actions with preview and confirmation; the question inbox with the full flow, rabbi approval, a private voice answer and consent-gated publishing; menus; home builder; modules (with dependency validation); users and roles; audit log; media (TUS uploads with progress/cancel, short signed links, URL probe); CSV/JSON import with dedupe and preview, and export.
- **Server:** question submission (validation, honeypot, timing, rate limits in memory + DB, token hash only, logs without content), voice answer (token verification, 5-minute signed URL), SSRF-guarded probe, users/invites (admin only). The same handlers run locally and on Vercel.
- **SEO:** 249 pre-rendered pages with title/description/OG, and a BreadcrumbList only where the data is real; robots; a sitemap and canonical URLs when `VITE_SITE_URL` is set; noindex on admin/track/favourites.
- **Import job:** `scripts/import-media.ts`, resumable, for authorised files only.

## Supabase — connected (30.09.2026)
- Project **or-hameir** (`anofukdvpkeqmqlvglyw`, eu-central-1, free plan, organisation lavi). Created new at your request; the 3 existing paused projects were not touched.
- All 6 migrations applied (000100–000600, including the hardening migration after the security advisor).
- `rls_checks.sql` ran **on the real project: 48/48 PASS**, inside a transaction that rolled back. Afterwards the project has 0 users and 0 content rows, so no test data was left.
- Security advisor: 7 warnings + 1 INFO remain. Each one is explained with live evidence in TEST_REPORT.md → "Security advisor — the 7 remaining warnings". They are not declared "fine" by intent alone; two follow-up hardening options are listed there.
- The public site connects successfully with the publishable key (no demo banner; REST/RPC calls return 200). `.env.local` holds only the public values and is excluded from Git.

## Content import into Supabase — done (30.09.2026)
- **216 items from the dossier** (section breakdown in TEST_REPORT.md). 182 unique YouTube IDs ≠ 182 lessons: 26 duplicate groups (long + Short of the same clip), plus non-lesson items (blessing, weddings, a podcast hosted by someone else, radio episodes).
- **Published 209, draft 7.** Rule: published only if `verification = located` AND at least one source. Drafts: 5 legacy-channel items (ownership unverified), 1 or-breslev candidate, 1 book with no source (אגרות הנאמ״ן). Missing fields were left empty, not invented.
- **Provenance and verification status on every item** (`provenance` = dossier section/row, `verification`, `attribution_status`).
- **Metadata and links only** — no media downloaded.
- **Idempotent:** stable sha1-derived UUIDs; insert-only with `ON CONFLICT DO NOTHING`. Proven locally: re-running twice after a CMS edit and a role change left counts unchanged and kept the edit and the role.
- **Verified byte-for-byte:** `scripts/seed-rowhash.sql` gives identical full-row hashes remote vs local for all 14 tables. `auth.users` = 0 and `user_roles` = 0 before and after (no users/roles touched).
- **Permissions checked live as an anonymous visitor** (REST with the publishable key): 209 items, 0 drafts, 217 media rows (drafts' sources hidden), 0 rows in every private table, writes rejected by RLS.
- **Site on live data:** `tests/e2e/live-supabase.mjs` — 28/28 (library, 10 filters, search incl. Hebrew normalisation, item page, YouTube player, drafts unreachable, series/topics/books/responsa/institutions/about/sources).
- **Pre-render from the DB:** 243 pages = 209 items + 15 topics + 5 series + 4 CMS pages + 10 root pages; no page for any draft. Vite empties `dist/` on every build, so a removed/unpublished item leaves no stale page.
- **Bug fixed while testing:** after a failed load the library counter said "0 פריטים" next to the error; it now says "הטעינה נכשלה".
- **Homepage banner:** the image you sent is shown at the top of the homepage (WebP 32/78KB instead of a 1.8MB PNG; the original is in `docs/brand/`).

## Blocked / waiting for your decision or details
- **Real CMS CRUD after refresh on Supabase:** blocked — there is no authorised user and I do not create users. Verified only in demo mode (see TEST_REPORT). Consequently "content added via the CMS appears on public pages" is verified in demo mode and via the pre-render pipeline, not with a real Supabase edit.
- **Secret key for the Node server:** not available through the connector. Question submission, voice answers, URL probe and user management need `SUPABASE_SECRET_KEY` in `.env.local` (from Project Settings → API Keys). Until then, question submission returns 503 (no fake success).
- **First owner:** needs a real user (Auth → Invite) and then the one-time SQL from the README.
- **Deployment:** not done, by instruction.
- **Content that must come from the rabbi's office:** an official photo, an approved biography, the preferred spelling of titles, official contact details, class schedules, verification of YouTube channel ownership, permission to use media, the "ימי מלך" file. None of these were invented; the pages say what is missing.

## Unverified (no false claims)
- **Termux on the phone:** has not run. `scripts/termux-smoke.sh` is ready.
- **Supabase:** RLS/workflow checked on the real project. Not yet run live: real Auth sign-in, TUS uploads, signed URLs, and the Node endpoints (waiting for the secret key).
- **Audio playback of a real file**, screen readers, and performance metrics (not measured, so no numbers).
- **Vercel:** the build config, CSP and cleanUrls with Hebrew paths were not tested in deployment.

## Known limitations
- Content published in the CMS is visible to users immediately (fetched from the DB), but the **pre-rendered HTML for crawlers updates on the next build/deploy**. A Vercel deploy hook can be triggered after publishing.
- Hebrew search does character normalisation only (niqqud, geresh, final letters) and does **not** do morphological analysis (e.g. prefixes such as ו/ה/ב).
- The "newest" order is the order of items in the channel (not a recording date, which is unknown). Upload dates were not extracted.
- Topics were suggested automatically from title keywords. Editorial review in the CMS is recommended.
- The demo repository keeps its data in one browser's localStorage. Uploads in demo mode live in memory until refresh.
