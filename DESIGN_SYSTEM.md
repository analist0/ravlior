# DESIGN_SYSTEM — "a living digital beit midrash"

The direction: a dignified Torah library. Strong Hebrew typography, clean surfaces, warm light over book shelves, and exact interaction details. The public site is warm and airy; the CMS is denser and quieter.

## Tokens (`src/styles/tokens.css`)

All colours live in tokens; components never use raw hex values.

| group | tokens | light | dark |
|---|---|---|---|
| surfaces | `--bg` `--bg-elevated` `--bg-sunken` `--surface` | warm ivory `#f7f1e6` / `#fcf9f3` / `#efe5d3` / `#fffdf8` | `#13151b` / `#1a1d25` / `#0e1015` / `#1c1f28` |
| text | `--text` `--text-muted` `--text-soft` | dark ink `#16181f` / `#474b57` / `#5d6270` | `#efe9dc` / `#bfb8a9` / `#a39d90` |
| accent | `--accent` `--accent-hover` `--accent-soft` | deep blue `#1d3a6b` | `#8fb1ec` |
| gold | `--gold` `--gold-text` | `#b8892b` (decorative) / `#7c5a12` (text, AA on ivory) | `#e9b949` / `#e7c060` |
| light | `--glow` | amber `#f7d58e` | `#6b4f12` |
| status | `--danger` `--success` `--focus` | | |

**Type:** Frank Ruhl Libre (headings, serif) + Heebo (body text). Both OFL-1.1 via `@fontsource`, self-hosted, Hebrew subset (+ Latin for digits). Scale `--step--1 … --step-5` (fluid clamp), multiplied by `--font-scale`, which the user can change in the display menu (100% / 112.5% / 125%).
**Spacing:** 4px base (`--s-1 … --s-20`), `--gutter` responsive, `--maxw` 76rem, `--maxw-text` 42rem.
**Shape:** `--r-1…4`, `--r-pill`; shadows `--shadow-1…3`.
**Motion:** `--dur-1/2/3` (120/220/380ms), `--ease-out`, `--ease-spring`. Under `prefers-reduced-motion`, or with "הפחתת תנועה" (reduce motion) selected in the menu, all durations become 0ms and the JS animations (motion/react) are not rendered.
**Layout:** `--tap` 44px (touch target), `--header-h`, `--bottom-nav-h`, `--player-h`.

## Dark mode

A real dark theme: `prefers-color-scheme` by default, or a user choice (`data-theme` on `<html>`, applied before paint by `public/theme-init.js`). Contrast was checked automatically with axe on the main pages (TEST_REPORT).

## Components (`src/components`)

Header (sticky, blurred background) · BottomNav (mobile) · Breadcrumbs · SearchPanel (Radix Dialog, `/` to open, arrow keys, Enter) · MediaCard grid/list · Badge · Filters (chips, selects, grid/list segmented control, "more filters" disclosure on mobile) · EmptyState / ErrorState + retry · Skeleton · Modal + ConfirmProvider · Toasts (aria-live, with an optional action such as "undo") · form fields (label, hint, error, aria-invalid) · Button / IconButton / LinkButton · Pagination · BlockRenderer (whitelist) · MediaPlayer (click-to-load) · PlayerBar (persistent) · HeroArt (pure SVG).

## Motion — with meaning

Gentle section entrance (spring on `whileInView`, once), a grid/list swap (AnimatePresence), dialogs popping in, hover/tap on tiles, the player expanding, and upload progress. No autoplay audio, no scroll hijacking, and no loader hiding an available page. Only transform/opacity are animated. No WebGL. The SVG animation of the light pauses when the tab is hidden (`visibilitychange`).

## Hero

Typographic, with **no invented portrait**: an official image of the rabbi does not exist yet. Book shelves and light rays in SVG sit on a warm gradient. When an approved official photo arrives, add it through the image block or the page (credit field).

## RTL and bidi

`<html lang="he" dir="rtl">`. Durations, codes and URLs are wrapped in `.ltr` / `dir="ltr"` (unicode-bidi: isolate). Logical properties (`inset-inline`, `margin-inline`) are used everywhere.
