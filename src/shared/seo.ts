// Crawlable metadata shared by the pre-renderer, the public API and the browser head.
// Facts only: titles, summaries, speakers and dates already stored on the record.
// Nothing here adds a biography, a title, a contact or a quote.
import { sanitizeBlocks, safeUrl } from './blocks.ts';
import { slugify } from './hebrew.ts';
import { embedUrl, youtubeThumb } from './media.ts';
import { isPublic, relatedItems } from './query.ts';
import type { Block, ContentItem, ContentType, EventRecord, Institution, PublicQuestion, Series, SourceArchive, Topic } from './types.ts';

export const SITE_NAME = 'אור המאיר';
export const HOME_TITLE = `${SITE_NAME} — תורתו של הרב ליאור כהן`;
export const HERO_IMAGE = '/images/hero-rabbi-1600.webp';

export const SITEMAP_GROUPS = ['pages', 'video', 'audio', 'writing', 'answers', 'questions', 'topics', 'series'] as const;
export type SitemapGroup = (typeof SITEMAP_GROUPS)[number];

const TYPE_LABEL: Record<ContentType, string> = {
  video: 'וידאו', audio: 'אודיו', short: 'קצר', live: 'שידור מוקלט', book: 'ספר', leaflet: 'עלון', article: 'דבר תורה', answer: 'תשובה',
};

const COPY = {
  home: 'ספריית שיעורים, דרשות, ספרים ותשובות של הרב ליאור כהן ומוסדות אור המאיר — לצפות, להאזין, לעיין ולשאול.',
  library: 'חיפוש וסינון שיעורי וידאו, אודיו, קטעים קצרים, דברי תורה, ספרים ותשובות של הרב ליאור כהן.',
  series: 'סדרות שיעורים: אור הנאמ״ן, רעיון מוסרי לפרשת השבוע, הפרק היומי ועוד.',
  topics: 'עיון בשיעורים לפי נושא: חגים ומועדים, פרשת השבוע, הלכה, אמונה, מורשת מרן הרב מאזוז.',
  books: 'ספרים וקונטרסים הקשורים לרב ליאור כהן ולמורשת מרן הרב מאזוז, עלונים ודברי תורה כתובים — עם פרטי מקור מדויקים.',
  responsa: 'תשובות הלכתיות של הרב ליאור כהן: תשובות שאושרו לפרסום ותשובות במאגרים חיצוניים עם ייחוס מדויק.',
  ask: 'שליחת שאלה לרב ליאור כהן — ללא הרשמה, אפשר בעילום שם. השאלה אינה מתפרסמת ללא הסכמה ואישור.',
  institutions: 'מוסדות אור המאיר, ישיבת מאור יוסף, הישיבה הגדולה אורחות מאיר וקהילת היכל משה — ופעילות מתועדת עם קישורים למקורות.',
  sources: 'הארכיונים והאתרים שמהם נאסף המידע באתר, ומצב האימות של כל מקור.',
};

export interface SeoRedirect { fromPath: string; toPath: string }

export interface SeoPageInput {
  slug: string;
  title: string;
  description: string | null;
  blocks: Block[];
  status: string;
  deletedAt: string | null;
  updatedAt?: string | null;
}

export interface SeoCatalog {
  site: string;
  content: ContentItem[];
  topics: Topic[];
  series: Series[];
  pages: SeoPageInput[];
  questions: PublicQuestion[];
  institutions: Institution[];
  events: EventRecord[];
  archives: SourceArchive[];
  redirects: SeoRedirect[];
}

export interface SeoDocument {
  path: string;
  title: string;
  description: string;
  image: string | null;
  imageAlt: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  ogType: 'website' | 'article' | 'video.other';
  noindex: boolean;
  jsonLd: Record<string, unknown> | null;
  bodyHtml: string;
  lastmod: string | null;
  group: SitemapGroup;
  extraHead: string;
}

export interface SeoKind {
  type: 'sitemap-index' | 'sitemap' | 'robots' | 'indexnow' | 'page';
  group?: string;
  path?: string;
}

const NAV: [string, string][] = [
  ['/', 'בית'], ['/library', 'ספרייה'], ['/series', 'סדרות'], ['/topics', 'נושאים'],
  ['/books', 'ספרים'], ['/responsa', 'שו״ת'], ['/ask', 'שאלה לרב'],
];

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function clip(s: string, n = 180): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  const sp = cut.lastIndexOf(' ');
  return (sp > 60 ? cut.slice(0, sp) : cut).trim();
}

