// Web-standard request handlers (Request → Response). Portable: the same code runs under
// server/node-server.ts (local / Termux) and api/[...route].ts (Vercel Functions).
import { newToken, newTrackingCode, safeEqualHex, sha256Hex, validateQuestion } from '../src/shared/questions.ts';
import { validateUpdate } from '../src/shared/updates.ts';
import { acceptInvite, clearCookie, login, logout, sessionCookie, tokenFrom, wantsSecure } from './auth.ts';
import { ApiError } from './db.ts';
import { readEnv, type ServerEnv } from './lib/env.ts';
import { dbClient } from './lib/db-client.ts';
import { UpstreamError, type DataClient } from './lib/data-client.ts';
import { RateLimiter } from './lib/rate-limit.ts';
import { readObject, uploadChunk } from './media-http.ts';
import { guardedProbe, SsrfError, type ProbeResult } from './lib/ssrf.ts';
import { dispatch } from './store.ts';

export interface Deps {
  env: ServerEnv;
  client: DataClient | null;
  probe: (url: string, allow: string[]) => Promise<ProbeResult>;
  now: () => number;
}

const perMinute = new RateLimiter(60_000, 3);
const perDay = new RateLimiter(86_400_000, 20);
const trackLimiter = new RateLimiter(60_000, 20);
const loginLimiter = new RateLimiter(60_000, 10);
const updateLimiter = new RateLimiter(3_600_000, 5);

export function defaultDeps(): Deps {
  const env = readEnv();
  return { env, client: env.configured ? dbClient(env) : null, probe: (u, allow) => guardedProbe(u, { allowHosts: allow }), now: Date.now };
}

const SECURITY_HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };
function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...SECURITY_HEADERS, ...extra } });
}
const err = (status: number, error: string, code?: string) => json({ error, code }, status);

async function readJson(req: Request, maxBytes = 16 * 1024): Promise<unknown> {
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > maxBytes) throw new ApiError(413, 'הבקשה גדולה מדי');
  const text = await req.text();
  if (text.length > maxBytes) throw new ApiError(413, 'הבקשה גדולה מדי');
  try { return JSON.parse(text); } catch { throw new ApiError(400, 'JSON לא תקין'); }
}

async function fingerprint(req: Request, ip: string, salt: string): Promise<string> {
  return sha256Hex(`${salt}|${ip}|${req.headers.get('user-agent') ?? ''}`);
}

async function requireStaff(req: Request, d: Deps, allowed: string[]): Promise<{ id: string; roles: string[] }> {
  if (!d.client) throw new ApiError(503, 'השרת אינו מחובר למסד הנתונים');
  const token = tokenFrom(req);
  if (!token) throw new ApiError(401, 'נדרשת כניסה');
  const user = await d.client.userFromToken(token);
  if (!user) throw new ApiError(401, 'ההתחברות פגה. היכנסו מחדש.');
  const roles = (await d.client.rolesOf(user.id)).map((r) => r.role);
  if (!roles.some((r) => allowed.includes(r))) throw new ApiError(403, 'אין הרשאה');
  return { id: user.id, roles };
}

async function submitQuestion(req: Request, d: Deps, ip: string): Promise<Response> {
  const body = await readJson(req);
  const v = validateQuestion(body, d.now());
  if (!v.ok) return v.bot ? err(400, 'לא ניתן לשלוח את הטופס כעת.') : json({ error: Object.values(v.errors)[0], fields: v.errors }, 422);
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
      return json({ trackingCode, token }, 201);
    } catch (e) {
      if (e instanceof UpstreamError && e.status === 409) continue;
      throw e;
    }
  }
  return err(500, 'לא ניתן היה ליצור מספר מעקב. נסו שוב.');
}

async function subscribeUpdates(req: Request, d: Deps, ip: string): Promise<Response> {
  const body = await readJson(req);
  const v = validateUpdate(body, d.now());
  if (!v.ok) return v.bot ? err(400, 'לא ניתן לשלוח את הטופס כעת.') : json({ error: Object.values(v.errors)[0], fields: v.errors }, 422);
  const fp = await fingerprint(req, ip, d.env.rateSalt);
  if (!updateLimiter.hit(fp, d.now())) return err(429, 'נשלחו יותר מדי בקשות. נסו שוב מאוחר יותר.');
  if (!d.client) return err(503, 'שמירת עדכונים אינה זמינה: השרת אינו מחובר למסד הנתונים.');
  if (!(await d.client.rateLimit(`u:${fp.slice(0, 24)}`, 3600, 8))) return err(429, 'נשלחו יותר מדי בקשות. נסו שוב מאוחר יותר.');
  await d.client.insertSignup(v.value);
  return json({ ok: true }, 201);
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
  return json({ url: signed.url, expiresIn: 300 });
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
  const actor = await requireStaff(req, d, ['owner', 'admin']);
  if (req.method === 'POST') {
    const b = (await readJson(req)) as { email?: unknown };
    if (typeof b.email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email)) return err(400, 'דוא״ל לא תקין');
    const invited = await d.client!.invite(b.email, actor.id);
    return json({ ok: true, token: invited.token, expiresAt: invited.expiresAt }, 201);
  }
  const [users, roles] = await Promise.all([d.client!.listUsers(), d.client!.allRoles()]);
  return json({
    users: users.map((u) => ({ userId: u.id, email: u.email ?? '', displayName: u.display_name, roles: roles.filter((r) => r.user_id === u.id).map((r) => r.role) })),
  });
}

