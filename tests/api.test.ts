import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../server/db.ts';
import { handle, type Deps } from '../server/handlers.ts';
import { dispatch } from '../server/store.ts';
import { sha256Hex } from '../src/shared/questions.ts';
import { SsrfError } from '../server/lib/ssrf.ts';
import type { SeoCatalog } from '../src/shared/seo.ts';
import type { ContentItem, PublicQuestion } from '../src/shared/types.ts';

// In-memory stand-in for the database client. SQL authorization is covered by neon/verify/rls_checks.sql.
function mockDeps(over: Partial<Deps> = {}) {
  const rows: Record<string, unknown>[] = [];
  const buckets = new Map<string, number>();
  const roles: Record<string, string[]> = { 'jwt-editor': ['editor'], 'jwt-viewer': ['viewer'] };
  const deps: Deps = {
    env: { databaseUrl: 'postgres://local/test', authSecret: 'test-secret-16chars', rateSalt: 'salt', importAllowlist: ['kol-barama.co.il'], siteUrl: '', turnstileSecret: '', indexNowKey: '', configured: true },
    now: Date.now,
    probe: async (u) => { if (u.includes('127.0.0.1')) throw new SsrfError('blocked'); return { finalUrl: u, status: 200, contentType: 'audio/mpeg', contentLength: 1234, redirects: 0, bytesRead: 0 }; },
    client: {
      insertQuestion: async (r: Record<string, unknown>) => { rows.push(r); return null; },
      rateLimit: async (bucket: string, _window: number, max: number) => {
        const n = (buckets.get(bucket) ?? 0) + 1;
        buckets.set(bucket, n);
        return n <= max;
      },
      questionByCode: async (code: string) => rows.filter((r) => r.tracking_code === code).map((r) => ({ token_hash: r.token_hash as string, notify_token_hash: null, answer_audio_path: 'a/b.mp3', status: 'private_delivered', approved_by: 'rabbi' })),
      signPrivate: async () => ({ url: '/api/media/private-submissions/a/b.mp3?exp=1&sig=abc' }),
      userFromToken: async (token: string) => (roles[token] ? { id: token } : null),
      rolesOf: async (id: string) => (roles[id] ?? []).map((role) => ({ role })),
      listUsers: async () => [],
      allRoles: async () => [],
      invite: async () => ({ token: 'invite-token', expiresAt: new Date(0).toISOString() }),
      followUp: async () => ({ trackingCode: 'ABCD-EFGH', token: 't'.repeat(43) }),
      attachVoice: async () => undefined,
      insertSignup: async (row: { channel: string; contact: string }) => {
        if (rows.some((r) => r.channel === row.channel && r.contact === row.contact)) return 'exists' as const;
        rows.push(row);
        return 'created' as const;
      },
      insertContact: async (r: Record<string, unknown>) => { rows.push({ kind: 'contact', ...r }); },
    },
    ...over,
  };
  return { deps, rows };
}
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://x${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const q = (extra: Record<string, unknown> = {}) => ({ questionText: 'שאלה בהלכות שבת לבדיקה', isAnonymous: true, publishConsent: false, website: '', startedAt: Date.now() - 5000, ...extra });

test('submit: stores only the token hash; returns code + token once', async () => {
  const { deps, rows } = mockDeps();
  const res = await handle(post('/api/questions', q()), '1.1.1.1', deps);
  assert.equal(res.status, 201);
  const body = (await res.json()) as { trackingCode: string; token: string };
  assert.match(body.trackingCode, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.token_hash, await sha256Hex(body.token));
  assert.ok(!JSON.stringify(rows).includes(body.token), 'raw token not stored');
  assert.ok(!JSON.stringify(rows).includes('1.1.1.1'), 'raw IP not stored');
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('submit: honeypot, too-fast, invalid, oversized and rate-limited requests', async () => {
  const { deps } = mockDeps();
  assert.equal((await handle(post('/api/questions', q({ website: 'http://spam' })), '2.2.2.2', deps)).status, 400);
  assert.equal((await handle(post('/api/questions', q({ startedAt: Date.now() })), '2.2.2.2', deps)).status, 400);
  assert.equal((await handle(post('/api/questions', q({ questionText: 'קצר' })), '2.2.2.2', deps)).status, 422);
  assert.equal((await handle(post('/api/questions', q({ questionText: 'א'.repeat(20000) })), '2.2.2.2', deps)).status, 413);
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await handle(post('/api/questions', q()), '3.3.3.3', deps)).status);
  assert.deepEqual(codes, [201, 201, 201, 429]);
});

