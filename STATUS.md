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

## Blocked / waiting for your decision or details
- **Supabase connection:** no project or keys. The site is in labelled **demo mode**. The connection steps are in the README. I have a Supabase connector available in this session, but I did not touch your account without explicit instruction.
- **Deployment:** not done, by instruction.
- **Content that must come from the rabbi's office:** an official photo, an approved biography, the preferred spelling of titles, official contact details, class schedules, verification of YouTube channel ownership, permission to use media, the "ימי מלך" file. None of these were invented; the pages say what is missing.

## Unverified (no false claims)
- **Termux on the phone:** has not run. `scripts/termux-smoke.sh` is ready.
- **A real Supabase project:** RLS was checked on local Postgres + shim, not in the cloud. Real Auth, TUS uploads, signed URLs and REST calls were not run live.
- **Audio playback of a real file**, screen readers, and performance metrics (not measured, so no numbers).
- **Vercel:** the build config, CSP and cleanUrls with Hebrew paths were not tested in deployment.

## Known limitations
- Content published in the CMS is visible to users immediately (fetched from the DB), but the **pre-rendered HTML for crawlers updates on the next build/deploy**. A Vercel deploy hook can be triggered after publishing.
- Hebrew search does character normalisation only (niqqud, geresh, final letters) and does **not** do morphological analysis (e.g. prefixes such as ו/ה/ב).
- The "newest" order is the order of items in the channel (not a recording date, which is unknown). Upload dates were not extracted.
- Topics were suggested automatically from title keywords. Editorial review in the CMS is recommended.
- The demo repository keeps its data in one browser's localStorage. Uploads in demo mode live in memory until refresh.
