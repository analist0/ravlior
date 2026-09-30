// Web-standard request handlers (Request → Response). Portable: the same code runs under
// server/node-server.ts (local / Termux) and api/[...route].ts (Vercel Functions).
import { newToken, newTrackingCode, safeEqualHex, sha256Hex, validateQuestion } from '../src/shared/questions.ts';
import { readEnv, type ServerEnv } from './lib/env.ts';
import { RateLimiter } from './lib/rate-limit.ts';
import { adminClient, UpstreamError, type AdminClient } from './lib/supabase-rest.ts';
import { guardedProbe, SsrfError, type ProbeResult } from './lib/ssrf.ts';

export interface Deps {
  env: ServerEnv;
  client: AdminClient | null;
  probe: (url: string, allow: string[]) => Promise<ProbeResult>;
  now: () => number;
}

const perMinute = new RateLimiter(60_000, 3);
const perDay = new RateLimiter(86_400_000, 20);
const trackLimiter = new RateLimiter(60_000, 20);

export function defaultDeps(): Deps {
  const env = readEnv();
  return { env, client: env.configured ? adminClient(env) : null, probe: (u, allow) => guardedProbe(u, { allowHosts: allow }), now: Date.now };
}

const SECURITY_HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...SECURITY_HEADERS } });
}
const err = (status: number, error: string) => json({ error }, status);

async function readJson(req: Request, maxBytes = 16 * 1024): Promise<unknown> {
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > maxBytes) throw new HttpError(413, 'הבקשה גדולה מדי');
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, 'הבקשה גדולה מדי');
  try { return JSON.parse(text); } catch { throw new HttpError(400, 'JSON לא תקין'); }
}
class HttpError extends Error {
  status: number;
  constructor(status: number, msg: string) { super(msg); this.status = status; }
}

async function fingerprint(req: Request, ip: string, salt: string): Promise<string> {
  // Salted hash — the raw IP is never stored or logged.
  return sha256Hex(`${salt}|${ip}|${req.headers.get('user-agent') ?? ''}`);
}

async function requireStaff(req: Request, d: Deps, allowed: string[]): Promise<{ id: string; roles: string[] }> {
  if (!d.client) throw new HttpError(503, 'השרת אינו מחובר ל-Supabase');
  const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!jwt) throw new HttpError(401, 'נדרשת כניסה');
  const user = await d.client.userFromJwt(jwt);
  if (!user) throw new HttpError(401, 'ההתחברות פגה. היכנסו מחדש.');
  const roles = (await d.client.rolesOf(user.id)).map((r) => r.role);
  if (!roles.some((r) => allowed.includes(r))) throw new HttpError(403, 'אין הרשאה');
  return { id: user.id, roles };
}

async function submitQuestion(req: Request, d: Deps, ip: string): Promise<Response> {
  const body = await readJson(req);
  const v = validateQuestion(body, d.now());
  if (!v.ok) {
    // Bots get a generic error; people get field errors.
    return v.bot ? err(400, 'לא ניתן לשלוח את הטופס כעת.') : json({ error: Object.values(v.errors)[0], fields: v.errors }, 422);
  }
  const fp = await fingerprint(req, ip, d.env.rateSalt);
  if (!perMinute.hit(fp, d.now()) || !perDay.hit(fp, d.now())) return err(429, 'נשלחו יותר מדי שאלות. נסו שוב מאוחר יותר.');
  if (!d.client) return err(503, 'קבלת שאלות אינה זמינה: השרת אינו מחובר למסד הנתונים.');
  if (!(await d.client.rateLimit(`q:${fp}`, 3600, 10))) return err(429, 'נשלחו יותר מדי שאלות. נסו שוב מאוחר יותר.');
  const token = newToken();
  const tokenHash = await sha256Hex(token);
  for (let attempt = 0; attempt < 3; attempt++) {
    const trackingCode = newTrackingCode();
    try {
      await d.client.insertQuestion({
        tracking_code: trackingCode, token_hash: tokenHash, is_anonymous: v.value.isAnonymous, asker_name: v.value.askerName,
        contact_email: v.value.contactEmail, topic_id: v.value.topicId, question_text: v.value.questionText,
        publish_consent: v.value.publishConsent, client_fingerprint: fp.slice(0, 32),
      });
      // The token is returned once, over TLS, and never logged or stored in plain text.
      return json({ trackingCode, token }, 201);
    } catch (e) {
      if (e instanceof UpstreamError && e.status === 409) continue; // tracking code collision → retry
      throw e;
    }
  }
  return err(500, 'לא ניתן היה ליצור מספר מעקב. נסו שוב.');
}

