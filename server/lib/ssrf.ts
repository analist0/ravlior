// SSRF-guarded outbound fetch for server-side URL probing/import.
// - https only, port 443, no credentials in URL, optional host allowlist
// - every DNS answer checked against private/loopback/link-local/metadata ranges
// - the socket connects to the *validated* address (custom lookup) → no DNS-rebinding gap
// - redirects followed manually (max 3), each hop re-validated
// - timeout + byte limit
import { lookup as dnsLookup } from 'node:dns/promises';
import { request } from 'node:https';
import { isIP } from 'node:net';
import type { LookupFunction } from 'node:net';

export class SsrfError extends Error {
  constructor(msg: string) { super(msg); this.name = 'SsrfError'; }
}

function v4ToInt(ip: string): number {
  return ip.split('.').reduce((n, o) => (n << 8) + Number(o), 0) >>> 0;
}
const V4_BLOCK: [string, number][] = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
];
export function isBlockedIp(ip: string): boolean {
  const fam = isIP(ip);
  if (fam === 4) {
    const n = v4ToInt(ip);
    return V4_BLOCK.some(([base, bits]) => (n >>> (32 - bits)) === (v4ToInt(base) >>> (32 - bits)));
  }
  if (fam === 6) {
    const s = ip.toLowerCase();
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedIp(mapped[1]!);
    if (s === '::' || s === '::1') return true;
    if (/^f[cd]/.test(s)) return true; // fc00::/7 unique local
    if (/^fe[89ab]/.test(s)) return true; // fe80::/10 link local
    if (/^ff/.test(s)) return true; // multicast
    if (s.startsWith('64:ff9b:')) return true; // NAT64 can reach v4 internals
    if (s.startsWith('2001:db8')) return true; // documentation
    return false;
  }
  return true; // not an IP → block
}

export interface GuardOptions { allowHosts?: string[]; timeoutMs?: number; maxBytes?: number; maxRedirects?: number; method?: 'HEAD' | 'GET' }

export function checkUrl(raw: string, allowHosts: string[] = []): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new SsrfError('כתובת לא תקינה'); }
  if (u.protocol !== 'https:') throw new SsrfError('רק https מותר');
  if (u.username || u.password) throw new SsrfError('אסור לכלול פרטי התחברות בכתובת');
  if (u.port && u.port !== '443') throw new SsrfError('רק פורט 443 מותר');
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) throw new SsrfError('מארח פנימי חסום');
  if (isIP(host.replace(/^\[|\]$/g, '')) && isBlockedIp(host.replace(/^\[|\]$/g, ''))) throw new SsrfError('כתובת IP פנימית חסומה');
  if (allowHosts.length && !allowHosts.some((h) => host === h || host.endsWith('.' + h))) throw new SsrfError(`המארח ${host} אינו ברשימת המותרים`);
  return u;
}

/** DNS lookup that refuses private answers; used as the socket's lookup so the connection uses a checked IP. */
export const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { all: true, verbatim: true }).then(
    (addrs) => {
      const bad = addrs.find((a) => isBlockedIp(a.address));
      if (!addrs.length || bad) return callback(new SsrfError(`הכתובת ${hostname} מפנה לרשת פנימית`) as NodeJS.ErrnoException, '', 4);
      if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: { address: string; family: number }[]) => void)(null, addrs);
      const a = addrs[0]!;
      callback(null, a.address, a.family);
    },
    (e: NodeJS.ErrnoException) => callback(e, '', 4),
  );
};

export interface ProbeResult { finalUrl: string; status: number; contentType: string | null; contentLength: number | null; redirects: number; bytesRead: number }

function once(url: URL, opts: Required<Pick<GuardOptions, 'timeoutMs' | 'maxBytes' | 'method'>>): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; bytes: number }> {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: opts.method, lookup: guardedLookup, timeout: opts.timeoutMs, headers: { 'user-agent': 'or-hameir-probe/1.0', accept: '*/*' } }, (res) => {
      let bytes = 0;
      res.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > opts.maxBytes) { req.destroy(new SsrfError('חריגה ממגבלת הגודל')); }
      });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, bytes }));
      res.on('error', reject);
      if (opts.method === 'HEAD') res.resume();
    });
    req.on('timeout', () => req.destroy(new SsrfError('תם הזמן')));
    req.on('error', reject);
    req.end();
  });
}

export async function guardedProbe(raw: string, o: GuardOptions = {}): Promise<ProbeResult> {
  const opts = { timeoutMs: o.timeoutMs ?? 8000, maxBytes: o.maxBytes ?? 64 * 1024, method: o.method ?? 'HEAD' } as const;
  let url = checkUrl(raw, o.allowHosts);
  for (let hop = 0; hop <= (o.maxRedirects ?? 3); hop++) {
    const res = await once(url, opts);
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      url = checkUrl(new URL(String(res.headers.location), url).toString(), o.allowHosts);
      continue;
    }
    const len = res.headers['content-length'];
    return {
      finalUrl: url.toString(), status: res.status, contentType: (res.headers['content-type'] as string | undefined) ?? null,
      contentLength: len ? Number(len) : null, redirects: hop, bytesRead: res.bytes,
    };
  }
  throw new SsrfError('יותר מדי הפניות');
}
