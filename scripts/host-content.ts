// Bring third-party content onto our own storage (preview DB only).
// Non-destructive: only fills empty bodies and adds storage to media_sources rows; never deletes or overwrites text.
// Usage: DATABASE_URL=... IMPORT_URL_ALLOWLIST=host1,host2 node scripts/host-content.ts [--dry] [--extra-hosts=a,b]
// Refuses to run against a URL that contains the production branch endpoint unless PROD_OK=1 (never set it).
import { neon } from '@neondatabase/serverless';
import { createHash, randomUUID } from 'node:crypto';

const url = process.env.DATABASE_URL ?? '';
if (!url) throw new Error('DATABASE_URL missing');
if (process.env.FORBID_ENDPOINT && url.includes(process.env.FORBID_ENDPOINT)) throw new Error('refusing: production endpoint');
const sql = neon(url);
const dry = process.argv.includes('--dry');
const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1];
const extra = (process.argv.find((a) => a.startsWith('--extra-hosts='))?.split('=')[1] ?? '').split(',').filter(Boolean);
const allow = [...(process.env.IMPORT_URL_ALLOWLIST ?? '').split(','), ...extra].map((h) => h.trim().toLowerCase()).filter(Boolean);
const allowed = (u: string) => { try { const h = new URL(u).hostname.toLowerCase(); return new URL(u).protocol === 'https:' && allow.some((a) => h === a || h.endsWith('.' + a)); } catch { return false; } };
const UA = 'Mozilla/5.0 (compatible; OrHameirImporter/1.0)';

type Block = { type: 'paragraph'; text: string } | { type: 'heading'; level: 2 | 3; text: string } | { type: 'image'; src: string; alt: string; credit?: string };

const decode = (s: string) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&apos;|&#039;/g, "'").replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const strip = (s: string) => decode(s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
const clean = (t: string) => t.replace(/[<>]/g, '').slice(0, 4000);

