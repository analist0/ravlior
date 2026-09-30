# MODULES — modular monolith

Each module is declared by a typed manifest in `src/modules/manifest.ts` (Node-safe, no JSX):
`id, version, name, description, core?, dependsOn, routes, adminSections, navigation, permissions, settings (schema), migrations, featureFlag, enabledByDefault`.

- **Registration in code only.** No code is ever loaded from the DB, and no untrusted plugins run.
- **Enable/disable** from the CMS (Admin → Modules). The state is stored in `public.modules` (writable by admin/owner only, via RLS). `validateToggle` blocks switching off a core module, switching off a module that active modules depend on, and switching on a module whose dependencies are off.
- **Routes** owned by a module are checked in `App.tsx` (`moduleForPath`). If the module is off, the page shows "האזור אינו פעיל" (this section is not active) rather than a 404. Screens are loaded lazily (`lazy(() => import(...))`).
- **Permissions** are declared in the manifest for documentation and UI. Enforcement is always in the DB (RLS + triggers) and on the server.

## Initial modules

| id | core | depends on | owns |
|---|---|---|---|
| library | ✔ | media | /library, /item/:slug, /series, /topics |
| media | ✔ | — | player, provider adapters, uploads |
| books | | library | /books |
| responsa | | library | /responsa, /ask, /track, question inbox |
| institutions | | — | /institutions, institutions/events |
| pages | ✔ | — | /p/:slug, /about, menus |
| home-builder | | library | homepage sections |
| users-audit | ✔ | — | users, roles, audit log |
| parasha-shelf | | library | /parasha — **example module**, off by default |

## Adding a new module (the parasha-shelf example)

1. Add a manifest to `MODULES` (unique id, semver version, `featureFlag: 'module.<id>'`).
2. Put the screens in `src/modules/<id>/…` and register the route in `ROUTES` in `src/app/App.tsx` with `lazy(...)`.
3. If a table is needed: a new migration under `supabase/migrations/`, listed in `migrations`, with RLS policies.
4. Add a row to `public.modules` (the seed does this automatically via `seed-to-sql`).
5. Run `npm test`: `tests/modules.test.ts` is the **contract**. It checks the id, version, feature flag, routes, roles, that the migrations exist, that dependencies exist, that there are no cycles, and the settings types.

Shared services are available to every module: `useRepo()` (data), `useAdmin()` (session/roles in the CMS), UI components, `shared/*` (workflow, blocks, media, uploads).