async function authRoutes(req: Request, d: Deps, ip: string): Promise<Response> {
  if (!d.client || !d.env.configured) return err(503, 'השרת אינו מחובר למסד הנתונים');
  const { pathname } = new URL(req.url);
  const secure = wantsSecure(req, d.env.siteUrl);
  if (pathname === '/api/auth/me' && req.method === 'GET') {
    const token = tokenFrom(req);
    if (!token) return json({ session: null });
    const user = await d.client.userFromToken(token);
    if (!user) return json({ session: null });
    const roles = (await d.client.rolesOf(user.id)).map((r) => r.role);
    return json({ session: { userId: user.id, email: user.email ?? '', roles, demo: false } });
  }
  if (pathname === '/api/auth/login' && req.method === 'POST') {
    if (!loginLimiter.hit(await fingerprint(req, ip, d.env.rateSalt), d.now())) return err(429, 'יותר מדי ניסיונות כניסה. נסו שוב מאוחר יותר.');
    const b = (await readJson(req)) as { email?: unknown; password?: unknown };
    if (typeof b.email !== 'string' || typeof b.password !== 'string') return err(400, 'חסרים פרטי כניסה');
    const { token, session } = await login(b.email, b.password);
    return json({ session }, 200, { 'set-cookie': sessionCookie(token, secure) });
  }
  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    const token = tokenFrom(req);
    if (token) await logout(token);
    return json({ ok: true }, 200, { 'set-cookie': clearCookie(secure) });
  }
  if (pathname === '/api/auth/accept' && req.method === 'POST') {
    const b = (await readJson(req)) as { token?: unknown; password?: unknown; displayName?: unknown };
    if (typeof b.token !== 'string' || typeof b.password !== 'string') return err(400, 'חסרים פרטי ההזמנה');
    const { token, session } = await acceptInvite(b.token, b.password, typeof b.displayName === 'string' ? b.displayName : '');
    return json({ session }, 201, { 'set-cookie': sessionCookie(token, secure) });
  }
  return err(404, 'לא נמצא');
}

async function rpc(req: Request, d: Deps): Promise<Response> {
  if (!d.client || !d.env.configured) return err(503, 'השרת אינו מחובר למסד הנתונים');
  const body = (await readJson(req, 1024 * 1024)) as { op?: unknown; args?: unknown };
  if (typeof body.op !== 'string' || !body.op) return err(400, 'חסרה פעולה');
  const token = tokenFrom(req);
  const user = token ? await d.client.userFromToken(token) : null;
  const data = await dispatch(body.op, body.args && typeof body.args === 'object' ? body.args as Record<string, unknown> : {}, user?.id ?? null, d.env.authSecret);
  return json({ data });
}

async function media(req: Request, d: Deps): Promise<Response> {
  if (!d.env.configured) return err(503, 'השרת אינו מחובר למסד הנתונים');
  const url = new URL(req.url);
  const parts = url.pathname.split('/').filter(Boolean);
  // api / media / bucket / ...path
  if (parts.length < 3) return err(404, 'לא נמצא');
  const bucket = decodeURIComponent(parts[2] ?? '');
  const path = parts.slice(3).map((s) => decodeURIComponent(s)).join('/');
  if (req.method === 'GET') return readObject(bucket, path, url.searchParams.get('exp'), url.searchParams.get('sig'), d.env.authSecret);
  if (req.method === 'POST' && url.pathname === '/api/media/upload') {
    if (!d.client) return err(503, 'השרת אינו מחובר למסד הנתונים');
    const token = tokenFrom(req);
    const user = token ? await d.client.userFromToken(token) : null;
    if (!user) return err(401, 'נדרשת כניסה');
    const len = Number(req.headers.get('content-length') ?? 0);
    if (len > 2_500_000) return err(413, 'מקטע ההעלאה גדול מדי');
    const buf = new Uint8Array(await req.arrayBuffer());
    if (buf.byteLength > 2_500_000) return err(413, 'מקטע ההעלאה גדול מדי');
    const result = await uploadChunk(user.id, req.headers, buf);
    return json(result);
  }
  return err(404, 'לא נמצא');
}

export async function handle(req: Request, ip = '0.0.0.0', deps: Deps = defaultDeps()): Promise<Response> {
  const { pathname } = new URL(req.url);
  try {
    if (pathname === '/api/health' && req.method === 'GET') return json({ ok: true, database: deps.env.configured ? 'configured' : 'not-configured' });
    if (pathname === '/api/questions' && req.method === 'POST') return await submitQuestion(req, deps, ip);
    if (pathname === '/api/updates' && req.method === 'POST') return await subscribeUpdates(req, deps, ip);
    if (pathname === '/api/questions/voice' && req.method === 'POST') return await voiceAnswer(req, deps, ip);
    if (pathname === '/api/import/probe' && req.method === 'POST') return await probe(req, deps);
    if (pathname === '/api/admin/users' && (req.method === 'GET' || req.method === 'POST')) return await adminUsers(req, deps);
    if (pathname.startsWith('/api/auth/')) return await authRoutes(req, deps, ip);
    if (pathname === '/api/rpc' && req.method === 'POST') return await rpc(req, deps);
    if (pathname.startsWith('/api/media')) return await media(req, deps);
    return err(404, 'לא נמצא');
  } catch (e) {
    if (e instanceof ApiError) return err(e.status, e.message, e.code);
    console.error(`[api] ${req.method} ${pathname} failed:`, e instanceof Error ? e.name + ': ' + e.message.slice(0, 200) : 'unknown');
    return err(500, 'שגיאת שרת. נסו שוב.');
  }
}
