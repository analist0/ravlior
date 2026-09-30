# AGENTS.md — working in this repository

- Hebrew RTL product. UI text in Hebrew; code/comments in English.
- Must stay buildable on **Android Termux**: no SWC, sharp, lightningcss, Rolldown/Vite 8, TypeScript 7 (native), Docker, Supabase CLI or other native-only tools. Check `COMPATIBILITY.md` before adding a dependency; pin exact versions.
- Scripts and tests are `.ts` run directly by Node ≥ 22.18 (type stripping): use `import … from './x.ts'` and erasable TS only (no enums/parameter properties).
- Never invent facts about the rabbi (titles, bio, dates, quotes, contacts). Seed data comes only from `data/research-appendix.md` via `npm run seed`.
- Security is enforced in SQL (RLS + triggers). UI checks in `src/shared/workflow.ts` mirror them — change both and extend `supabase/verify/rls_checks.sql`.
- Before committing: `npm run typecheck && npm test && npm run build`. DB changes: `scripts/verify-db-local.sh` against a throwaway Postgres.
- Never put the Supabase secret key in `VITE_*`, in Git, or in logs. Never deploy without the owner's instruction.
