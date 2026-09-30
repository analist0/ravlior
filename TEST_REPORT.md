# TEST_REPORT — 30.09.2026

**Environment for all results below:** a Linux x86_64 cloud container, Node 22.22.2, Chromium 1194 (Playwright), PostgreSQL 16.13. **Not a phone and not Termux** (see COMPATIBILITY.md). **DB logic** was first verified on local Postgres with a minimal shim for auth/storage/roles (`supabase/verify/local-shim.sql`); since 30.09.2026 it is **also verified on the real Supabase project** `or-hameir` (rows marked below).

| layer | command | result |
|---|---|---|
| TypeScript | `npm run typecheck` | ✔ no errors (strict, noUncheckedIndexedAccess) |
| Unit + integration (mocks) | `npm test` | ✔ **48/48** |
| DB: migrations + seed + RLS/workflow/storage | `PGHOST=… sh scripts/verify-db-local.sh` | ✔ **48/48 PASS** (local PG16 + shim) |
| DB on the real Supabase project (`or-hameir`) | `rls_checks.sql` via the Supabase connector (rolls back) | ✔ **48/48 PASS**, 0 rows left afterwards |
| Connected site | Chromium against the production preview with the publishable key | ✔ REST/RPC 200, no demo banner, real login screen |
| Seed import — remote vs local | `scripts/seed-rowhash.sql` on both | ✔ **14/14 tables identical** (full-row md5); users 0 / roles 0 unchanged |
| Permissions as anonymous visitor (live) | REST + RPC with the publishable key | ✔ 209 items, 0 drafts, 0 rows in private tables, writes rejected (see below) |
| Site on live data | `node tests/e2e/live-supabase.mjs` (production preview) | ✔ **28/28** (2nd run: 2 retries after sandbox-proxy `ERR_TOO_MANY_RETRIES`, reported by the script) |
| Build + prerender | `npm run build` | ✔ 243 pages generated **from Supabase** (209 items + 15 topics + 5 series + 4 CMS pages + 10 root), 0 drafts |
| Browser E2E + axe | `node tests/e2e/smoke.mjs` (demo mode, production preview) | ✔ **17/17** |

## What is covered

**DB (`supabase/verify/rls_checks.sql`, rolls back at the end):** anon cannot read private questions, audit or revisions; anon sees published only (including media sources of drafts); anon cannot write content or upload; a viewer's update is filtered out; an editor cannot create an already-published item, approve, delete permanently, grant roles, read the audit log, or upload a voice answer; a stale version is rejected (optimistic concurrency, 40001); every update is saved as a revision; a reviewer approves and publishes; an editor or reviewer cannot approve an answer in the rabbi's name; only the rabbi approves (approved_by is recorded); no publishing without consent; tracking with a wrong token returns nothing, and the text is returned only after delivery; an editor cannot create a public answer marked "approved by the rabbi"; permanent delete only after soft delete, admins only; an admin cannot grant owner; an owner cannot remove their own owner role; the audit log contains no private question text or token material; unsafe storage paths are rejected; `he_normalize` matches the JS; the seed contains 182 distinct YouTube IDs.

**Unit (`tests/`):** seed counts (254/182/80/87/2/5/8/41, no unassigned URLs, all 169 titles byte-identical to the dossier, no invented dates, the two separate "ימי מלך" books, note_only attribution, candidates not published, duplicates grouped rather than merged); canonicalisation and YouTube IDs; iframe allowlist; Hebrew normalisation and search; role matrix for content and questions; block sanitisation (HTML/script/iframe/javascript:/SVG); upload policy (MIME sniffing, extension≠content, sizes, file names, parity with the SQL path rule, expired signed URLs); SSRF (private/loopback/link-local/metadata/IPv6/mapped, https/443/credentials/allowlist, DNS lookup at connect time); importer dedupe; published-only queries and draft isolation; the module contract; the demo repository (CRUD persisting after reload, concurrency, trash/restore/permanent delete, the full question flow, honeypot/timing, roles); the API with a **marked** mock client (hash-only storage, raw IP not stored, 429/413/422/503, voice answer with token verification and a 5-minute signed URL, probe requires staff, users requires admin); the resumable import job (resume from a partial file, backoff, checksum, rejecting unapproved/oversize/HTML, stopping after 4 retries).

**Browser (Chromium, demo mode):** no horizontal overflow at 360/390/768/1440 on 14 routes; **axe WCAG 2.2 A/AA — 0 violations** on 14 routes × 2 widths (28 runs); the first Tab reaches "דילוג לתוכן" (skip to content); `prefers-reduced-motion` zeroes the motion tokens and no transforms are rendered; the search panel opens with `/`, returns Hebrew results, and Escape closes it; filters are preserved in the URL across reload and pagination; the YouTube iframe does not load before a click and only `youtube-nocookie` loads afterwards; question → private tracking link (fragment) → the secret is stripped from the address bar; the CMS: editor creates → sends to review (no publish button for an editor) → reviewer approves and publishes → persists after reload → appears in the public library search; no console errors.

Real screenshots (not mock-ups): `docs/screenshots/*.png` · raw report: `docs/e2e-report.json`.

## Content import (30.09.2026)

**Why 216.** Every item is derived from a dossier row (stored in `provenance`):

