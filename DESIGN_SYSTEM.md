# DESIGN_SYSTEM — "עמוד וקו" (page and rule)

A contemporary editorial beit midrash. Cool paper, evergreen ink, one copper highlight, and a dark management rail. The public site stays airy; the CMS is denser and clearly a workspace.

The previous direction (warm ivory, deep blue, gold, Frank Ruhl Libre + Heebo) is replaced by this system. Behaviour, routes, and the SEO pre-render are unchanged.

## Tokens (`src/styles/tokens.css`)

All colours live in tokens. Components do not introduce new hex values. Older token names (`--ivory-*`, `--gold-*`, `--blue-*`) still exist so existing markup keeps working; their values are now paper, copper, and evergreen.

| group | tokens | light | dark |
|---|---|---|---|
| surfaces | `--bg` `--bg-elevated` `--bg-sunken` `--surface` | cool paper `#f4f7f5` / `#fbfcfb` / `#e6eeea` / `#ffffff` | `#0d1411` / `#15201c` / `#090f0d` / `#1a2823` |
| text | `--text` `--text-muted` `--text-soft` | evergreen ink `#10211c` / `#3c5248` / `#4e665c` | `#e7f3ee` / `#c3d5cc` / `#a9c0b6` |
| accent | `--accent` `--accent-hover` `--accent-soft` | `#0b5e49` (white label text, AA) | `#7ee0c2` on `#06241c` |
| copper | `--gold` `--gold-text` | decorative `#c56a32` / text `#8a3f14` (AA on paper) | `#e7a36a` / `#f0c09a` |
| wash | `--glow` | mint `#d7efe6` | `#1c3d32` |
| status | `--danger` `--success` `--focus` | `#9f2d24` / `#1f6b45` / `#0a5cad` | lighter tints, AA on the dark surfaces |
| admin rail | `--admin-rail` `--admin-rail-text` `--admin-rail-active` | deep ink rail, white active label | same active chip, slightly lifted rail |

Checked pairs (text on its surface) are at least 4.5:1. Large UI chrome (buttons, the active nav chip) is at least 4.5:1 as well. Focus rings are 3px `--focus`.

**Type:** Noto Serif Hebrew (headings) + Assistant (UI and body). Both OFL, self-hosted via `@fontsource` 5.3.0, Hebrew subset plus Latin for digits and codes. Scale `--step--1 … --step-5` (fluid clamp), multiplied by `--font-scale` (100% / 112.5% / 125% in the display menu).

**Spacing:** 4px base (`--s-1 … --s-20`), `--gutter` responsive, `--maxw` 76rem, `--maxw-text` 42rem. Body line-height 1.7.

**Shape:** `--r-1…4` (8 / 12 / 18 / 28), `--r-pill` for chips, search, and pagination only. Buttons and cards use `--r-2`, not a full pill. Shadows are short and cool.

**Motion:** `--dur-1/2/3` (120/220/380ms), `--ease-out`, `--ease-spring`. Under `prefers-reduced-motion`, or with "הפחתת תנועה" selected, durations become 0ms and the JS motion is not rendered. Hover on tiles and cards changes border and shadow only (no lift).

**Layout:** `--tap` 44px, `--header-h` 68px with a 2px accent rule, `--bottom-nav-h`, `--player-h`. The active mobile tab uses an inset accent rule so the bar does not overflow.

## Dark mode

`prefers-color-scheme` by default, or `data-theme` on `<html>` before paint (`public/theme-init.js`). The footer is evergreen ink in both themes, with light link text.

## Components (`src/components`)

Header (sticky, blurred paper, accent rule) · BottomNav · Breadcrumbs · SearchPanel · MediaCard grid/list · Badge · Filters · EmptyState / ErrorState · Skeleton · Modal + ConfirmProvider · Toasts · form fields · Button / IconButton / LinkButton · Pagination · BlockRenderer · MediaPlayer · PlayerBar · HeroArt (SVG shelves and a light beam; no invented portrait).

The mark is an open book with a copper spine on an evergreen square.

## Admin

The rail is evergreen ink even in light mode, so management is visually separate from the public site. Lists share one toolbar: search, status, sort (updated / title / status), active vs trash, pagination. Source archives and the media catalog use the same pattern. Destructive actions confirm in Hebrew and say whether restore is possible.

## Public experience

The shell (header, mega-menu „עיון”, mobile sheet, footer, command palette, library, topics, text pages, 404) lives in `src/styles/experience.css` and uses the same tokens.

- **Reading:** `--font-reading` (Noto Serif Hebrew 400/600/700, `font-display: swap` via `@fontsource`) on `--sheet`. Footnotes use `[^n]` markers in paragraph text. A progress bar, local type size, print, and share sit on article, book and leaflet pages.
- **Search:** `/` and Ctrl/Cmd+K open a palette over content, topics, series, pages and institutions. Exact tokens rank first; a one-letter miss falls back to trigram word-similarity (`public.search_site`, mirrored in `src/shared/site-search.ts`).
- **Updates:** the footer form stores an email or Israeli mobile. It does not send mail or WhatsApp.
- **PWA:** `public/manifest.webmanifest` and `public/sw.js` cache the shell and same-origin pages, never `/api`.

## Hero

The owner-supplied banner stays. Below it, a typographic hero with a copper-to-evergreen rule. No invented portrait and no new biographical claims.

## RTL and bidi

`<html lang="he" dir="rtl">`. Durations, codes and URLs use `.ltr` / `dir="ltr"`. Logical properties (`inset-inline`, `margin-inline`, `padding-inline-start`) throughout.