test('submit without a database configured is refused (no fake success)', async () => {
  const { deps } = mockDeps({ client: null });
  deps.env.configured = false;
  assert.equal((await handle(post('/api/questions', q()), '4.4.4.4', deps)).status, 503);
});

test('voice answer: token verified server-side; short signed URL', async () => {
  const { deps } = mockDeps();
  const created = (await (await handle(post('/api/questions', q()), '5.5.5.5', deps)).json()) as { trackingCode: string; token: string };
  assert.equal((await handle(post('/api/questions/voice', { code: created.trackingCode, token: 'w'.repeat(43) }), '5.5.5.5', deps)).status, 404);
  const ok = await handle(post('/api/questions/voice', { code: created.trackingCode, token: created.token }), '5.5.5.5', deps);
  assert.equal(ok.status, 200);
  const b = (await ok.json()) as { url: string; expiresIn: number };
  assert.match(b.url, /^\/api\/media\/private-submissions\//);
  assert.equal(b.expiresIn, 300);
});

test('probe: requires staff; SSRF errors surface as 400', async () => {
  const { deps } = mockDeps();
  assert.equal((await handle(post('/api/import/probe', { url: 'https://kol-barama.co.il/a.mp3' }), '6.6.6.6', deps)).status, 401);
  assert.equal((await handle(post('/api/import/probe', { url: 'https://kol-barama.co.il/a.mp3' }, { authorization: 'Bearer jwt-viewer' }), '6.6.6.6', deps)).status, 403);
  const ok = await handle(post('/api/import/probe', { url: 'https://kol-barama.co.il/a.mp3' }, { authorization: 'Bearer jwt-editor' }), '6.6.6.6', deps);
  assert.equal(ok.status, 200);
  assert.equal(((await ok.json()) as { playableNatively: boolean }).playableNatively, true);
  assert.equal((await handle(post('/api/import/probe', { url: 'https://127.0.0.1/x' }, { authorization: 'Bearer jwt-editor' }), '6.6.6.6', deps)).status, 400);
});

test('turnstile: a configured secret rejects a missing token without calling the network', async () => {
  const { deps } = mockDeps();
  deps.env.turnstileSecret = 'test-secret';
  const realFetch = globalThis.fetch;
  globalThis.fetch = (() => { throw new Error('network'); }) as typeof fetch;
  try {
    const res = await handle(post('/api/questions', q()), '9.9.9.9', deps);
    assert.equal(res.status, 400);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('updates: stores email or mobile, no send, refuses bots and floods', async () => {
  const { deps, rows } = mockDeps();
  const good = { channel: 'email', contact: 'Reader@Example.com', consent: true, website: '', startedAt: Date.now() - 5000 };
  const created = await handle(post('/api/updates', good), '8.8.8.8', deps);
  assert.equal(created.status, 201);
  assert.deepEqual(await created.json(), { ok: true });
  assert.equal(rows[0]!.contact, 'reader@example.com');
  assert.equal(rows[0]!.channel, 'email');
  const again = await handle(post('/api/updates', good), '8.8.8.8', deps);
  assert.equal(again.status, 201);
  assert.equal(rows.length, 1);
  assert.equal((await handle(post('/api/updates', { ...good, website: 'x' }), '8.8.8.9', deps)).status, 400);
  assert.equal((await handle(post('/api/updates', { ...good, startedAt: Date.now() }), '8.8.8.10', deps)).status, 400);
  assert.equal((await handle(post('/api/updates', { ...good, consent: false }), '8.8.8.11', deps)).status, 422);
  assert.equal((await handle(post('/api/updates', { ...good, channel: 'whatsapp', contact: '03-111' }), '8.8.8.12', deps)).status, 422);
  const phone = await handle(post('/api/updates', { ...good, channel: 'whatsapp', contact: '+972525556677' }), '8.8.8.13', deps);
  assert.equal(phone.status, 201);
  assert.equal(rows.find((r) => r.channel === 'whatsapp')!.contact, '0525556677');
  const off = mockDeps({ client: null });
  off.deps.env.configured = false;
  assert.equal((await handle(post('/api/updates', good), '8.8.8.14', off.deps)).status, 503);
  const flood = mockDeps();
  const codes = [];
  for (let i = 0; i < 6; i++) codes.push((await handle(post('/api/updates', { ...good, contact: `u${i}@example.com` }), '8.8.8.15', flood.deps)).status);
  assert.deepEqual(codes, [201, 201, 201, 201, 201, 429]);
});

test('contact: stores the message, refuses bots, and does not fake success offline', async () => {
  const { deps, rows } = mockDeps();
  const now = Date.now();
  deps.now = () => now;
  const msg = { name: 'דוד', email: 'a@b.co', subject: 'שלום', body: 'פנייה כללית לבדיקת השרת', website: '', startedAt: now - 5000 };
  const res = await handle(post('/api/contact', msg), '8.8.8.8', deps);
  assert.equal(res.status, 201);
  assert.equal(rows.filter((r) => r.kind === 'contact').length, 1);
  assert.equal((await handle(post('/api/contact', { ...msg, website: 'x' }), '8.8.8.9', deps)).status, 400);
  assert.equal((await handle(post('/api/contact', { ...msg, email: 'bad' }), '8.8.8.10', deps)).status, 422);
  const offline = mockDeps({ client: null });
  offline.deps.env.configured = false;
  offline.deps.now = () => now;
  assert.equal((await handle(post('/api/contact', msg), '8.8.8.11', offline.deps)).status, 503);
});

test('malformed admin.get and admin.update return 400', async () => {
  await assert.rejects(() => dispatch('admin.get', { entity: 'content', id: null }, 'user', 'secret'), (e: unknown) => e instanceof ApiError && e.status === 400);
  await assert.rejects(() => dispatch('admin.update', { entity: 'content', id: '00000000-0000-4000-a000-000000000099', expectedVersion: 1 }, 'user', 'secret'), (e: unknown) => e instanceof ApiError && e.status === 400);
  await assert.rejects(() => dispatch('admin.get', { entity: 'content', id: null }, null, 'secret'), (e: unknown) => e instanceof ApiError && e.status === 401);
});

test('admin users endpoint requires admin/owner', async () => {
  const { deps } = mockDeps();
  const res = await handle(new Request('http://x/api/admin/users', { headers: { authorization: 'Bearer jwt-editor' } }), '7.7.7.7', deps);
  assert.equal(res.status, 403);
  assert.equal((await handle(new Request('http://x/api/nope'), '7.7.7.7', deps)).status, 404);
});

const SITE = 'https://elyashar.online';

function seoCatalog(): SeoCatalog {
  const answer: ContentItem = {
    id: 'c-answer', slug: 'תשובה-לדוגמה', type: 'answer', title: 'תשובה לדוגמה',
    summary: null, body: [{ type: 'paragraph', text: 'התשובה המלאה מופיעה כאן לקורא ולמנוע החיפוש.' }],
    speaker: 'הרב ליאור כהן', attributionStatus: 'source_page', attributionNote: null,
    eventDate: null, eventDateText: null, sourcePublishedDate: null, durationSeconds: null, durationText: null,
    status: 'published', publishedAt: '2024-03-15T00:00:00.000Z', featured: false, verification: 'located',
    provenance: [], duplicateGroup: null, catalogOrder: 1, topicIds: [], seriesIds: [], sources: [],
    bookDetails: null, version: 1, createdAt: '2024-03-15T00:00:00.000Z', updatedAt: '2024-03-15T12:00:00.000Z', deletedAt: null,
  };
  const question: PublicQuestion = {
    id: 'q1', slug: 'שאלה-מפורסמת', questionText: 'האם מותר להזכיר את שם האם בתפילה?',
    answerBlocks: [{ type: 'paragraph', text: 'נוסח התשובה שאושר לפרסום.' }],
    answerAudioUrl: null, topicId: null, attribution: 'הרב ליאור כהן', approvedByRabbi: true,
    publishedAt: '2024-04-01T00:00:00.000Z', status: 'published', version: 1, deletedAt: null,
  };
  return {
    site: SITE, content: [answer], topics: [], series: [], pages: [], questions: [question],
    institutions: [], events: [], archives: [],
    redirects: [
      { fromPath: '/item/old-slug', toPath: '/item/תשובה-לדוגמה' },
      { fromPath: '/item/stolen', toPath: 'https://evil.example/phish' },
    ],
  };
}

function seoDeps(over: Partial<Deps['env']> = {}) {
  const { deps } = mockDeps();
  deps.env.siteUrl = SITE;
  deps.seoCatalog = async () => seoCatalog();
  Object.assign(deps.env, over);
  return deps;
}

test('sitemap, robots and IndexNow key', async () => {
  const missing = mockDeps().deps;
  assert.equal((await handle(new Request('http://x/sitemap.xml'), '8.8.8.8', missing)).status, 404);
  const res = await handle(new Request('http://x/sitemap.xml'), '8.8.8.8', seoDeps());
  assert.equal(res.status, 200);
  const xml = await res.text();
  assert.match(xml, /<sitemapindex/);
  assert.match(xml, /<lastmod>2024-04-01<\/lastmod>/);
  assert.match(xml, /sitemap-answers\.xml/);
  assert.match(xml, /sitemap-questions\.xml/);
  const answers = await handle(new Request('http://x/sitemap-answers.xml'), '8.8.8.8', seoDeps());
  const answersXml = await answers.text();
  assert.match(answersXml, /%D7%AA%D7%A9%D7%95%D7%91%D7%94/);
  assert.match(answersXml, /<lastmod>2024-03-15<\/lastmod>/);
  const robots = await handle(new Request('http://x/robots.txt'), '8.8.8.8', seoDeps());
  const robotsBody = await robots.text();
  assert.match(robotsBody, /Sitemap: https:\/\/elyashar\.online\/sitemap\.xml/);
  assert.match(robotsBody, /Disallow: \/admin/);
  assert.equal((await handle(new Request('http://x/indexnow-key.txt'), '8.8.8.8', seoDeps())).status, 404);
  const key = await handle(new Request('http://x/indexnow-key.txt'), '8.8.8.8', seoDeps({ indexNowKey: 'abcd1234' }));
  assert.equal(key.status, 200);
  assert.equal(await key.text(), 'abcd1234');
});

test('content HTML is complete, and redirects stay on this site', async () => {
  const page = await handle(new Request('http://x/item/%D7%AA%D7%A9%D7%95%D7%91%D7%94-%D7%9C%D7%93%D7%95%D7%92%D7%9E%D7%94'), '8.8.8.8', seoDeps());
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type') ?? '', /text\/html/);
  const html = await page.text();
  assert.match(html, /התשובה המלאה מופיעה כאן/);
  assert.match(html, /rel="canonical"/);
  assert.match(html, /hreflang="he"/);
  assert.match(html, /QAPage/);
  assert.doesNotMatch(html, /http-equiv="refresh"/i);
  const viaApi = await handle(new Request('http://x/api/seo/page?path=/responsa/שאלה-מפורסמת'), '8.8.8.8', seoDeps());
  assert.match(await viaApi.text(), /נוסח התשובה שאושר לפרסום/);
  const moved = await handle(new Request('http://x/item/old-slug'), '8.8.8.8', seoDeps());
  assert.equal(moved.status, 301);
  const location = moved.headers.get('location') ?? '';
  assert.equal(location, `${SITE}/item/${encodeURI('תשובה-לדוגמה')}`);
  assert.equal(new URL(location).host, 'elyashar.online');
  const stolen = await handle(new Request('http://x/item/stolen'), '8.8.8.8', seoDeps());
  assert.notEqual(stolen.status, 301);
  assert.equal(stolen.headers.get('location'), null);
  assert.doesNotMatch(await stolen.text(), /evil\.example/);
  const slash = await handle(new Request('http://x/item/old-slug/'), '8.8.8.8', seoDeps());
  assert.equal(slash.status, 301);
  assert.equal(new URL(slash.headers.get('location') ?? '').pathname, `/item/${encodeURI('תשובה-לדוגמה')}`);
});
