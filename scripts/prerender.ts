// Post-build SEO step: writes one static HTML file per public route with its real title,
// description, canonical URL, OpenGraph tags and a crawlable, readable body (links + text).
// The React app replaces #root on load. Also writes sitemap.xml and robots.txt.
//
// Data: if VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY are set at build time, published rows
// are read from Supabase (anon key, RLS applies); otherwise the research seed is used.
// Limitation (documented in STATUS.md): content published in the CMS after a build is visible to
// users immediately, but its crawler-visible HTML updates on the next build/deploy.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContentItem, Page, SeedData, Series, Topic } from '../src/shared/types.ts';
import { DEFAULT_PAGES } from '../src/shared/defaults.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const SITE = (process.env.VITE_SITE_URL ?? '').replace(/\/$/, '');
const template = readFileSync(resolve(dist, 'index.html'), 'utf8');

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const split = (t: string) => { const i = t.indexOf(' / '); return i > 0 ? [t.slice(0, i).trim(), t.slice(i + 3).trim()] : [t.trim(), '']; };
const TYPE: Record<string, string> = { video: 'וידאו', audio: 'אודיו', short: 'קצר', live: 'שידור מוקלט', book: 'ספר', leaflet: 'עלון', article: 'דבר תורה', answer: 'תשובה' };

async function loadData(): Promise<{ content: ContentItem[]; topics: Topic[]; series: Series[]; pages: Omit<Page, 'id'>[]; source: string }> {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (url && key) {
    const get = async (path: string) => {
      const r = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, authorization: `Bearer ${key}` } });
      if (!r.ok) throw new Error(`prerender fetch ${path}: ${r.status}`);
      return r.json() as Promise<Record<string, unknown>[]>;
    };
    const camel = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()), v]));
    const [c, t, s, p] = await Promise.all([
      get('content_items?select=*,media_sources(*)&status=eq.published&deleted_at=is.null&limit=5000'),
      get('topics?select=*&status=eq.published&deleted_at=is.null'),
      get('series?select=*,series_items(content_id,position)&status=eq.published&deleted_at=is.null'),
      get('pages?select=*&status=eq.published&deleted_at=is.null'),
    ]);
    return {
      content: c.map((r) => ({ ...camel(r), sources: ((r.media_sources as Record<string, unknown>[]) ?? []).map(camel) }) as unknown as ContentItem),
      topics: t.map(camel) as unknown as Topic[],
      series: s.map((r) => ({ ...camel(r), items: ((r.series_items as { content_id: string; position: number }[]) ?? []).sort((a, b) => a.position - b.position).map((x) => x.content_id) }) as unknown as Series),
      pages: p.map(camel) as unknown as Page[],
      source: 'supabase',
    };
  }
  const seed: SeedData = JSON.parse(readFileSync(resolve(root, 'src/data/seed.json'), 'utf8'));
  return { content: seed.content.filter((c) => c.status === 'published' && !c.deletedAt), topics: seed.topics, series: seed.series, pages: DEFAULT_PAGES, source: 'seed' };
}

