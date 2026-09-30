# TEST_REPORT — 30.09.2026

**Environment for all results below:** a Linux x86_64 cloud container, Node 22.22.2, Chromium 1194 (Playwright), PostgreSQL 16.13. **Not a phone and not Termux** (see COMPATIBILITY.md). **No live Supabase project**: the DB checks ran on local Postgres with a minimal shim for auth/storage/roles (`supabase/verify/local-shim.sql`). This is strong evidence for the SQL logic, but it does **not** replace running `rls_checks.sql` against the real project.

| layer | command | result |
|---|---|---|
| TypeScript | `npm run typecheck` | ✔ no errors (strict, noUncheckedIndexedAccess) |
| Unit + integration (mocks) | `npm test` | ✔ **48/48** |
| DB: migrations + seed + RLS/workflow/storage | `PGHOST=… sh scripts/verify-db-local.sh` | ✔ **48/48 PASS** (local PG16 + shim) |
| Build + prerender | `npm run build` | ✔ 3.2s, 249 static pages |
| Browser E2E + axe | `node tests/e2e/smoke.mjs` (demo mode, production preview) | ✔ **17/17** |

## What is covered

**DB (`supabase/verify/rls_checks.sql`, rolls back at the end):** anon cannot read private questions, audit or revisions; anon sees published only (including media sources of drafts); anon cannot write content or upload; a viewer's update is filtered out; an editor cannot create an already-published item, approve, delete permanently, grant roles, read the audit log, or upload a voice answer; a stale version is rejected (optimistic concurrency, 40001); every update is saved as a revision; a reviewer approves and publishes; an editor or reviewer cannot approve an answer in the rabbi's name; only the rabbi approves (approved_by is recorded); no publishing without consent; tracking with a wrong token returns nothing, and the text is returned only after delivery; an editor cannot create a public answer marked "approved by the rabbi"; permanent delete only after soft delete, admins only; an admin cannot grant owner; an owner cannot remove their own owner role; the audit log contains no private question text or token material; unsafe storage paths are rejected; `he_normalize` matches the JS; the seed contains 182 distinct YouTube IDs.

**Unit (`tests/`):** seed counts (254/182/80/87/2/5/8/41, no unassigned URLs, all 169 titles byte-identical to the dossier, no invented dates, the two separate "ימי מלך" books, note_only attribution, candidates not published, duplicates grouped rather than merged); canonicalisation and YouTube IDs; iframe allowlist; Hebrew normalisation and search; role matrix for content and questions; block sanitisation (HTML/script/iframe/javascript:/SVG); upload policy (MIME sniffing, extension≠content, sizes, file names, parity with the SQL path rule, expired signed URLs); SSRF (private/loopback/link-local/metadata/IPv6/mapped, https/443/credentials/allowlist, DNS lookup at connect time); importer dedupe; published-only queries and draft isolation; the module contract; the demo repository (CRUD persisting after reload, concurrency, trash/restore/permanent delete, the full question flow, honeypot/timing, roles); the API with a **marked** mock client (hash-only storage, raw IP not stored, 429/413/422/503, voice answer with token verification and a 5-minute signed URL, probe requires staff, users requires admin); the resumable import job (resume from a partial file, backoff, checksum, rejecting unapproved/oversize/HTML, stopping after 4 retries).

**Browser (Chromium, demo mode):** no horizontal overflow at 360/390/768/1440 on 14 routes; **axe WCAG 2.2 A/AA — 0 violations** on 14 routes × 2 widths (28 runs); the first Tab reaches "דילוג לתוכן" (skip to content); `prefers-reduced-motion` zeroes the motion tokens and no transforms are rendered; the search panel opens with `/`, returns Hebrew results, and Escape closes it; filters are preserved in the URL across reload and pagination; the YouTube iframe does not load before a click and only `youtube-nocookie` loads afterwards; question → private tracking link (fragment) → the secret is stripped from the address bar; the CMS: editor creates → sends to review (no publish button for an editor) → reviewer approves and publishes → persists after reload → appears in the public library search; no console errors.

Real screenshots (not mock-ups): `docs/screenshots/*.png` · raw report: `docs/e2e-report.json`.

## Not tested / pending

- **Termux on the phone:** install, native binaries, dev/HMR, build and preview (`scripts/termux-smoke.sh`).
- **A real Supabase project:** `rls_checks.sql` in the SQL Editor, Auth sign-in/sign-out, real upload (standard and TUS), signed URLs, the question endpoint against REST, `auth.role()` behaviour in the SQL Editor.
- The persistent audio player with a real MP3 file (the seed has no native audio file, because the audio was not extracted). The UI and queue are built; playback, resume and Media Session were not tested with a file.
- Screen readers (TalkBack / NVDA): not tested. axe is automated only.
- Performance (LCP/INP/CLS) on a defined profile and slow network: **not measured**, so no numbers are reported. Targets: LCP ≤2.5s, INP ≤200ms, CLS ≤0.1.
- Deployment to Vercel (Hebrew paths with cleanUrls, the Function, CSP): not deployed, by instruction.
