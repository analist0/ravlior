# COMPATIBILITY — Android Termux gate

**Bottom line (30.09.2026):** this repository has **not been run on a phone yet**. I had no access to the device. Everything below was run in a **Linux x86_64 cloud container** (Node 22.22.2, npm 10.9.7). That is **not** a Termux check. The phone test is prepared in `scripts/termux-smoke.sh`, and its results should replace the "device" column below.

Classifications: **verified on device** (none yet) · **documented support** (the maintainer publishes a build or official support for android-arm64) · **inferred** (pure JS/CSS, no native code; expected to work on any Node) · **blocked**.

## Commands to run on the phone

```sh
pkg update && pkg install nodejs-lts git        # Termux's official LTS; do not install a second nodejs package
node -v                                          # need >= 22.18 (TS type-stripping, --env-file-if-exists)
cd ~ && git clone <repo> or-hameir && cd or-hameir   # in $HOME, not /sdcard
sh scripts/termux-smoke.sh                       # install, native binaries, tsc, tests, build, preview, dev
npm run dev                                      # open http://127.0.0.1:5173 in Chrome on the phone
```

> If `npm` is missing: in Termux it ships with `nodejs-lts`. Do not install `nodejs` alongside it (they conflict).
> If Termux's nodejs-lts is older than 22.18: check `pkg show nodejs-lts`. As an alternative, install the `nodejs` package (current) **instead of** LTS. Do not keep both.

## Dependency matrix

| package | exact version | role | source | engines | native / platform deps | Linux container result (30.09.2026) | android classification | limitation |
|---|---|---|---|---|---|---|---|---|
| vite | 7.3.6 | dev server, HMR, build | https://vite.dev/guide/ | node ^20.19 \|\| >=22.12 | via rollup + esbuild | `vite` ready in 223ms; `vite build` 3.2s ✔ | documented support (through rollup/esbuild below) | Vite 8 moved to Rolldown/lightningcss; **deliberately not used** until verified on Android |
| rollup | 4.63.5 | bundler (inside Vite 7) | https://rollupjs.org | node >=18 | `@rollup/rollup-android-arm64@4.63.5` (napi) in optionalDependencies | linux-x64-gnu binary used ✔ | documented support | Also lists `@napi-rs/lzma-linux-x64-gnu` as optional (build tool for rollup itself); on Android it is skipped harmlessly |
| esbuild | 0.28.2 | TS/JSX transforms and minify (inside Vite) | https://esbuild.github.io/getting-started/ | node >=18 | `@esbuild/android-arm64@0.28.2` | ✔ | documented support | The smoke script also runs `transformSync` |
| @vitejs/plugin-react | 5.2.0 | JSX + Fast Refresh | npm | node ^20.19 \|\| >=22.12 | none (Babel, pure JS) — **not SWC** | ✔ | inferred | — |
| @babel/core | 7.29.7 | transitive dependency of plugin-react | npm | node >=6.9 | none | ✔ | inferred | — |
| typescript | 6.0.3 | `tsc --noEmit` | npm | node >=14.17 | none (JS compiler) | `tsc` clean ✔ | inferred | **TypeScript 7.x is a native Go compiler without an Android build — deliberately not used** |
| react / react-dom | 19.2.8 | UI | https://react.dev | — | none | ✔ | inferred | — |
| @supabase/supabase-js | 2.117.2 | DB/Auth/Storage client | https://supabase.com/docs/reference/javascript/installing | node >=22 | none | build ✔; **no live connection tested** | inferred | Requires Node 22+ on Termux |
| motion | 12.43.0 (`motion/react`) | animations | https://motion.dev/docs/react-installation | peer react ^18 \|\| ^19 | none | ✔ | inferred | Not 13.x: 12 is the stable line verified here |
| radix-ui | 1.6.7 | Dialog, Popover | https://www.radix-ui.com/primitives/docs/overview/introduction | peer react ≤19 | none | ✔ (focus trap/Escape tested in E2E) | inferred | Only Dialog and Popover are imported |
| tus-js-client | 4.3.1 | resumable uploads (browser + import script) | https://supabase.com/docs/guides/storage/uploads/resumable-uploads | node >=18 | none | build ✔; **no real upload performed** | inferred | Needs testing against a real Supabase project |
| @fontsource/frank-ruhl-libre, @fontsource/heebo | 5.3.0 | self-hosted fonts (OFL-1.1) | npm (license: OFL-1.1) | — | none (woff2 files) | ✔ | inferred | No external font service |
| @types/node | 22.20.4 | types | npm | — | none | ✔ | inferred | — |

**Deliberately not in the project:** SWC, sharp, lightningcss, workerd/Miniflare, better-sqlite3, Wrangler, Supabase CLI/Docker, Playwright (browser tests ran from a separate scratch directory in the cloud container only), and any HLS package (there are no HLS sources).

## Runtime paths

| path | command | Linux container | Termux |
|---|---|---|---|
| env check | `npm run env:check` | ✔ | pending run |
| install | `npm ci` | ✔ (0 vulnerabilities) | pending run |
| dev + HMR | `npm run dev` → 127.0.0.1:5173 | server up ✔ (HMR not checked manually) | pending run + check in Chrome |
| API server | `npm run api` → 127.0.0.1:8787 | ✔ health/503 without Supabase | pending run |
| typecheck | `npm run typecheck` | ✔ | pending run |
| unit tests | `npm test` (node:test, no native tools) | 48/48 ✔ | pending run |
| build + prerender | `npm run build` | ✔ 249 pages | pending run |
| preview | `npm run preview` → 127.0.0.1:4173 | ✔ | pending run |
| DB migrations + RLS | `scripts/verify-db-local.sh` | ✔ 48/48 on local PostgreSQL 16 with a Supabase shim | **not intended for the phone** (no local Postgres) — run `rls_checks.sql` in the SQL editor of the cloud project |
