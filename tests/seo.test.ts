import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pingIndexNow } from '../server/indexnow.ts';
import {
  buildCatalog, contentJsonLd, followRedirect, headHtml, indexNowTargets, internalTarget,
  publicSlug, questionJsonLd, rememberRedirect, robotsTxt, sitemapIndex, sitemapUrlset,
  type SeoCatalog, type SeoDocument,
} from '../src/shared/seo.ts';
import type { ContentItem, MediaSource, PublicQuestion } from '../src/shared/types.ts';

const SITE = 'https://elyashar.online';

function item(over: Partial<ContentItem> & Pick<ContentItem, 'slug' | 'title' | 'type'>): ContentItem {
  return {
    id: 'c1', summary: null, body: [], speaker: 'הרב ליאור כהן', attributionStatus: 'source_page',
    attributionNote: null, eventDate: null, eventDateText: null, sourcePublishedDate: null,
    durationSeconds: null, durationText: null, status: 'published', publishedAt: '2024-03-15T00:00:00.000Z',
    featured: false, verification: 'located', provenance: [], duplicateGroup: null, catalogOrder: 1,
    topicIds: [], seriesIds: [], sources: [], bookDetails: null, version: 1,
    createdAt: '2024-03-15T00:00:00.000Z', updatedAt: '2024-03-15T12:00:00.000Z', deletedAt: null,
    ...over,
  };
}

function youtube(id: string): MediaSource {
  return {
    id: 's1', contentId: 'c1', provider: 'youtube', providerId: id, url: `https://www.youtube.com/watch?v=${id}`,
    canonicalUrl: `https://www.youtube.com/watch?v=${id}`, deliveryMode: 'embed', kind: 'media', mime: null,
    filesize: null, durationSeconds: 90, checksum: null, rightsStatus: 'embed_only', rightsEvidence: null,
    embedStatus: 'ok', lastCheckedAt: null, error: null, isPrimary: true, storageBucket: null, storagePath: null,
  };
}

function question(over: Partial<PublicQuestion> = {}): PublicQuestion {
  return {
    id: 'q1', slug: 'שאלה', questionText: 'האם מותר להזכיר את שם האם בתפילה?', answerBlocks: [],
    answerAudioUrl: null, topicId: null, attribution: 'הרב ליאור כהן', approvedByRabbi: true,
    publishedAt: '2024-04-01T00:00:00.000Z', status: 'published', version: 1, deletedAt: null,
    ...over,
  };
}

function doc(over: Partial<SeoDocument> = {}): SeoDocument {
  return {
    path: '/about', title: 'אודות', description: 'עמוד אודות', image: `${SITE}/images/hero-rabbi-1600.webp`,
    imageAlt: 'אור המאיר', imageWidth: 1600, imageHeight: 800, ogType: 'article', noindex: false,
    jsonLd: { '@type': 'WebPage', name: 'אודות' }, bodyHtml: '<p>תוכן</p>', lastmod: '2024-05-02T08:00:00.000Z',
    group: 'pages', extraHead: '', ...over,
  };
}

test('publicSlug keeps a uniqueness suffix and is idempotent', () => {
  const slug = 'הזכרת-שם-האם-בתפילה-4f6af6';
  assert.equal(publicSlug(slug), slug);
  assert.equal(publicSlug(publicSlug(slug)), slug);
  assert.equal(publicSlug('שיעור חדש'), 'שיעור-חדש');
});

test('redirects collapse chains and reject off-site targets', () => {
  assert.equal(internalTarget('https://evil.example/phish'), null);
  assert.equal(internalTarget('//evil.example/phish'), null);
  assert.equal(internalTarget('/item/חדש'), '/item/חדש');
  let list = rememberRedirect([], '/item/a', '/item/b');
  list = rememberRedirect(list, '/item/b', '/item/c');
  assert.equal(followRedirect(list, '/item/a'), '/item/c');
  assert.equal(followRedirect(list, '/item/b'), '/item/c');
  const poisoned = rememberRedirect(list, '/item/c', 'https://evil.example/phish');
  assert.equal(followRedirect(poisoned, '/item/a'), '/item/c');
  assert.equal(followRedirect(poisoned, '/item/c'), null);
});

test('sitemap index and urlset carry lastmod and encoded Hebrew locs', () => {
  const documents = [doc({ path: '/item/הזכרת-שם-האם', group: 'answers', lastmod: '2024-03-15T12:00:00.000Z' })];
  const index = sitemapIndex(SITE, documents);
  assert.match(index, /<sitemapindex/);
  assert.match(index, /sitemap-answers\.xml/);
  assert.match(index, /<lastmod>2024-03-15<\/lastmod>/);
  const set = sitemapUrlset(SITE, documents);
  assert.match(set, /<lastmod>2024-03-15<\/lastmod>/);
  assert.match(set, /%D7%94%D7%96%D7%9B%D7%A8%D7%AA/);
  assert.doesNotMatch(set, /<loc>[^<]*הזכרת/);
});

test('head includes canonical, hreflang, Open Graph and Twitter, and no refresh', () => {
  const html = headHtml(doc(), SITE);
  assert.match(html, /rel="canonical" href="https:\/\/elyashar\.online\/about"/);
  assert.match(html, /hreflang="he"/);
  assert.match(html, /hreflang="he-IL"/);
  assert.match(html, /hreflang="x-default"/);
  assert.match(html, /property="og:image"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /property="og:locale" content="he_IL"/);
  assert.doesNotMatch(html, /http-equiv/i);
  assert.doesNotMatch(html, /refresh/i);
});