/** ISO-8601 or null. Accepts Date, timestamptz and YYYY-MM-DD. Never invents a date. */
export function isoDate(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00:00.000Z`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function day(v: string | null): string | null {
  return v ? v.slice(0, 10) : null;
}

function maxIso(values: (string | null)[]): string | null {
  const ok = values.filter((v): v is string => !!v).sort();
  return ok.at(-1) ?? null;
}

function updated(row: object): string | null {
  const r = row as { updatedAt?: unknown; publishedAt?: unknown };
  return isoDate(r.updatedAt) ?? isoDate(r.publishedAt);
}

export function splitTitle(title: string): [string, string | null] {
  const i = title.indexOf(' / ');
  const j = i >= 0 ? i : title.indexOf('/ ');
  if (j <= 0) return [title.trim(), null];
  const sub = title.slice(j + (i >= 0 ? 3 : 2)).trim();
  return [title.slice(0, j).trim(), sub || null];
}

/** Hebrew-friendly slug. Keeps a short ascii suffix already used for uniqueness. Idempotent on current slugs. */
export function publicSlug(input: string, fallback = 'item'): string {
  const raw = input.normalize('NFC').trim();
  const suffix = raw.match(/-([a-z0-9]{4,8})$/)?.[1] ?? '';
  const baseInput = suffix ? raw.slice(0, -(suffix.length + 1)) : raw;
  const base = slugify(baseInput, fallback);
  const slug = (suffix ? `${base}-${suffix}` : base).slice(0, 110).replace(/-$/g, '');
  return slug || fallback;
}

export function entityPath(entity: string, slug: string): string | null {
  if (!slug || /[\s?#]/.test(slug) || slug.includes('://') || slug.includes('..')) return null;
  switch (entity) {
    case 'content': return `/item/${slug}`;
    case 'topics': return `/topics/${slug}`;
    case 'series': return `/series/${slug}`;
    case 'publicQuestions': return `/responsa/${slug}`;
    case 'pages': return slug === 'about' ? '/about' : `/p/${slug}`;
    default: return null;
  }
}

export function normalizePath(raw: string): string {
  let p = raw.split('?')[0]?.split('#')[0] ?? '/';
  try { p = decodeURI(p); } catch { /* keep the raw path */ }
  p = p.normalize('NFC');
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  if (!p.startsWith('/')) p = `/${p}`;
  if (p.includes('..') || p.includes('\\') || p.includes('://')) return '/';
  return p;
}

/** On-site path only. Rejects protocol-relative and absolute URLs. */
export function internalTarget(raw: string): string | null {
  const path = normalizePath(raw);
  if (path === '/' && raw.trim() !== '/' && !raw.trim().startsWith('/')) return null;
  if (!path.startsWith('/') || path.startsWith('//')) return null;
  if (path.includes('://') || path.includes('\\')) return null;
  return path;
}

export function rememberRedirect(list: SeoRedirect[], fromPath: string, toPath: string): SeoRedirect[] {
  const from = internalTarget(fromPath);
  const to = internalTarget(toPath);
  if (!from || !to || from === to) return list.filter((r) => internalTarget(r.fromPath) !== from);
  const next = list
    .map((r) => {
      const source = internalTarget(r.fromPath);
      const dest = internalTarget(r.toPath);
      if (!source || !dest) return null;
      return { fromPath: source, toPath: dest === from ? to : dest };
    })
    .filter((r): r is SeoRedirect => !!r && r.fromPath !== to && r.fromPath !== from && r.fromPath !== r.toPath);
  next.push({ fromPath: from, toPath: to });
  return next;
}

export function followRedirect(list: SeoRedirect[], path: string, hops = 5): string | null {
  let cur = normalizePath(path);
  let dest: string | null = null;
  for (let i = 0; i < hops; i++) {
    const hit = list.find((r) => r.fromPath === cur);
    const to = hit ? internalTarget(hit.toPath) : null;
    if (!to || to === cur) break;
    dest = to;
    cur = to;
  }
  return dest;
}

export function absoluteUrl(site: string, path: string): string | null {
  const base = site.replace(/\/$/, '');
  if (!base) return null;
  return base + encodeURI(normalizePath(path));
}

export function blocksText(blocks: Block[]): string {
  const { blocks: safe } = sanitizeBlocks(blocks);
  const parts: string[] = [];
  for (const b of safe) {
    if (b.type === 'heading' || b.type === 'paragraph' || b.type === 'quote') parts.push(b.text);
  }
  return parts.join('\n\n');
}

function blocksToHtml(blocks: Block[]): string {
  const { blocks: safe } = sanitizeBlocks(blocks);
  return safe.map((b) => {
    switch (b.type) {
      case 'heading': return b.level === 2 ? `<h2>${esc(b.text)}</h2>` : `<h3>${esc(b.text)}</h3>`;
      case 'paragraph': return `<p>${esc(b.text)}</p>`;
      case 'quote': return `<blockquote><p>${esc(b.text)}</p><footer>${esc(b.source)}</footer></blockquote>`;
      case 'image': {
        const src = safeUrl(b.src);
        if (!src) return '';
        return `<figure><img src="${esc(src)}" alt="${esc(b.alt)}" loading="lazy" decoding="async" />${b.credit ? `<figcaption>${esc(b.credit)}</figcaption>` : ''}</figure>`;
      }
      case 'pdf': {
        const src = safeUrl(b.src);
        return src ? `<p><a href="${esc(src)}" rel="noopener noreferrer">${esc(b.title)}</a></p>` : '';
      }
      case 'cta': {
        const href = b.href.startsWith('/') ? b.href : safeUrl(b.href);
        if (!href) return '';
        const external = href.startsWith('https:');
        return `<p><a href="${esc(href)}"${external ? ' rel="noopener noreferrer"' : ''}>${esc(b.label)}</a></p>`;
      }
      default: return '';
    }
  }).join('');
}

function itemLinks(items: ContentItem[], limit = 60): string {
  if (!items.length) return '';
  return `<ul>${items.slice(0, limit).map((c) => {
    const [main] = splitTitle(c.title);
    return `<li><a href="/item/${esc(c.slug)}">${esc(main)}</a> — ${esc(TYPE_LABEL[c.type])}</li>`;
  }).join('')}</ul>`;
}

function questionLinks(rows: PublicQuestion[], limit = 30): string {
  if (!rows.length) return '';
  return `<ul>${rows.slice(0, limit).map((q) => `<li><a href="/responsa/${esc(q.slug)}">${esc(clip(q.questionText, 160))}</a></li>`).join('')}</ul>`;
}

function crumb(site: string, items: { name: string; path?: string }[]): Record<string, unknown> | null {
  if (!site) return null;
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      ...(c.path && absoluteUrl(site, c.path) ? { item: absoluteUrl(site, c.path) } : {}),
    })),
  };
}

function graph(nodes: (Record<string, unknown> | null)[]): Record<string, unknown> | null {
  const items = nodes.filter((n): n is Record<string, unknown> => !!n && Object.keys(n).length > 0);
  if (!items.length) return null;
  return { '@context': 'https://schema.org', '@graph': items };
}

export function homeJsonLd(site: string): Record<string, unknown> {
  const base = site.replace(/\/$/, '');
  const website: Record<string, unknown> = { '@type': 'WebSite', name: SITE_NAME, inLanguage: 'he' };
  if (base) {
    website.url = base;
    website.potentialAction = {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${base}/library?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    };
  }
  // Names already printed on the site. No job title, date, phone or biography.
  const org: Record<string, unknown> = { '@type': 'Organization', name: 'מוסדות אור המאיר' };
  const person: Record<string, unknown> = { '@type': 'Person', name: 'הרב ליאור כהן' };
  if (base) {
    org.url = base;
    org.logo = absoluteUrl(base, '/favicon.svg');
    person.url = absoluteUrl(base, '/about');
  }
  return { '@context': 'https://schema.org', '@graph': [website, org, person] };
}

export function webPageJsonLd(site: string, path: string, name: string, description: string | null): Record<string, unknown> | null {
  const url = absoluteUrl(site, path);
  if (!url) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name,
    ...(description ? { description } : {}),
    inLanguage: 'he',
    url,
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: site.replace(/\/$/, '') },
  };
}

function hero(site: string): { url: string; w: number; h: number } | null {
  const url = absoluteUrl(site, HERO_IMAGE);
  return url ? { url, w: 1600, h: 800 } : null;
}

function itemMedia(site: string, item: ContentItem, alt: string): { url: string; w: number; h: number; alt: string } | null {
  const yt = item.sources.find((s) => s.provider === 'youtube' && s.providerId);
  if (yt?.providerId) return { url: youtubeThumb(yt.providerId, 'hq'), w: 480, h: 360, alt };
  const fallback = hero(site);
  return fallback ? { ...fallback, alt } : null;
}

function isoDuration(total: number): string {
  const s = Math.max(0, Math.floor(total));
  return `PT${Math.floor(s / 3600)}H${Math.floor((s % 3600) / 60)}M${s % 60}S`;
}

function videoNode(site: string, item: ContentItem, name: string, description: string): Record<string, unknown> | null {
  if (item.type !== 'video' && item.type !== 'short' && item.type !== 'live') return null;
  const yt = item.sources.find((s) => s.provider === 'youtube' && s.providerId);
  if (!yt?.providerId) return null;
  // Prefer the date stored from the source. Otherwise the date this site published the record.
  const uploadDate = isoDate(item.sourcePublishedDate) ?? isoDate(item.publishedAt);
  if (!uploadDate) return null;
  const embed = embedUrl('youtube', yt.providerId);
  const url = absoluteUrl(site, `/item/${item.slug}`);
  return {
    '@type': 'VideoObject',
    name,
    description,
    thumbnailUrl: youtubeThumb(yt.providerId, 'hq'),
    uploadDate,
    inLanguage: 'he',
    ...(url ? { url } : {}),
    ...(embed ? { embedUrl: embed } : {}),
    ...(item.durationSeconds != null ? { duration: isoDuration(item.durationSeconds) } : {}),
  };
}

function articleNode(site: string, item: ContentItem, name: string, description: string, image: string | null): Record<string, unknown> {
  const url = absoluteUrl(site, `/item/${item.slug}`);
  const published = isoDate(item.publishedAt);
  const modified = isoDate(item.updatedAt);
  return {
    '@type': 'Article',
    headline: name,
    description,
    inLanguage: 'he',
    ...(url ? { url, mainEntityOfPage: url } : {}),
    ...(image ? { image } : {}),
    ...(published ? { datePublished: published } : {}),
    ...(modified ? { dateModified: modified } : {}),
    ...(item.speaker ? { author: { '@type': 'Person', name: item.speaker } } : {}),
  };
}

function qaFromParts(site: string, path: string, question: string, answer: string, published: string | null, author: string | null): Record<string, unknown> | null {
  const text = answer.trim();
  if (!text) return null;
  const url = absoluteUrl(site, path);
  return {
    '@type': 'QAPage',
    inLanguage: 'he',
    ...(url ? { url } : {}),
    mainEntity: {
      '@type': 'Question',
      name: clip(question, 110),
      text: question,
      answerCount: 1,
      acceptedAnswer: {
        '@type': 'Answer',
        text,
        ...(published ? { datePublished: published } : {}),
        ...(author ? { author: { '@type': 'Person', name: author } } : {}),
      },
    },
  };
}

function shell(d: Omit<SeoDocument, 'extraHead'> & { extraHead?: string }): SeoDocument {
  return { extraHead: '', ...d };
}

export function buildCatalog(input: SeoCatalog): { documents: SeoDocument[]; redirects: SeoRedirect[] } {
  const site = input.site.replace(/\/$/, '');
  const content = input.content.filter(isPublic);
  const topics = input.topics.filter(isPublic);
  const series = input.series.filter(isPublic);
  const pages = input.pages.filter((p) => p.status === 'published' && !p.deletedAt);
  const questions = input.questions.filter(isPublic);
  const byId = new Map(content.map((c) => [c.id, c]));
  const topicById = new Map(topics.map((t) => [t.id, t]));
  const newest = maxIso([...content.map(updated), ...questions.map(updated), ...pages.map((p) => isoDate(p.updatedAt))]);
  const documents: SeoDocument[] = [];

  const push = (d: SeoDocument) => documents.push(d);

  push(shell({
    path: '/', title: '', description: COPY.home, group: 'pages', lastmod: newest, noindex: false, ogType: 'website',
    image: hero(site)?.url ?? null, imageAlt: SITE_NAME, imageWidth: hero(site) ? 1600 : null, imageHeight: hero(site) ? 800 : null,
    jsonLd: homeJsonLd(site),
    extraHead: '<link rel="preload" as="image" href="/images/hero-rabbi-800.webp" imagesrcset="/images/hero-rabbi-800.webp 800w, /images/hero-rabbi-1600.webp 1600w" imagesizes="(max-width: 900px) 100vw, 1280px" fetchpriority="high" />',
    bodyHtml: `<h1>לצפות, להאזין, לעיין ולשאול</h1><p>שיעורים, דרשות, ספרים ותשובות של הרב ליאור כהן, והנחלת תורתו של מרן הרב מאיר מאזוז זצ״ל — כל פריט עם ייחוס למקורו.</p><h2>חדש בערוץ</h2>${itemLinks([...content].sort((a, b) => a.catalogOrder - b.catalogOrder), 12)}<p><a href="/library">לספרייה</a> · <a href="/responsa">לשו״ת</a> · <a href="/topics">לנושאים</a></p>`,
  }));

  push(shell({
    path: '/library', title: 'ספריית השיעורים', description: COPY.library, group: 'pages', lastmod: newest, noindex: false, ogType: 'website',
    image: hero(site)?.url ?? null, imageAlt: 'ספריית השיעורים', imageWidth: hero(site) ? 1600 : null, imageHeight: hero(site) ? 800 : null,
    jsonLd: graph([crumb(site, [{ name: 'בית', path: '/' }, { name: 'ספרייה', path: '/library' }])]),
    bodyHtml: `<h1>ספריית השיעורים</h1>${itemLinks([...content].sort((a, b) => a.catalogOrder - b.catalogOrder))}`,
  }));

  push(shell({
    path: '/series', title: 'סדרות', description: COPY.series, group: 'pages', lastmod: maxIso(series.map(updated)) ?? newest, noindex: false, ogType: 'website',
    image: hero(site)?.url ?? null, imageAlt: 'סדרות', imageWidth: hero(site) ? 1600 : null, imageHeight: hero(site) ? 800 : null,
    jsonLd: graph([crumb(site, [{ name: 'בית', path: '/' }, { name: 'סדרות', path: '/series' }])]),
    bodyHtml: `<h1>סדרות</h1><ul>${series.map((s) => `<li><a href="/series/${esc(s.slug)}">${esc(s.title)}</a></li>`).join('')}</ul>`,
  }));

  for (const s of series) {
    const items = s.items.map((id) => byId.get(id)).filter((c): c is ContentItem => !!c);
    const image = items.map((c) => itemMedia(site, c, s.title)).find(Boolean) ?? null;
    push(shell({
      path: `/series/${s.slug}`, title: s.title, description: clip(s.description || `סדרת ${s.title}`), group: 'series',
      lastmod: maxIso([updated(s), ...items.map(updated)]), noindex: false, ogType: 'website',
      image: image?.url ?? hero(site)?.url ?? null, imageAlt: s.title, imageWidth: image?.w ?? (hero(site) ? 1600 : null), imageHeight: image?.h ?? (hero(site) ? 800 : null),
      jsonLd: graph([crumb(site, [{ name: 'בית', path: '/' }, { name: 'סדרות', path: '/series' }, { name: s.title, path: `/series/${s.slug}` }])]),
      bodyHtml: `<article><h1>${esc(s.title)}</h1>${s.description ? `<p>${esc(s.description)}</p>` : ''}<h2>שיעורים בסדרה</h2>${itemLinks(items, 200)}</article>`,
    }));
  }

  push(shell({
    path: '/topics', title: 'נושאים', description: COPY.topics, group: 'pages', lastmod: maxIso(topics.map(updated)) ?? newest, noindex: false, ogType: 'website',
    image: hero(site)?.url ?? null, imageAlt: 'נושאים', imageWidth: hero(site) ? 1600 : null, imageHeight: hero(site) ? 800 : null,
    jsonLd: graph([crumb(site, [{ name: 'בית', path: '/' }, { name: 'נושאים', path: '/topics' }])]),
    bodyHtml: `<h1>נושאים</h1><ul>${topics.map((t) => `<li><a href="/topics/${esc(t.slug)}">${esc(t.name)}</a></li>`).join('')}</ul>`,
  }));

  for (const t of topics) {
    const items = content.filter((c) => c.topicIds.includes(t.id)).sort((a, b) => a.catalogOrder - b.catalogOrder);
    const relatedQ = questions.filter((q) => q.topicId === t.id);
    const others = topics.filter((o) => o.id !== t.id).slice(0, 8);
    push(shell({
      path: `/topics/${t.slug}`, title: t.name, description: clip(t.description || `שיעורים ותכנים בנושא ${t.name}`), group: 'topics',
      lastmod: maxIso([updated(t), ...items.map(updated), ...relatedQ.map(updated)]), noindex: false, ogType: 'website',
      image: hero(site)?.url ?? null, imageAlt: t.name, imageWidth: hero(site) ? 1600 : null, imageHeight: hero(site) ? 800 : null,
      jsonLd: graph([crumb(site, [{ name: 'בית', path: '/' }, { name: 'נושאים', path: '/topics' }, { name: t.name, path: `/topics/${t.slug}` }])]),
      bodyHtml: `<article><h1>${esc(t.name)}</h1>${t.description ? `<p>${esc(t.description)}</p>` : ''}<h2>שיעורים ותכנים</h2>${itemLinks(items) || '<p>אין פריטים מפורסמים בנושא זה.</p>'}<h2>שאלות ותשובות בנושא</h2>${questionLinks(relatedQ) || '<p>אין תשובות מפורסמות בנושא זה.</p>'}<h2>נושאים נוספים</h2><p>${others.map((o) => `<a href="/topics/${esc(o.slug)}">${esc(o.name)}</a>`).join(' · ')}</p></article>`,
    }));
  }

  const books = content.filter((c) => c.type === 'book' || c.type === 'leaflet' || c.type === 'article');
  push(shell({
    path: '/books', title: 'ספרים, עלונים ודברי תורה', description: COPY.books, group: 'pages', lastmod: maxIso(books.map(updated)), noindex: false, ogType: 'website',
    image: hero(site)?.url ?? null, imageAlt: 'ספרים', imageWidth: hero(site) ? 1600 : null, imageHeight: hero(site) ? 800 : null,
    jsonLd: graph([crumb(site, [{ name: 'בית', path: '/' }, { name: 'ספרים', path: '/books' }])]),
    bodyHtml: `<h1>ספרים, עלונים ודברי תורה</h1>${itemLinks(books)}`,
  }));

  const answers = content.filter((c) => c.type === 'answer');
  push(shell({
    path: '/responsa', title: 'שאלות ותשובות', description: COPY.responsa, group: 'pages',
    lastmod: maxIso([...questions.map(updated), ...answers.map(updated)]), noindex: false, ogType: 'website',
    image: hero(site)?.url ?? null, imageAlt: 'שאלות ותשובות', imageWidth: hero(site) ? 1600 : null, imageHeight: hero(site) ? 800 : null,
    jsonLd: graph([crumb(site, [{ name: 'בית', path: '/' }, { name: 'שו״ת', path: '/responsa' }])]),
    bodyHtml: `<h1>שאלות ותשובות</h1><h2>תשובות שאושרו לפרסום באתר</h2>${questionLinks(questions, 100) || '<p>עדיין לא פורסמו כאן תשובות.</p>'}<h2>תשובות במאגרים חיצוניים</h2>${itemLinks(answers, 100)}<p><a href="/ask">שאלה לרב</a></p>`,
  }));

  push(shell({
    path: '/ask', title: 'שאלה לרב', description: COPY.ask, group: 'pages', lastmod: null, noindex: false, ogType: 'website',
    image: hero(site)?.url ?? null, imageAlt: 'שאלה לרב', imageWidth: hero(site) ? 1600 : null, imageHeight: hero(site) ? 800 : null,
    jsonLd: graph([crumb(site, [{ name: 'בית', path: '/' }, { name: 'שאלה לרב', path: '/ask' }])]),
    bodyHtml: '<h1>שאלה לרב</h1><p>הטופס נטען עם האתר. שאלה אינה מתפרסמת ללא הסכמה ואישור.</p>',
  }));

  const institutions = input.institutions.filter(isPublic);
  const events = input.events.filter(isPublic);
  push(shell({
    path: '/institutions', title: 'מוסדות ופעילות', description: COPY.institutions, group: 'pages', lastmod: maxIso([...institutions, ...events].map(updated)),
    noindex: false, ogType: 'website', image: hero(site)?.url ?? null, imageAlt: 'מוסדות ופעילות', imageWidth: hero(site) ? 1600 : null, imageHeight: hero(site) ? 800 : null,
    jsonLd: graph([crumb(site, [{ name: 'בית', path: '/' }, { name: 'מוסדות', path: '/institutions' }])]),
    bodyHtml: `<h1>מוסדות ופעילות</h1>${institutions.map((i) => `<section><h2>${esc(i.name)}</h2>${i.description ? `<p>${esc(i.description)}</p>` : ''}${i.sourceUrls.filter((u) => safeUrl(u)).map((u) => `<p><a href="${esc(u)}" rel="noopener noreferrer">${esc(u)}</a></p>`).join('')}</section>`).join('')}${events.length ? `<h2>פעילות מתועדת</h2><ul>${events.map((e) => `<li>${esc(e.title)}${e.dateText ? ` — ${esc(e.dateText)}` : ''}${e.summary ? `: ${esc(e.summary)}` : ''}</li>`).join('')}</ul>` : ''}`,
  }));

  push(shell({
    path: '/sources', title: 'מקורות', description: COPY.sources, group: 'pages', lastmod: null, noindex: false, ogType: 'website',
    image: hero(site)?.url ?? null, imageAlt: 'מקורות', imageWidth: hero(site) ? 1600 : null, imageHeight: hero(site) ? 800 : null,
    jsonLd: graph([crumb(site, [{ name: 'בית', path: '/' }, { name: 'מקורות', path: '/sources' }])]),
    bodyHtml: `<h1>מקורות</h1><ul>${input.archives.map((a) => `<li>${esc(a.name)} — ${esc(a.material)}${safeUrl(a.url) ? ` — <a href="${esc(a.url)}" rel="noopener noreferrer">${esc(a.url)}</a>` : ''}</li>`).join('')}</ul>`,
  }));

  for (const p of pages) {
    const path = p.slug === 'about' ? '/about' : `/p/${p.slug}`;
    push(shell({
      path, title: p.title, description: clip(p.description || p.title), group: 'pages', lastmod: isoDate(p.updatedAt),
      noindex: false, ogType: 'article', image: hero(site)?.url ?? null, imageAlt: p.title, imageWidth: hero(site) ? 1600 : null, imageHeight: hero(site) ? 800 : null,
      jsonLd: graph([
        crumb(site, [{ name: 'בית', path: '/' }, { name: p.title, path }]),
        { '@type': 'Article', headline: p.title, description: p.description || p.title, inLanguage: 'he', ...(absoluteUrl(site, path) ? { url: absoluteUrl(site, path) } : {}) },
      ]),
      bodyHtml: `<article><h1>${esc(p.title)}</h1>${blocksToHtml(p.blocks)}</article>`,
    }));
  }

  for (const c of content) {
    const [main, sub] = splitTitle(c.title);
    const description = clip(c.summary || sub || c.attributionNote || `${TYPE_LABEL[c.type]} — ${main}`);
    const media = itemMedia(site, c, main);
    const itemTopics = c.topicIds.map((id) => topicById.get(id)).filter((t): t is Topic => !!t);
    const itemSeries = series.filter((s) => c.seriesIds.includes(s.id) || s.items.includes(c.id));
    const related = relatedItems(content, c, 8);
    const path = `/item/${c.slug}`;
    const book = c.bookDetails;
    push(shell({
      path, title: main, description, group: itemGroup(c.type), lastmod: updated(c), noindex: false,
      ogType: c.type === 'video' || c.type === 'short' || c.type === 'live' ? 'video.other' : 'article',
      image: media?.url ?? null, imageAlt: media ? main : null, imageWidth: media?.w ?? null, imageHeight: media?.h ?? null,
      jsonLd: contentJsonLd(site, c),
      bodyHtml: `<article><h1>${esc(main)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}<p>${esc(c.speaker ?? 'ערוץ מוסדות אור המאיר')} · ${esc(TYPE_LABEL[c.type])}${c.durationText ? ` · ${esc(c.durationText)}` : ''}</p>${c.summary ? `<p>${esc(c.summary)}</p>` : ''}${blocksToHtml(c.body)}${c.attributionNote ? `<p>${esc(c.attributionNote)}</p>` : ''}${book ? `<h2>פרטי הפרסום</h2><ul>${book.authorText ? `<li>מחבר / תוכן: ${esc(book.authorText)}</li>` : ''}${book.editorText ? `<li>עריכה: ${esc(book.editorText)}</li>` : ''}${book.publisher ? `<li>הוצאה: ${esc(book.publisher)}</li>` : ''}<li>מצב איתור: ${esc(book.locatedStatus)}</li></ul>` : ''}${itemTopics.length ? `<h2>נושאים</h2><p>${itemTopics.map((t) => `<a href="/topics/${esc(t.slug)}">${esc(t.name)}</a>`).join(' · ')}</p>` : ''}${itemSeries.length ? `<h2>סדרה</h2><p>${itemSeries.map((s) => `<a href="/series/${esc(s.slug)}">${esc(s.title)}</a>`).join(' · ')}</p>` : ''}<h2>מקורות</h2><ul>${c.sources.map((s) => `<li><a href="${esc(s.url)}" rel="noopener noreferrer">${esc(s.provider)}</a></li>`).join('')}</ul>${related.length ? `<h2>חומרים קשורים</h2>${itemLinks(related, 8)}` : ''}${c.type === 'answer' ? '<p><a href="/responsa">לכל השאלות והתשובות</a></p>' : ''}</article>`,
    }));
  }

  for (const q of questions) {
    const topic = q.topicId ? topicById.get(q.topicId) : undefined;
    const relatedQ = questions.filter((o) => o.id !== q.id && o.topicId && o.topicId === q.topicId).slice(0, 6);
    const path = `/responsa/${q.slug}`;
    const description = clip(q.questionText);
    push(shell({
      path, title: clip(q.questionText, 70), description, group: 'questions', lastmod: updated(q), noindex: false, ogType: 'article',
      image: hero(site)?.url ?? null, imageAlt: clip(q.questionText, 70), imageWidth: hero(site) ? 1600 : null, imageHeight: hero(site) ? 800 : null,
      jsonLd: questionJsonLd(site, q),
      bodyHtml: `<article><p>שאלה</p><h1>${esc(q.questionText)}</h1><h2>תשובה</h2>${blocksToHtml(q.answerBlocks) || (q.answerAudioUrl ? '<p>לתשובה יש הקלטה בעמוד זה.</p>' : '')}<p>${esc(q.attribution)}${q.approvedByRabbi ? ' · אושר על ידי הרב' : ''}</p>${topic ? `<p>נושא: <a href="/topics/${esc(topic.slug)}">${esc(topic.name)}</a></p>` : ''}${relatedQ.length ? `<h2>שאלות קשורות</h2>${questionLinks(relatedQ, 6)}` : ''}<p><a href="/responsa">כל השאלות והתשובות</a> · <a href="/ask">שאלה לרב</a></p></article>`,
    }));
  }

  const redirects = input.redirects.reduce<SeoRedirect[]>((list, r) => rememberRedirect(list, r.fromPath, r.toPath), []);
  return { documents, redirects };
}

export function breadcrumbJsonLd(site: string, items: { name: string; path?: string }[]): Record<string, unknown> | null {
  const node = crumb(site, items);
  return node ? { '@context': 'https://schema.org', '@graph': [node] } : null;
}

export function contentJsonLd(site: string, item: ContentItem): Record<string, unknown> | null {
  const [main, sub] = splitTitle(item.title);
  const answerText = [item.summary, blocksText(item.body)].filter(Boolean).join('\n\n');
  const description = clip(item.summary || sub || item.attributionNote || `${TYPE_LABEL[item.type]} — ${main}`);
  const media = itemMedia(site, item, main);
  const path = `/item/${item.slug}`;
  const video = videoNode(site, item, main, description);
  const qa = item.type === 'answer' ? qaFromParts(site, path, main, answerText, isoDate(item.publishedAt), item.speaker) : null;
  const nodes: (Record<string, unknown> | null)[] = [
    crumb(site, [{ name: 'בית', path: '/' }, { name: 'ספרייה', path: '/library' }, { name: TYPE_LABEL[item.type], path: `/library?type=${item.type}` }, { name: main, path }]),
  ];
  if (video) nodes.push(video);
  else if (qa) nodes.push(qa);
  else if (answerText) nodes.push(articleNode(site, item, main, description, media?.url ?? null));
  else nodes.push({ '@type': 'WebPage', name: main, description, inLanguage: 'he', ...(absoluteUrl(site, path) ? { url: absoluteUrl(site, path) } : {}) });
  return graph(nodes);
}

export function questionJsonLd(site: string, q: PublicQuestion): Record<string, unknown> | null {
  const path = `/responsa/${q.slug}`;
  return graph([
    crumb(site, [{ name: 'בית', path: '/' }, { name: 'שו״ת', path: '/responsa' }, { name: clip(q.questionText, 70), path }]),
    qaFromParts(site, path, q.questionText, blocksText(q.answerBlocks), isoDate(q.publishedAt), q.attribution || null),
  ]);
}

export function headHtml(doc: SeoDocument, site: string): string {
  const full = doc.title ? `${doc.title} | ${SITE_NAME}` : HOME_TITLE;
  const canon = doc.noindex ? null : absoluteUrl(site, doc.path);
  const desc = clip(doc.description, 200);
  const lines = [
    `<title>${esc(full)}</title>`,
    `<meta name="description" content="${esc(desc)}" />`,
    doc.noindex ? '<meta name="robots" content="noindex, nofollow" />' : '',
    canon ? `<link rel="canonical" href="${esc(canon)}" />` : '',
    canon ? `<link rel="alternate" hreflang="he" href="${esc(canon)}" />` : '',
    canon ? `<link rel="alternate" hreflang="he-IL" href="${esc(canon)}" />` : '',
    canon ? `<link rel="alternate" hreflang="x-default" href="${esc(canon)}" />` : '',
    `<meta property="og:site_name" content="${esc(SITE_NAME)}" />`,
    `<meta property="og:title" content="${esc(full)}" />`,
    `<meta property="og:description" content="${esc(desc)}" />`,
    `<meta property="og:type" content="${doc.ogType}" />`,
    `<meta property="og:locale" content="he_IL" />`,
    canon ? `<meta property="og:url" content="${esc(canon)}" />` : '',
    doc.image ? `<meta property="og:image" content="${esc(doc.image)}" />` : '',
    doc.image && doc.imageAlt ? `<meta property="og:image:alt" content="${esc(doc.imageAlt)}" />` : '',
    doc.image && doc.imageWidth ? `<meta property="og:image:width" content="${doc.imageWidth}" />` : '',
    doc.image && doc.imageHeight ? `<meta property="og:image:height" content="${doc.imageHeight}" />` : '',
    `<meta name="twitter:card" content="${doc.image ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${esc(full)}" />`,
    `<meta name="twitter:description" content="${esc(desc)}" />`,
    doc.image ? `<meta name="twitter:image" content="${esc(doc.image)}" />` : '',
    doc.extraHead,
    doc.jsonLd ? `<script type="application/ld+json">${JSON.stringify(doc.jsonLd).replace(/</g, '\\u003c')}</script>` : '',
  ];
  return lines.filter(Boolean).join('\n    ');
}

export function prerenderBody(doc: SeoDocument): string {
  const nav = `<nav aria-label="ניווט">${NAV.map(([href, label]) => `<a href="${href}">${label}</a>`).join(' · ')}</nav>`;
  return `<div class="container prerendered">${nav}<main>${doc.bodyHtml}</main></div>`;
}

export function notFoundDocument(): SeoDocument {
  return shell({
    path: '/404', title: 'העמוד לא נמצא', description: 'העמוד המבוקש אינו קיים או שאינו מפורסם.',
    image: null, imageAlt: null, imageWidth: null, imageHeight: null, ogType: 'website', noindex: true,
    jsonLd: null, bodyHtml: '<h1>העמוד לא נמצא</h1><p><a href="/">חזרה לדף הבית</a></p>', lastmod: null, group: 'pages',
  });
}

export function renderStandalone(doc: SeoDocument, site: string, assets: { head: string; body: string }): string {
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="color-scheme" content="light dark" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    ${headHtml(doc, site)}
    ${assets.head}
    <script src="/theme-init.js"></script>
</head>
<body>
    <div id="root">${prerenderBody(doc)}</div>
    ${assets.body}
</body>
</html>`;
}