interface Out { path: string; title: string; description: string; body: string; image?: string | null; type?: string; jsonLd?: unknown }
function render(o: Out): string {
  const full = o.title ? `${o.title} | אור המאיר` : 'אור המאיר — תורתו של הרב ליאור כהן';
  const canonical = SITE ? `${SITE}${encodeURI(o.path)}` : '';
  const head = [
    `<title>${esc(full)}</title>`,
    `<meta name="description" content="${esc(o.description.slice(0, 200))}" />`,
    canonical && `<link rel="canonical" href="${esc(canonical)}" />`,
    `<meta property="og:title" content="${esc(full)}" />`,
    `<meta property="og:description" content="${esc(o.description.slice(0, 200))}" />`,
    `<meta property="og:type" content="${o.type ?? 'website'}" />`,
    `<meta property="og:locale" content="he_IL" />`,
    canonical && `<meta property="og:url" content="${esc(canonical)}" />`,
    o.image && `<meta property="og:image" content="${esc(o.image)}" />`,
    o.jsonLd ? `<script type="application/ld+json">${JSON.stringify(o.jsonLd).replace(/</g, '\\u003c')}</script>` : '',
  ].filter(Boolean).join('\n    ');
  const nav = `<nav aria-label="ניווט"><a href="/">בית</a> · <a href="/library">ספרייה</a> · <a href="/series">סדרות</a> · <a href="/topics">נושאים</a> · <a href="/books">ספרים</a> · <a href="/responsa">שו״ת</a> · <a href="/ask">שאלה לרב</a></nav>`;
  return template
    .replace(/<!--head-meta-->[\s\S]*?<!--\/head-meta-->/, head)
    .replace('<!--prerender-->', `<div class="container prerendered">${nav}<main>${o.body}</main></div>`);
}
function write(path: string, html: string) {
  // /item/x → dist/item/x.html (served with cleanUrls on Vercel); / → dist/index.html
  const file = path === '/' ? resolve(dist, 'index.html') : resolve(dist, `.${path}.html`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
}
const list = (items: ContentItem[]) => `<ul>${items.map((c) => `<li><a href="/item/${esc(c.slug)}">${esc(split(c.title)[0]!)}</a> — ${TYPE[c.type]}</li>`).join('')}</ul>`;

const data = await loadData();
const outs: Out[] = [];
const latest = [...data.content].sort((a, b) => a.catalogOrder - b.catalogOrder);
outs.push({ path: '/', title: '', description: 'ספריית שיעורים, דרשות, ספרים ותשובות של הרב ליאור כהן ומוסדות אור המאיר — לצפות, להאזין, לעיין ולשאול.',
  body: `<h1>לצפות, להאזין, לעיין ולשאול</h1><p>שיעורים, דרשות, ספרים ותשובות של הרב ליאור כהן, והנחלת תורתו של מרן הרב מאיר מאזוז זצ״ל — כל פריט עם ייחוס למקורו.</p><h2>חדש בערוץ</h2>${list(latest.slice(0, 12))}`,
  jsonLd: { '@context': 'https://schema.org', '@type': 'WebSite', name: 'אור המאיר', inLanguage: 'he', ...(SITE ? { url: SITE } : {}) } });
outs.push({ path: '/library', title: 'ספריית השיעורים', description: 'חיפוש וסינון שיעורי וידאו, אודיו, קטעים קצרים, דברי תורה, ספרים ותשובות של הרב ליאור כהן.', body: `<h1>ספריית השיעורים</h1>${list(latest.slice(0, 60))}` });
outs.push({ path: '/series', title: 'סדרות', description: 'סדרות שיעורים של הרב ליאור כהן.', body: `<h1>סדרות</h1><ul>${data.series.map((s) => `<li><a href="/series/${esc(s.slug)}">${esc(s.title)}</a></li>`).join('')}</ul>` });
for (const s of data.series) {
  const items = s.items.map((id) => data.content.find((c) => c.id === id)).filter((c): c is ContentItem => !!c);
  outs.push({ path: `/series/${s.slug}`, title: s.title, description: s.description ?? `סדרת ${s.title}`, body: `<h1>${esc(s.title)}</h1><p>${esc(s.description ?? '')}</p>${list(items)}` });
}
outs.push({ path: '/topics', title: 'נושאים', description: 'עיון בשיעורים לפי נושא.', body: `<h1>נושאים</h1><ul>${data.topics.map((t) => `<li><a href="/topics/${esc(t.slug)}">${esc(t.name)}</a></li>`).join('')}</ul>` });
for (const t of data.topics) {
  const items = (data.content as (ContentItem & { topicIds?: string[] })[]).filter((c) => c.topicIds?.includes(t.id));
  outs.push({ path: `/topics/${t.slug}`, title: t.name, description: `שיעורים ותכנים בנושא ${t.name}`, body: `<h1>${esc(t.name)}</h1>${list(items.slice(0, 60))}` });
}
outs.push({ path: '/books', title: 'ספרים, עלונים ודברי תורה', description: 'ספרים וקונטרסים הקשורים לרב ליאור כהן ולמורשת מרן הרב מאזוז, עלונים ודברי תורה כתובים — עם פרטי מקור מדויקים.',
  body: `<h1>ספרים, עלונים ודברי תורה</h1>${list(data.content.filter((c) => ['book', 'leaflet', 'article'].includes(c.type)))}` });
outs.push({ path: '/responsa', title: 'שאלות ותשובות', description: 'תשובות הלכתיות של הרב ליאור כהן עם ייחוס מדויק.', body: `<h1>שאלות ותשובות</h1>${list(data.content.filter((c) => c.type === 'answer'))}` });
outs.push({ path: '/ask', title: 'שאלה לרב', description: 'שליחת שאלה לרב ליאור כהן — ללא הרשמה, אפשר בעילום שם. השאלה אינה מתפרסמת ללא הסכמה ואישור.', body: '<h1>שאלה לרב</h1><p>הטופס נטען עם האתר.</p>' });
outs.push({ path: '/institutions', title: 'מוסדות ופעילות', description: 'מוסדות אור המאיר, ישיבת מאור יוסף, הישיבה הגדולה אורחות מאיר וקהילת היכל משה — ופעילות מתועדת עם קישורים למקורות.', body: '<h1>מוסדות ופעילות</h1>' });
outs.push({ path: '/sources', title: 'מקורות', description: 'הארכיונים והאתרים שמהם נאסף המידע באתר.', body: '<h1>מקורות</h1>' });
for (const p of data.pages) {
  const text = p.blocks.map((b) => ('text' in b ? `<p>${esc(b.text)}</p>` : '')).join('');
  outs.push({ path: p.slug === 'about' ? '/about' : `/p/${p.slug}`, title: p.title, description: p.description ?? p.title, body: `<h1>${esc(p.title)}</h1>${text}` });
}
for (const c of data.content) {
  const [main, sub] = split(c.title);
  const yt = c.sources.find((s) => s.provider === 'youtube' && s.providerId);
  const srcs = c.sources.map((s) => `<li><a href="${esc(s.url)}" rel="noopener">${esc(s.provider)}</a></li>`).join('');
  outs.push({
    path: `/item/${c.slug}`, title: main!, type: c.type === 'video' || c.type === 'short' ? 'video.other' : 'article',
    description: (c.summary ?? (sub || `${TYPE[c.type]} — ${main}`)).slice(0, 180),
    image: yt ? `https://i.ytimg.com/vi/${yt.providerId}/hqdefault.jpg` : null,
    body: `<article><h1>${esc(main!)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}<p>${esc(c.speaker ?? 'ערוץ מוסדות אור המאיר')} · ${TYPE[c.type]}${c.durationText ? ` · ${esc(c.durationText)}` : ''}</p>${c.summary ? `<p>${esc(c.summary)}</p>` : ''}<h2>מקורות</h2><ul>${srcs}</ul></article>`,
    // Structured data only with real fields: a breadcrumb (VideoObject needs an upload date we do not have).
    jsonLd: SITE ? { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'ספרייה', item: `${SITE}/library` },
      { '@type': 'ListItem', position: 2, name: main, item: `${SITE}${encodeURI(`/item/${c.slug}`)}` }] } : undefined,
  });
}

for (const o of outs) write(o.path, render(o));
const urls = outs.map((o) => o.path);
if (SITE) {
  writeFileSync(resolve(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${esc(SITE + encodeURI(u))}</loc></url>`).join('\n')}\n</urlset>\n`);
}
writeFileSync(resolve(dist, 'robots.txt'), `User-agent: *\nDisallow: /admin\nDisallow: /track\nDisallow: /favorites\nDisallow: /api/\n${SITE ? `Sitemap: ${SITE}/sitemap.xml\n` : ''}`);
console.log(`prerender: ${outs.length} pages from ${data.source}${SITE ? ' + sitemap.xml' : ' (no VITE_SITE_URL → no canonical/sitemap)'}`);
