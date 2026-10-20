// Dynamic SEO responses: sitemap, robots, IndexNow key, and HTML for content URLs
// that were not in the last static build (a publish after deploy).
import { readFileSync } from 'node:fs';
import {
  SITEMAP_GROUPS, absoluteUrl, buildCatalog, followRedirect, headHtml, notFoundDocument,
  prerenderBody, renderStandalone, robotsTxt, seoKind, sitemapIndex, sitemapUrlset,
  type SeoCatalog, type SitemapGroup,
} from '../src/shared/seo.ts';

export interface SeoRuntime {
  siteUrl: string;
  indexNowKey: string;
  catalog: () => Promise<SeoCatalog>;
  shell: { head: string; body: string };
}

const XML = 'application/xml; charset=utf-8';
const TEXT = 'text/plain; charset=utf-8';
const HTML = 'text/html; charset=utf-8';

function headers(contentType: string, cache: string, extra: Record<string, string> = {}): Headers {
  return new Headers({
    'content-type': contentType,
    'cache-control': cache,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    ...extra,
  });
}

export function readShell(): { head: string; body: string } {
  try {
    const raw = readFileSync(new URL('./seo-shell.json', import.meta.url), 'utf8');
    const parsed = JSON.parse(raw) as { head?: unknown; body?: unknown };
    return { head: typeof parsed.head === 'string' ? parsed.head : '', body: typeof parsed.body === 'string' ? parsed.body : '' };
  } catch {
    return { head: '', body: '' };
  }
}

export async function loadDefaultSeoCatalog(site: string): Promise<SeoCatalog> {
  const empty: SeoCatalog = {
    site, content: [], topics: [], series: [], pages: [], questions: [], institutions: [], events: [], archives: [], redirects: [],
  };
  if (!process.env.DATABASE_URL) return empty;
  const { withActor } = await import('./db.ts');
  const { loadSeoCatalog } = await import('./store.ts');
  const data = await withActor(null, loadSeoCatalog);
  return { ...data, site };
}

function locationFor(site: string, path: string): string {
  return absoluteUrl(site, path) ?? encodeURI(path);
}

export async function seoResponse(req: Request, rt: SeoRuntime): Promise<Response | null> {
  if (req.method !== 'GET' && req.method !== 'HEAD') return null;
  const url = new URL(req.url);
  const kind = seoKind(url.pathname, url.searchParams);
  if (!kind) return null;
  const site = rt.siteUrl.replace(/\/$/, '');
  if (kind.type === 'robots') {
    return new Response(req.method === 'HEAD' ? null : robotsTxt(site), { headers: headers(TEXT, 'public, max-age=300') });
  }
  if (kind.type === 'indexnow') {
    if (!/^[A-Za-z0-9-]{8,128}$/.test(rt.indexNowKey)) return new Response('not found', { status: 404, headers: headers(TEXT, 'no-store') });
    return new Response(req.method === 'HEAD' ? null : rt.indexNowKey, { headers: headers(TEXT, 'public, max-age=3600') });
  }
  let built: ReturnType<typeof buildCatalog>;
  try {
    built = buildCatalog(await rt.catalog());
  } catch (e) {
    console.error('[seo] catalog failed:', e instanceof Error ? e.name : 'unknown');
    return new Response('sitemap unavailable', { status: 503, headers: headers(TEXT, 'no-store') });
  }
  if (kind.type === 'sitemap-index' || kind.type === 'sitemap') {
    if (!site) return new Response('not found', { status: 404, headers: headers(TEXT, 'no-store') });
    if (kind.type === 'sitemap' && !(SITEMAP_GROUPS as readonly string[]).includes(kind.group ?? '')) {
      return new Response('not found', { status: 404, headers: headers(TEXT, 'no-store') });
    }
    const body = kind.type === 'sitemap-index'
      ? sitemapIndex(site, built.documents)
      : sitemapUrlset(site, built.documents.filter((d) => d.group === kind.group));
    return new Response(req.method === 'HEAD' ? null : body, { headers: headers(XML, 'public, max-age=300') });
  }
  const requested = kind.path ?? '/';
  const redirected = followRedirect(built.redirects, requested);
  const canonicalPath = redirected ?? requested;
  // Percent-encoded Hebrew is the same path. A trailing slash is not.
  let visible = url.pathname;
  try { visible = decodeURI(visible); } catch { /* keep the raw path */ }
  const trailingSlash = !url.pathname.startsWith('/api/') && visible.length > 1 && visible.endsWith('/');
  if ((redirected && redirected !== requested) || trailingSlash) {
    const dest = redirected && redirected !== requested ? redirected : canonicalPath;
    return new Response(null, { status: 301, headers: headers(TEXT, 'public, max-age=3600', { location: locationFor(site, dest) }) });
  }
  const doc = built.documents.find((d) => d.path === canonicalPath) ?? null;
  if (!doc) {
    const missing = notFoundDocument();
    const html = renderStandalone(missing, site, rt.shell);
    return new Response(req.method === 'HEAD' ? null : html, {
      status: 404,
      headers: headers(HTML, 'no-store', { 'x-robots-tag': 'noindex, nofollow' }),
    });
  }
  const html = rt.shell.head || rt.shell.body
    ? renderStandalone(doc, site, rt.shell)
    : `<!doctype html><html lang="he" dir="rtl"><head>${headHtml(doc, site)}</head><body><div id="root">${prerenderBody(doc)}</div></body></html>`;
  return new Response(req.method === 'HEAD' ? null : html, { headers: headers(HTML, 'public, max-age=60, stale-while-revalidate=600') });
}

export function isSitemapGroup(group: string): group is SitemapGroup {
  return (SITEMAP_GROUPS as readonly string[]).includes(group);
}
