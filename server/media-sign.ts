// HMAC signed URLs for private objects. The browser receives a short path, never a database credential.
import { createHmac, timingSafeEqual } from 'node:crypto';

export function signMedia(secret: string, bucket: string, path: string, expSeconds: number): string {
  const sig = createHmac('sha256', secret).update(`${bucket}\n${path}\n${expSeconds}`).digest('base64url');
  const enc = path.split('/').map((s) => encodeURIComponent(s)).join('/');
  return `/api/media/${encodeURIComponent(bucket)}/${enc}?exp=${expSeconds}&sig=${sig}`;
}

export function verifyMedia(secret: string, bucket: string, path: string, exp: string, sig: string, now = Date.now()): boolean {
  const expn = Number(exp);
  if (!Number.isFinite(expn) || expn * 1000 < now - 5000) return false;
  const expected = createHmac('sha256', secret).update(`${bucket}\n${path}\n${exp}`).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