async function voiceAnswer(req: Request, d: Deps, ip: string): Promise<Response> {
  if (!d.client) return err(503, 'השרת אינו מחובר');
  if (!trackLimiter.hit(await fingerprint(req, ip, d.env.rateSalt), d.now())) return err(429, 'יותר מדי בקשות');
  const b = (await readJson(req)) as { code?: unknown; token?: unknown };
  if (typeof b.code !== 'string' || typeof b.token !== 'string' || b.token.length < 32) return err(400, 'פרטים חסרים');
  const [row] = await d.client.questionByCode(b.code.toUpperCase());
  const hash = await sha256Hex(b.token);
  if (!row || !safeEqualHex(row.token_hash, hash)) return err(404, 'לא נמצא');
  if (!row.answer_audio_path || !row.approved_by || !['private_delivered', 'published', 'closed'].includes(row.status)) return err(404, 'אין תשובה קולית זמינה');
  const signed = await d.client.signPrivate('private-submissions', row.answer_audio_path, 300);
  return json({ url: `${d.env.supabaseUrl}/storage/v1${signed.signedURL}`, expiresIn: 300 });
}

async function probe(req: Request, d: Deps): Promise<Response> {
  await requireStaff(req, d, ['owner', 'admin', 'editor']);
  const b = (await readJson(req)) as { url?: unknown };
  if (typeof b.url !== 'string') return err(400, 'חסר קישור');
  if (!d.env.importAllowlist.length) return err(400, 'לא הוגדרה רשימת מארחים מותרים (IMPORT_URL_ALLOWLIST).');
  try {
    const r = await d.probe(b.url, d.env.importAllowlist);
    const playable = /^(audio\/(mpeg|mp4|aac|ogg)|video\/(mp4|webm)|application\/pdf)/.test(r.contentType ?? '');
    return json({ ...r, playableNatively: playable, note: 'בדיקת מטא־דאטה בלבד. אין בכך אישור זכויות — יש לתעד ראיה לרשות השימוש.' });
  } catch (e) {
    if (e instanceof SsrfError) return err(400, e.message);
    return err(502, 'לא ניתן היה להגיע לכתובת');
  }
}

async function adminUsers(req: Request, d: Deps): Promise<Response> {
  await requireStaff(req, d, ['owner', 'admin']);
  if (req.method === 'POST') {
    const b = (await readJson(req)) as { email?: unknown };
    if (typeof b.email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email)) return err(400, 'דוא״ל לא תקין');
    await d.client!.invite(b.email);
    return json({ ok: true }, 201);
  }
  const [{ users }, roles] = await Promise.all([d.client!.listUsers(), d.client!.allRoles()]);
  return json({
    users: users.map((u) => ({ userId: u.id, email: u.email ?? '', displayName: null, roles: roles.filter((r) => r.user_id === u.id).map((r) => r.role) })),
  });
}

export async function handle(req: Request, ip = '0.0.0.0', deps: Deps = defaultDeps()): Promise<Response> {
  const { pathname } = new URL(req.url);
  try {
    if (pathname === '/api/health' && req.method === 'GET') return json({ ok: true, supabase: deps.env.configured ? 'configured' : 'not-configured' });
    if (pathname === '/api/questions' && req.method === 'POST') return await submitQuestion(req, deps, ip);
    if (pathname === '/api/questions/voice' && req.method === 'POST') return await voiceAnswer(req, deps, ip);
    if (pathname === '/api/import/probe' && req.method === 'POST') return await probe(req, deps);
    if (pathname === '/api/admin/users' && (req.method === 'GET' || req.method === 'POST')) return await adminUsers(req, deps);
    return err(404, 'לא נמצא');
  } catch (e) {
    if (e instanceof HttpError) return err(e.status, e.message);
    // Log without request bodies (they may contain private questions or tokens).
    console.error(`[api] ${req.method} ${pathname} failed:`, e instanceof Error ? e.name + ': ' + e.message.slice(0, 200) : 'unknown');
    return err(500, 'שגיאת שרת. נסו שוב.');
  }
}