test('QAPage requires answer text; VideoObject requires a stored date', () => {
  const empty = contentJsonLd(SITE, item({ slug: 'thin', title: 'כותרת בלבד', type: 'answer' }));
  assert.equal(JSON.stringify(empty).includes('QAPage'), false);
  const answered = contentJsonLd(SITE, item({
    slug: 'answered', title: 'תשובה', type: 'answer', summary: 'תקציר התשובה כפי שנשמר.',
  }));
  assert.match(JSON.stringify(answered), /QAPage/);
  assert.match(JSON.stringify(answered), /תקציר התשובה כפי שנשמר/);
  const qEmpty = questionJsonLd(SITE, question());
  assert.equal(JSON.stringify(qEmpty).includes('QAPage'), false);
  const qFull = questionJsonLd(SITE, question({ answerBlocks: [{ type: 'paragraph', text: 'נוסח התשובה שאושר.' }] }));
  assert.match(JSON.stringify(qFull), /QAPage/);
  assert.match(JSON.stringify(qFull), /נוסח התשובה שאושר/);

  const undated = contentJsonLd(SITE, item({
    slug: 'video', title: 'שיעור', type: 'video', publishedAt: null, sources: [youtube('abcdefghijk')],
  }));
  assert.equal(JSON.stringify(undated).includes('VideoObject'), false);
  const dated = contentJsonLd(SITE, item({
    slug: 'video', title: 'שיעור', type: 'video', sourcePublishedDate: '2020-01-02', sources: [youtube('abcdefghijk')],
  }));
  const json = JSON.stringify(dated);
  assert.match(json, /VideoObject/);
  assert.match(json, /hqdefault\.jpg/);
  assert.match(json, /embedUrl/);
  assert.equal(json.includes('contentUrl'), false);
  assert.match(json, /2020-01-02/);
});

test('IndexNow targets stay on this host and include the sitemap', () => {
  assert.deepEqual(indexNowTargets('', 'admin.publishQuestion', {}, { slug: 'שאלה' }), []);
  const urls = indexNowTargets(SITE, 'admin.publishQuestion', {}, { slug: 'שאלה' });
  assert.deepEqual(urls, [`${SITE}/responsa/${encodeURI('שאלה')}`, `${SITE}/sitemap.xml`]);
  assert.equal(urls.every((u) => new URL(u).host === 'elyashar.online'), true);
  assert.deepEqual(indexNowTargets(SITE, 'admin.update', { entity: 'content', patch: { slug: 'חדש' } }, { slug: 'חדש', status: 'draft' }), []);
});

test('robots names the sitemap only when a site URL exists', () => {
  assert.match(robotsTxt(SITE), /Sitemap: https:\/\/elyashar\.online\/sitemap\.xml/);
  assert.equal(robotsTxt('').includes('Sitemap:'), false);
  assert.match(robotsTxt(''), /Disallow: \/api\//);
});

test('catalog HTML links a question to its topic and keeps source links on the page', () => {
  const catalog: SeoCatalog = {
    site: SITE,
    content: [item({
      id: 'c1', slug: 'שיעור', title: 'שיעור', type: 'audio', topicIds: ['t1'],
      sources: [{ ...youtube('abcdefghijk'), provider: 'ykr', providerId: null, url: 'https://www.ykr.co.il/example', canonicalUrl: 'https://www.ykr.co.il/example' }],
    })],
    topics: [{ id: 't1', slug: 'הלכה', name: 'הלכה', description: null, sort: 1, status: 'published', version: 1, deletedAt: null }],
    series: [], pages: [], questions: [question({ topicId: 't1', answerBlocks: [{ type: 'paragraph', text: 'תשובה בנושא.' }] })],
    institutions: [], events: [], archives: [], redirects: [],
  };
  const { documents } = buildCatalog(catalog);
  const lesson = documents.find((d) => d.path === '/item/שיעור');
  assert.ok(lesson);
  assert.match(lesson.bodyHtml, /href="\/topics\/הלכה"/);
  assert.match(lesson.bodyHtml, /rel="noopener noreferrer"/);
  assert.doesNotMatch(lesson.bodyHtml, /http-equiv/i);
  const topic = documents.find((d) => d.path === '/topics/הלכה');
  assert.match(topic?.bodyHtml ?? '', /href="\/responsa\//);
});

test('IndexNow posts same-host URLs and skips a missing key', async () => {
  assert.deepEqual(await pingIndexNow({ siteUrl: SITE, key: '', urls: [`${SITE}/item/a`] }), { skipped: true, status: null });
  const calls: { url: string; body: string }[] = [];
  const result = await pingIndexNow({
    siteUrl: SITE,
    key: 'abcd1234',
    urls: [`${SITE}/item/a`, 'https://evil.example/item/a', `${SITE}/sitemap.xml`],
    fetchImpl: (async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body ?? '') });
      return new Response('ok', { status: 202 });
    }) as typeof fetch,
  });
  assert.equal(result.skipped, false);
  assert.equal(result.status, 202);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, 'https://api.indexnow.org/indexnow');
  const payload = JSON.parse(calls[0]!.body) as { host: string; urlList: string[]; keyLocation: string };
  assert.equal(payload.host, 'elyashar.online');
  assert.deepEqual(payload.urlList, [`${SITE}/item/a`, `${SITE}/sitemap.xml`]);
  assert.equal(payload.keyLocation, `${SITE}/indexnow-key.txt`);
  assert.equal(payload.urlList.some((u) => u.includes('evil.example')), false);
});