export function extractAssetTags(html: string): { head: string; body: string } {
  const head: string[] = [];
  const body: string[] = [];
  for (const m of html.matchAll(/<link\b[^>]*>/g)) {
    if (/rel="(?:stylesheet|modulepreload)"/.test(m[0])) head.push(m[0]);
  }
  for (const m of html.matchAll(/<script\b[^>]*\bsrc="\/assets\/[^"]+"[^>]*>\s*<\/script>/g)) body.push(m[0]);
  return { head: head.join('\n'), body: body.join('\n') };
}

export function sitemapIndex(site: string, documents: SeoDocument[]): string {
  const groups = SITEMAP_GROUPS.filter((g) => documents.some((d) => d.group === g && !d.noindex));
  const body = groups.map((g) => {
    const loc = absoluteUrl(site, `/sitemap-${g}.xml`);
    const last = day(maxIso(documents.filter((d) => d.group === g).map((d) => d.lastmod)));
    return `  <sitemap><loc>${esc(loc ?? '')}</loc>${last ? `<lastmod>${esc(last)}</lastmod>` : ''}</sitemap>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
}

export function sitemapUrlset(site: string, documents: SeoDocument[]): string {
  const urls = documents.filter((d) => !d.noindex).flatMap((d) => {
    const loc = absoluteUrl(site, d.path);
    if (!loc) return [];
    const last = day(d.lastmod);
    return [`  <url><loc>${esc(loc)}</loc>${last ? `<lastmod>${esc(last)}</lastmod>` : ''}</url>`];
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

export function robotsTxt(site: string): string {
  const base = site.replace(/\/$/, '');
  const lines = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /track',
    'Disallow: /favorites',
    'Disallow: /accept',
    'Disallow: /api/',
    ...(base ? [`Sitemap: ${base}/sitemap.xml`] : []),
  ];
  return `${lines.join('\n')}\n`;
}

const STATIC_PAGES = new Set(['/', '/library', '/series', '/topics', '/books', '/responsa', '/ask', '/about', '/institutions', '/sources']);

export function seoKind(pathname: string, search: URLSearchParams): SeoKind | null {
  if (pathname === '/sitemap.xml' || pathname === '/api/seo/sitemap') return { type: 'sitemap-index' };
  const child = pathname.match(/^\/sitemap-([a-z]+)\.xml$/) ?? pathname.match(/^\/api\/seo\/sitemap\/([a-z]+)$/);
  if (child) return { type: 'sitemap', group: child[1] };
  if (pathname === '/robots.txt' || pathname === '/api/seo/robots') return { type: 'robots' };
  if (pathname === '/indexnow-key.txt' || pathname === '/api/seo/indexnow-key') return { type: 'indexnow' };
  if (pathname === '/api/seo/page') {
    const given = search.get('path');
    return given ? { type: 'page', path: normalizePath(given) } : null;
  }
  const path = normalizePath(pathname);
  if (STATIC_PAGES.has(path) || /^\/(?:item|responsa|topics|series|p)\/[^/]+$/.test(path)) return { type: 'page', path };
  return null;
}

/** URLs to submit after a successful publish. Same host only, plus the sitemap. */
export function indexNowTargets(site: string, op: string, args: Record<string, unknown>, result: unknown): string[] {
  const base = site.replace(/\/$/, '');
  if (!base) return [];
  let path: string | null = null;
  if (op === 'admin.publishQuestion') {
    const slug = (result as { slug?: unknown } | null)?.slug;
    path = typeof slug === 'string' ? entityPath('publicQuestions', slug) : null;
  } else if (op === 'admin.transition' && args.to === 'published') {
    const rec = result as { slug?: unknown; status?: unknown } | null;
    if (rec && rec.status === 'published' && typeof rec.slug === 'string') path = entityPath(String(args.entity ?? ''), rec.slug);
  } else if (op === 'admin.update') {
    const patch = args.patch as { slug?: unknown } | undefined;
    const rec = result as { slug?: unknown; status?: unknown } | null;
    if (patch && typeof patch.slug === 'string' && rec && rec.status === 'published' && typeof rec.slug === 'string') {
      path = entityPath(String(args.entity ?? ''), rec.slug);
    }
  }
  const page = path ? absoluteUrl(base, path) : null;
  return page ? [page, `${base}/sitemap.xml`] : [];
}

function itemGroup(type: ContentType): SitemapGroup {
  if (type === 'video' || type === 'short' || type === 'live') return 'video';
  if (type === 'audio') return 'audio';
  if (type === 'answer') return 'answers';
  return 'writing';
}
