// Post-build SEO step: one static HTML file per public route, with the same title,
// description, canonical, hreflang, Open Graph, Twitter and JSON-LD the API serves
// for URLs published after this build. The React app replaces #root on load.
//
// sitemap.xml and robots.txt are NOT written here. On Vercel a static file would
// hide the dynamic sitemap, so those URLs are served by the API (see vercel.json).
//
// Data: DATABASE_URL → published rows through the anonymous role (RLS applies).
// A failed query fails the build. Otherwise the research seed is used.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PAGES } from '../src/shared/defaults.ts';
import { isPublic } from '../src/shared/query.ts';
import { buildCatalog, extractAssetTags, headHtml, prerenderBody, type SeoCatalog } from '../src/shared/seo.ts';
import type { SeedData } from '../src/shared/types.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const SITE = (process.env.VITE_SITE_URL ?? '').replace(/\/$/, '');
const template = readFileSync(resolve(dist, 'index.html'), 'utf8');
if (!template.includes('<!--head-meta-->') || !template.includes('<!--prerender-->')) {
  throw new Error('dist/index.html is missing prerender markers. Run vite build first; do not prerender an already prerendered file.');
}

function fromSeed(): SeoCatalog {
  const seed: SeedData = JSON.parse(readFileSync(resolve(root, 'src/data/seed.json'), 'utf8'));
  return {
    site: SITE,
    content: seed.content.filter(isPublic),
    topics: seed.topics.filter((t) => isPublic(t)),
    series: seed.series.filter((s) => isPublic(s)),
    pages: DEFAULT_PAGES,
    questions: [],
    institutions: seed.institutions.filter((i) => isPublic(i)),
    events: seed.events.filter((e) => isPublic(e)),
    archives: seed.archives,
    redirects: [],
  };
}

async function loadData(): Promise<{ catalog: SeoCatalog; source: string }> {
  if (process.env.DATABASE_URL) {
    const { withActor } = await import('../server/db.ts');
    const { loadSeoCatalog } = await import('../server/store.ts');
    const data = await withActor(null, loadSeoCatalog);
    return { catalog: { ...data, site: SITE }, source: 'database' };
  }
  return { catalog: fromSeed(), source: 'seed' };
}

function writePage(path: string, html: string) {
  const file = path === '/' ? resolve(dist, 'index.html') : resolve(dist, `.${path}.html`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
}

const { catalog, source } = await loadData();
const { documents } = buildCatalog(catalog);
for (const doc of documents) {
  const html = template
    .replace(/<!--head-meta-->[\s\S]*?<!--\/head-meta-->/, headHtml(doc, SITE))
    .replace('<!--prerender-->', prerenderBody(doc));
  writePage(doc.path, html);
}
const assets = extractAssetTags(template);
writeFileSync(resolve(root, 'server/seo-shell.json'), JSON.stringify(assets));
console.log(`prerender: ${documents.length} pages from ${source}${SITE ? '' : ' (no VITE_SITE_URL → no canonical; sitemap is served by the API)'}`);
