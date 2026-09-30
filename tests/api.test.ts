import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle, type Deps } from '../server/handlers.ts';
import { sha256Hex } from '../src/shared/questions.ts';
import { SsrfError } from '../server/lib/ssrf.ts';

// Marked mock: an in-memory stand-in for the Supabase REST client. Integration against a real
// project is covered by supabase/verify/rls_checks.sql, not by this file.
function mockDeps(over: Partial<Deps> = {}) {
  const rows: Record<string, unknown>[] = [];
  const roles: Record<string, string[]> = { 'jwt-editor': ['editor'], 'jwt-viewer': ['viewer'] };
  const deps: Deps = {
    env: { supabaseUrl: 'https://proj.supabase.co', secretKey: 'test', rateSalt: 'salt', importAllowlist: ['kol-barama.co.il'], configured: true },
    now: Date.now,
    probe: async (u) => { if (u.includes('127.0.0.1')) throw new SsrfError('blocked'); return { finalUrl: u, status: 200, contentType: 'audio/mpeg', contentLength: 1234, redirects: 0, bytesRead: 0 }; },
    client: {
      insertQuestion: async (r: Record<string, unknown>) => { rows.push(r); return null; },
      rateLimit: async () => true,
      questionByCode: async (code: string) => rows.filter((r) => r.tracking_code === code).map((r) => ({ token_hash: r.token_hash as string, answer_audio_path: 'a/b.mp3', status: 'private_delivered', approved_by: 'rabbi' })),
      signPrivate: async () => ({ signedURL: '/object/sign/private-submissions/a/b.mp3?token=t' }),
      userFromJwt: async (jwt: string) => (roles[jwt] ? { id: jwt } : null),
      rolesOf: async (id: string) => (roles[id] ?? []).map((role) => ({ role })),
      listUsers: async () => ({ users: [] }),
      allRoles: async () => [],
      invite: async () => null,
    } as unknown as NonNullable<Deps['client']>,
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

test('submit without Supabase configured is refused (no fake success)', async () => {
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
  assert.match(b.url, /^https:\/\/proj\.supabase\.co\/storage\/v1\/object\/sign\//);
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

test('admin users endpoint requires admin/owner', async () => {
  const { deps } = mockDeps();
  const res = await handle(new Request('http://x/api/admin/users', { headers: { authorization: 'Bearer jwt-editor' } }), '7.7.7.7', deps);
  assert.equal(res.status, 403);
  assert.equal((await handle(new Request('http://x/api/nope'), '7.7.7.7', deps)).status, 404);
});