| dossier section | content | items |
|---|---|---|
| יא | active channel: 80 video + 87 short + 2 live | 169 |
| יב | legacy channel (ownership unverified → draft) | 5 |
| ב | 6 YouTube, 2 ykr video pages, 1 ykr series archive, 1 or-breslev candidate (→ draft) | 10 |
| יג | 2 new videos (the other 6 merged into ב records; these 2 merged with ד35/36) | 2 |
| ד20–34 | hm-news text articles | 15 |
| ג, יד | Kol Barama audio pages | 2 |
| ה | answers (one note_only) | 3 |
| ז | books (one without a source → draft) | 5 |
| ז + יד | leaflet PDFs | 5 |
| | **total** | **216** |

8 records merge several dossier rows. **182 YouTube IDs are not 182 lessons:** 26 duplicate groups cover 52 items (long + Short of the same clip); among the rest are wedding/chuppah clips, a blessing by Rabbi Ovadia (not a lesson), a podcast hosted by someone else and 24 "אור הנאמן" radio episodes. 34 items have no video. Attribution: title names the rabbi 164, source page 36, channel only 10, other speaker 1, note only 1, not author 4.

**Counts (remote = local):** content 216 (published 209 / draft 7), media_sources 223, content_topics 288, topics 15, series 5, series_items 69, book_details 10, institutions 4, events 19 (1 draft), source_archives 11, pages 5, menus 2, homepage_sections 8, modules 9. Duplicates: 0 duplicate YouTube IDs, 0 duplicate slugs, 0 orphan sources; 1 item without a source (a draft).

**Idempotency (local):** import → CMS edit + role grant → import twice more ⇒ identical counts, the edit and the role survive; the only fingerprint change is the edited row.

**Live permission probes (anonymous, publishable key):** `content_items` 209 (filter `status=draft` → 0), a draft fetched by id → `[]`, its media → `[]`; `media_sources` 217 (223 − 6 belonging to drafts); `content_topics` 285; `events` 18; `question_submissions`, `public_questions`, `profiles`, `site_settings`, `rate_limits`, `user_roles`, `audit_log`, `revisions` → 0 rows each; INSERT into `content_items` / `question_submissions` → 401 `42501`; PATCH of a published title → no row changed (title verified unchanged). Caveat: the private tables are currently empty, so "0 rows" here is weak evidence on its own — the strong evidence is `rls_checks.sql` 48/48 on the same project with rolled-back test data.

## Security advisor — the 7 remaining warnings

All 7 are `SECURITY DEFINER` functions callable by `anon` / `authenticated` via `/rest/v1/rpc/…` (the advisor lists each one twice, once per role). Evidence below is from live calls as an anonymous visitor on 30.09.2026.

| # | function | why it exists | what an attacker gets (tested) | residual risk |
|---|---|---|---|---|
| 1 | `has_role(roles[])` | RLS policies need to read `user_roles`; a definer function avoids recursive RLS on that table | only the **caller's own** roles (`auth.uid()`, no user parameter). Anon → `false` for every role | none beyond self-disclosure, which the `user_roles` select policy already allows |
| 2 | `is_staff()` | wrapper over `has_role` used in policies | anon → `false` | same as #1 |
| 3 | `can_edit()` | same | anon → `false` | same as #1 |
| 4 | `can_review()` | same | anon → `false` | same as #1 |
| 5 | `is_admin()` | same | anon → `false` | same as #1 |
| 6 | `content_is_public(cid)` | lets child tables (media, topics, series items) inherit visibility of their item without RLS joins | published id → `true`; **draft id → `false`; non-existent id → `false`** — identical answers, so it does not reveal that a draft exists | none found |
| 7 | `track_question(code, token)` | public tracking of a question without an account | requires a token ≥ 32 chars, compares its SHA-256 hash; wrong code, wrong token and unknown code all return the same `[]` (no oracle); the answer is returned only after the rabbi's approval and delivery | **no DB-level rate limit** on this RPC: brute force is infeasible (256-bit token) but repeated calls can cost load (DoS); only Supabase platform limits apply today |

INFO: `rate_limits` has RLS with no policy — intentional: it is written only by `hit_rate_limit`, whose EXECUTE is revoked from anon/authenticated (server/service role only). Live anon read → 0 rows.

**Why "intentional" is not the whole answer — open hardening options (not applied, need your decision):**
1. Move #1–#6 to a non-exposed `private` schema (policies call `private.has_role(...)`). Removes them from the REST API and from the advisor; needs a migration touching every policy + a re-run of `rls_checks.sql`.
2. Add a per-tracking-code attempt limit inside `track_question` (via `hit_rate_limit`), or route tracking through the Node endpoint that already rate-limits. Mitigates the DoS item in #7.

## Not tested / pending

- **Termux on the phone:** install, native binaries, dev/HMR, build and preview (`scripts/termux-smoke.sh`).
- **Real CMS CRUD on Supabase + persistence after refresh:** blocked — no authorised user exists and none may be created by me. The same flow passes in demo mode (above). "CMS content appears on public pages" is therefore proven in demo mode and through the DB-driven pre-render, not with a real Supabase edit.
- **Supabase:** real Auth sign-in/sign-out, real upload (standard and TUS), signed URLs, and the question endpoint against REST (waiting for the secret key and a first user).
- The persistent audio player with a real MP3 file (the seed has no native audio file, because the audio was not extracted). The UI and queue are built; playback, resume and Media Session were not tested with a file.
- Screen readers (TalkBack / NVDA): not tested. axe is automated only.
- Performance (LCP/INP/CLS) on a defined profile and slow network: **not measured**, so no numbers are reported. Targets: LCP ≤2.5s, INP ≤200ms, CLS ≤0.1.
- Deployment to Vercel (Hebrew paths with cleanUrls, the Function, CSP): not deployed, by instruction.
