# AGENTS.md — working in this repository

- Hebrew RTL product. UI text in Hebrew; code/comments in English.
- Must stay buildable on **Android Termux**: no SWC, sharp, lightningcss, Rolldown/Vite 8, TypeScript 7 (native), Docker, Supabase CLI or other native-only tools. Check `COMPATIBILITY.md` before adding a dependency; pin exact versions.
- Scripts and tests are `.ts` run directly by Node ≥ 22.18 (type stripping): use `import … from './x.ts'` and erasable TS only (no enums/parameter properties).
- Never invent facts about the rabbi (titles, bio, dates, quotes, contacts). Seed data comes only from `data/research-appendix.md` via `npm run seed`.
- Security is enforced in SQL (RLS + triggers). UI checks in `src/shared/workflow.ts` mirror them — change both and extend `supabase/verify/rls_checks.sql`.
- Before committing: `npm run typecheck && npm test && npm run build`. DB changes: `scripts/verify-db-local.sh` against a throwaway Postgres.
- Never put the Supabase secret key in `VITE_*`, in Git, or in logs. Never deploy without the owner's instruction.

## Cursor Cloud specific instructions

- Demo mode is the default dev loop. With no `.env.local`, `npm run dev` (Vite, port 5173) and `npm run api` (port 8787, Vite proxies `/api`) are enough. `GET /api/health` returns `supabase: "not-configured"`, and question submission returns 503 until `SUPABASE_SECRET_KEY` is set.
- The image Node on `PATH` can be 22.14 (`/exec-daemon/node`), which is below `engines.node` (`>=22.18`). A current Node 22 is already under `~/.nvm/versions/node/`. Put that `bin` ahead of `/exec-daemon` before `npm test`, `npm run build`, or `npm run api` (`--env-file-if-exists` and type stripping).
- Do not install Docker or the Supabase CLI for day-to-day work. Database checks stay in `scripts/verify-db-local.sh` against a throwaway Postgres, only when SQL changes.