async function get(u: string, max = 200 * 1024 * 1024): Promise<{ status: number; type: string; buf: Buffer }> {
  if (!allowed(u)) throw new Error(`host not allowlisted: ${new URL(u).hostname}`);
  const res = await fetch(u, { headers: { 'user-agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(120_000) });
  if (!allowed(res.url)) throw new Error(`redirected off allowlist: ${new URL(res.url).hostname}`);
  const len = Number(res.headers.get('content-length') ?? 0);
  if (len > max) throw new Error(`too large: ${len}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > max) throw new Error('too large');
  return { status: res.status, type: res.headers.get('content-type') ?? '', buf };
}

function sniff(b: Buffer): { mime: string; ext: string } | null {
  if (b.subarray(0, 4).toString() === '%PDF') return { mime: 'application/pdf', ext: 'pdf' };
  if (b.subarray(0, 3).toString() === 'ID3' || (b[0] === 0xff && (b[1]! & 0xe0) === 0xe0)) return { mime: 'audio/mpeg', ext: 'mp3' };
  if (b.subarray(4, 8).toString() === 'ftyp') return { mime: b.subarray(8, 12).toString().startsWith('M4A') ? 'audio/mp4' : 'video/mp4', ext: b.subarray(8, 12).toString().startsWith('M4A') ? 'm4a' : 'mp4' };
  if (b[0] === 0xff && b[1] === 0xd8) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b.subarray(1, 4).toString() === 'PNG') return { mime: 'image/png', ext: 'png' };
  if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

async function store(bucket: 'public-media' | 'public-books', buf: Buffer, base: string): Promise<{ path: string; mime: string; size: number; sha: string }> {
  const s = sniff(buf);
  if (!s) throw new Error('unknown file type');
  const sha = createHash('sha256').update(buf).digest('hex');
  const existing = await sql.query(`select o.name from public.storage_objects o where o.bucket_id = $1 and o.name like '%/' || $2 || '.' || $3 limit 1`, [bucket, sha.slice(0, 24), s.ext]);
  if (existing[0]) return { path: String(existing[0].name), mime: s.mime, size: buf.byteLength, sha };
  const path = `${new Date().getFullYear()}/${randomUUID()}/${base}-${sha.slice(0, 24)}.${s.ext}`.replace(/[^a-z0-9./_-]/g, '');
  if (dry) return { path, mime: s.mime, size: buf.byteLength, sha };
  const CH = 3 * 1024 * 1024;
  await sql.transaction([
    sql`select set_config('app.actor','service',true)`,
    sql.query(`insert into public.storage_objects (bucket_id, name, mime, bytes, size) values ($1, $2, $3, decode($4,'hex'), $5)`, [bucket, path, s.mime, buf.subarray(0, CH).toString('hex'), buf.byteLength]),
  ]);
  for (let off = CH; off < buf.byteLength; off += CH) {
    await sql.query(`update public.storage_objects set bytes = bytes || decode($3,'hex') where bucket_id = $1 and name = $2`, [bucket, path, buf.subarray(off, off + CH).toString('hex')]);
  }
  const chk = await sql.query(`select length(bytes) n from public.storage_objects where bucket_id = $1 and name = $2`, [bucket, path]);
  if (Number(chk[0]?.n) !== buf.byteLength) throw new Error('stored size mismatch');
  return { path, mime: s.mime, size: buf.byteLength, sha };
}
const media = (bucket: string, path: string) => `/api/media/${bucket}/${path}`;

async function imageBlock(src: string, alt: string): Promise<Block | null> {
  try {
    if (!allowed(src)) return null;
    const r = await get(src, 15 * 1024 * 1024);
    if (r.status !== 200) return null;
    const s = await store('public-media', r.buf, 'img');
    return { type: 'image', src: media('public-media', s.path), alt: clean(alt).slice(0, 200) || 'תמונה' };
  } catch { return null; }
}

/** Convert an HTML fragment into whitelisted blocks; images are copied to our storage. */
async function htmlToBlocks(html: string, baseUrl: string): Promise<Block[]> {
  const out: Block[] = [];
  const body = html.replace(/<(script|style|noscript|iframe|form|nav|footer|header)[\s\S]*?<\/\1>/gi, '');
  const re = /<(h[23]|p|li|blockquote)\b[^>]*>([\s\S]*?)<\/\1>|<img\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    if (m[0].toLowerCase().startsWith('<img')) {
      const src = m[0].match(/\b(?:data-src|src)="([^"]+)"/i)?.[1];
      const alt = m[0].match(/\balt="([^"]*)"/i)?.[1] ?? '';
      if (src && !src.startsWith('data:')) { const b = await imageBlock(new URL(decode(src), baseUrl).toString(), decode(alt)); if (b) out.push(b); }
      continue;
    }
    const text = clean(strip(m[2]!));
    if (text.length < 2) continue;
    if (m[1]!.toLowerCase().startsWith('h')) out.push({ type: 'heading', level: m[1]!.toLowerCase() === 'h2' ? 2 : 3, text: text.slice(0, 300) });
    else out.push({ type: 'paragraph', text });
  }
  // de-dup consecutive repeats (Wix duplicates nodes)
  return out.filter((b, i) => !(i > 0 && JSON.stringify(b) === JSON.stringify(out[i - 1]))).slice(0, 400);
}

function meta(html: string, prop: string): string | null {
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name)="${prop}"[^>]+content="([^"]*)"`, 'i')) ?? html.match(new RegExp(`<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="${prop}"`, 'i'));
  return m ? decode(m[1]!) : null;
}

type Row = { content_id: string; slug: string; type: string; body_len: number; src_id: string; provider: string; url: string; kind: string; storage_path: string | null; has_yt: boolean };
const report: Record<string, { item: string; result: string }[]> = {};
const note = (type: string, item: string, result: string) => { (report[type] ??= []).push({ item, result }); console.log(`[${type}] ${item}: ${result}`); };

async function setBody(id: string, blocks: Block[]) {
  if (!blocks.length || dry) return;
  await sql.transaction([
    sql`select set_config('app.actor','service',true)`,
    sql.query(`update public.content_items set body = $2::jsonb where id = $1 and jsonb_array_length(coalesce(body,'[]'::jsonb)) = 0`, [id, JSON.stringify(blocks)]),
  ]);
}
async function setStored(srcId: string, bucket: string, s: { path: string; mime: string; size: number; sha: string }) {
  if (dry) return;
  await sql.transaction([
    sql`select set_config('app.actor','service',true)`,
    sql.query(`update public.media_sources set storage_bucket = $2, storage_path = $3, delivery_mode = 'storage', mime = $4, filesize = $5, checksum = $6, last_checked_at = now(), error = null, updated_at = now() where id = $1`,
      [srcId, bucket, s.path, s.mime, s.size, s.sha]),
  ]);
}
async function markError(srcId: string, msg: string) {
  if (dry) return;
  await sql.query(`update public.media_sources set error = $2, last_checked_at = now() where id = $1 and storage_path is null`, [srcId, msg.slice(0, 300)]);
}

async function handle(r: Row) {
  const label = r.slug;
  if (r.storage_path && (r.body_len > 0 || r.has_yt)) return note(r.type, label, 'already hosted');
  if (!allowed(r.url)) return note(r.type, label, `skipped: ${new URL(r.url).hostname} not in IMPORT_URL_ALLOWLIST`);
  let page: Awaited<ReturnType<typeof get>>;
  try { page = await get(r.url); } catch (e) { await markError(r.src_id, String(e)); return note(r.type, label, `fetch failed: ${(e as Error).message}`); }
  if (page.status !== 200) { await markError(r.src_id, `HTTP ${page.status}`); return note(r.type, label, `HTTP ${page.status}${page.status === 403 ? ' (bot challenge; needs manual upload)' : ''}`); }
  const direct = sniff(page.buf);
  if (direct) {
    const bucket = direct.mime === 'application/pdf' ? 'public-books' : 'public-media';
    const s = await store(bucket, page.buf, r.slug.slice(0, 30).replace(/[^a-z0-9-]/gi, '') || 'file');
    await setStored(r.src_id, bucket, s);
    return note(r.type, label, `stored ${direct.mime} ${(s.size / 1048576).toFixed(1)}MB`);
  }
  const html = page.buf.toString('utf8');
  const results: string[] = [];
  // WordPress: prefer the REST content.
  let fragment: string | null = null;
  const wpId = html.match(/\bpostid-(\d+)/) ?? html.match(/[?&]p=(\d+)/);
  const id = wpId?.[1] ?? r.url.match(/\/(\d{3,})\/?$/)?.[1];
  const postType = html.match(/\bsingle-([a-z0-9_-]+)\b/)?.[1];
  const alt = html.match(/<link[^>]+rel="alternate"[^>]+type="application\/json"[^>]+href="([^"]+\/wp-json\/wp\/v2\/[^"]+)"/i)?.[1];
  if (alt) {
    try { const res = await get(decode(alt)); if (res.status === 200) fragment = String(JSON.parse(res.buf.toString('utf8'))?.content?.rendered ?? ''); } catch { /* fall back */ }
  }
  if (fragment === null && id && /wp-content|wp-json/.test(html)) {
    for (const kind of [...new Set([postType === 'post' || !postType ? 'posts' : postType, 'posts'])]) {
      try {
        const res = await get(new URL(`/wp-json/wp/v2/${kind}/${id}?_fields=content`, r.url).toString());
        if (res.status !== 200) continue;
        const j = JSON.parse(res.buf.toString('utf8'));
        if (j?.content?.rendered) { fragment = j.content.rendered; break; }
      } catch { /* try next */ }
    }
  }
  if (fragment === null) fragment = html.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? html.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? html;
  // Audio/video/PDF files referenced by the page.
  const fileRe = /(?:src|href)="(https:\/\/[^"]+\.(?:mp3|m4a|mp4|pdf))(?:\?[^"]*)?"/gi;
  const files = [...new Set([...html.matchAll(fileRe)].map((x) => decode(x[1]!)))];
  let hosted = false;
  for (const f of files.slice(0, 3)) {
    try {
      const fr = await get(f);
      const s0 = sniff(fr.buf);
      if (fr.status !== 200 || !s0) { results.push(`file ${new URL(f).hostname} HTTP ${fr.status}`); continue; }
      const bucket = s0.mime === 'application/pdf' ? 'public-books' : 'public-media';
      const s = await store(bucket, fr.buf, r.slug.slice(0, 30).replace(/[^a-z0-9-]/gi, '') || 'file');
      if (!hosted) { await setStored(r.src_id, bucket, s); hosted = true; }
      results.push(`stored ${s0.mime} ${(s.size / 1048576).toFixed(1)}MB`);
    } catch (e) { results.push(`file failed: ${(e as Error).message}`); }
  }
  // Video items already play in-page from YouTube; do not paste a channel/listing page into them.
  if (r.body_len === 0 && !r.has_yt) {
    let blocks = await htmlToBlocks(fragment, r.url);
    if (blocks.filter((b) => b.type === 'paragraph').length === 0) {
      const d = meta(html, 'og:description') ?? meta(html, 'description');
      const img = meta(html, 'og:image');
      blocks = [];
      if (img) { const b = await imageBlock(img, meta(html, 'og:title') ?? ''); if (b) blocks.push(b); }
      if (d) blocks.push({ type: 'paragraph', text: clean(d) });
    }
    await setBody(r.content_id, blocks);
    results.push(`body ${blocks.length} blocks (${blocks.filter((b) => b.type === 'image').length} images)`);
  }
  if (/mediadelivery\.net|vimeo\.com|player\./i.test(fragment) && !hosted) results.push('page video is on a third-party player (not hosted)');
  note(r.type, label, results.join('; ') || 'nothing found');
}

const rows = (await sql.query(`
  select c.id content_id, c.slug, c.type::text type, jsonb_array_length(coalesce(c.body,'[]'::jsonb)) body_len,
         m.id src_id, m.provider::text provider, m.url, m.kind, m.storage_path,
         exists (select 1 from public.media_sources y where y.content_id = c.id and y.provider::text = 'youtube') has_yt
  from public.content_items c join public.media_sources m on m.content_id = c.id
  where c.deleted_at is null and m.provider::text <> 'youtube' and ($1::text is null or m.provider::text = $1)
  order by c.type, c.slug`, [only ?? null])) as Row[];
console.log(`allowlist: ${allow.join(', ')}${dry ? ' (dry run)' : ''}; ${rows.length} non-YouTube sources`);
for (const r of rows) {
  try { await handle(r); } catch (e) { note(r.type, r.slug, `error: ${(e as Error).message}`); }
}
console.log('\nSUMMARY');
for (const [t, list] of Object.entries(report)) console.log(t, list.length, JSON.stringify(list.reduce<Record<string, number>>((a, x) => { const k = x.result.split(':')[0]!.split(' ')[0]!; a[k] = (a[k] ?? 0) + 1; return a; }, {})));
