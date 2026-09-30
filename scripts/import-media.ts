// Supervised, resumable media import — meant to run on the phone (Termux) or any Node ≥ 22.18.
// For AUTHORISED direct files only (e.g. MP3s the rabbi's office sent or links they own).
// Never YouTube extraction, never DRM/login/hotlink bypass, never crawling.
//
//   node --env-file-if-exists=.env.local scripts/import-media.ts import-jobs/manifest.json
//
// manifest.json: [{ "id": "or-haneeman-2026-07-12", "url": "https://…/file.mp3", "approved": true,
//                   "rightsEvidence": "מייל מהלשכה 01.10.2026", "contentId": "<uuid optional>", "maxBytes": 300000000 }]
// State is kept in import-jobs/state.json so a killed process (Android may stop Termux) resumes
// where it stopped: partial downloads continue with HTTP Range when the server supports it,
// uploads continue via TUS. Run it again to resume. It does not run 24/7 by itself.
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync, openSync, readSync, closeSync, createWriteStream } from 'node:fs';
import { request } from 'node:https';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkUrl, guardedLookup, guardedProbe } from '../server/lib/ssrf.ts';
import { checkUpload, storagePath } from '../src/shared/upload-policy.ts';

export interface ManifestEntry { id: string; url: string; approved: boolean; rightsEvidence: string; contentId?: string; maxBytes?: number }
export interface EntryState {
  status: 'pending' | 'downloading' | 'downloaded' | 'uploading' | 'done' | 'failed' | 'rejected';
  bytes: number; total: number | null; sha256: string | null; mime: string | null; storagePath: string | null; attempts: number; error: string | null;
}
export interface Deps {
  probe: (url: string) => Promise<{ contentType: string | null; contentLength: number | null; finalUrl: string }>;
  /** Append bytes starting at `from`; returns total bytes on disk. Must throw on network error. */
  download: (url: string, file: string, from: number, maxBytes: number) => Promise<number>;
  upload: (file: string, path: string, mime: string, size: number) => Promise<void>;
  attach: (e: ManifestEntry, s: EntryState) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  log: (msg: string) => void;
}

const DEFAULT_MAX = 500 * 1024 * 1024;
const BACKOFF = [2000, 4000, 8000, 16000];

export function fileSha256(file: string): Promise<string> {
  return new Promise((res, rej) => {
    const h = createHash('sha256');
    createReadStream(file).on('data', (c) => h.update(c)).on('end', () => res(h.digest('hex'))).on('error', rej);
  });
}
function head(file: string): Uint8Array {
  const fd = openSync(file, 'r');
  const b = Buffer.alloc(16);
  readSync(fd, b, 0, 16, 0);
  closeSync(fd);
  return new Uint8Array(b);
}

export async function runEntry(e: ManifestEntry, s: EntryState, dir: string, deps: Deps, save: () => void): Promise<void> {
  if (!e.approved || !e.rightsEvidence?.trim()) { s.status = 'rejected'; s.error = 'לא אושר / חסרה ראיה לזכויות'; save(); return; }
  const maxBytes = e.maxBytes ?? DEFAULT_MAX;
  const file = resolve(dir, 'files', `${e.id.replace(/[^a-z0-9._-]/gi, '_')}.part`);
  mkdirSync(dirname(file), { recursive: true });
  const ext = (new URL(e.url).pathname.split('.').pop() ?? '').toLowerCase();

  while (s.status !== 'done' && s.status !== 'failed') {
    try {
      if (s.status === 'pending' || s.status === 'downloading') {
        if (s.total === null) {
          const p = await deps.probe(e.url);
          if (p.contentLength !== null && p.contentLength > maxBytes) { s.status = 'rejected'; s.error = `גדול מהמותר (${p.contentLength})`; save(); return; }
          s.total = p.contentLength; s.mime = p.contentType;
        }
        s.status = 'downloading'; save();
        const from = existsSync(file) ? statSync(file).size : 0;
        if (from) deps.log(`${e.id}: resuming at ${from} bytes`);
        s.bytes = await deps.download(e.url, file, from, maxBytes);
        if (s.total !== null && s.bytes !== s.total) throw new Error(`הורדה חלקית ${s.bytes}/${s.total}`);
        s.sha256 = await fileSha256(file);
        const check = checkUpload('public-media', { name: `f.${ext}`, size: s.bytes, type: '' }, head(file));
        if (!check.ok) { s.status = 'rejected'; s.error = check.error ?? 'סוג קובץ לא מותר'; save(); return; }
        s.mime = check.mime!; s.status = 'downloaded'; save();
      }
      if (s.status === 'downloaded' || s.status === 'uploading') {
        s.storagePath ??= storagePath(`${e.id}.${ext}`, crypto.randomUUID());
        s.status = 'uploading'; save();
        await deps.upload(file, s.storagePath, s.mime!, s.bytes);
        await deps.attach(e, s);
        s.status = 'done'; s.error = null; save();
        deps.log(`${e.id}: done → public-media/${s.storagePath} sha256=${s.sha256}`);
      }
    } catch (err) {
      s.attempts++; s.error = (err as Error).message; save();
      if (s.attempts > BACKOFF.length) { s.status = 'failed'; save(); deps.log(`${e.id}: failed after ${s.attempts} attempts: ${s.error}`); return; }
      const wait = BACKOFF[s.attempts - 1]!;
      deps.log(`${e.id}: ${s.error} — retry in ${wait / 1000}s`);
      await deps.sleep(wait);
    }
  }
}

// ——— real I/O (network) ———
function realDownload(allow: string[]) {
  return (url: string, file: string, from: number, maxBytes: number) => new Promise<number>((res, rej) => {
    const u = checkUrl(url, allow);
    const req = request(u, { lookup: guardedLookup, timeout: 30_000, headers: from ? { range: `bytes=${from}-` } : {} }, (r) => {
      if (r.statusCode && r.statusCode >= 300 && r.statusCode < 400) { rej(new Error('הפניה — הריצו שוב עם הכתובת הסופית מבדיקת probe')); r.resume(); return; }
      const resumed = r.statusCode === 206;
      if (!resumed && r.statusCode !== 200) { rej(new Error(`HTTP ${r.statusCode}`)); r.resume(); return; }
      let size = resumed ? from : 0;
      const out = createWriteStream(file, { flags: resumed ? 'a' : 'w' });
      r.on('data', (c: Buffer) => { size += c.length; if (size > maxBytes) req.destroy(new Error('חריגה ממגבלת גודל')); });
      r.pipe(out);
      out.on('finish', () => res(size));
      r.on('error', rej);
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', rej);
    req.end();
  });
}
async function realUpload(file: string, path: string, mime: string, size: number) {
  const url = process.env.SUPABASE_URL!.replace(/\/$/, '');
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const tus = await import('tus-js-client');
  await new Promise<void>((res, rej) => {
    const up = new tus.Upload(createReadStream(file), {
      endpoint: `${url}/storage/v1/upload/resumable`, uploadSize: size, chunkSize: 6 * 1024 * 1024, retryDelays: [0, 3000, 10000, 30000],
      headers: { authorization: `Bearer ${key}`, apikey: key, 'x-upsert': 'false' },
      metadata: { bucketName: 'public-media', objectName: path, contentType: mime, cacheControl: '3600' },
      onError: rej, onSuccess: () => res(),
      onProgress: (a, b) => process.stdout.write(`\r  upload ${Math.round((a / b) * 100)}%`),
    });
    void up.findPreviousUploads().then((prev) => { if (prev[0]) up.resumeFromPreviousUpload(prev[0]); up.start(); });
  });
  process.stdout.write('\n');
}
async function realAttach(e: ManifestEntry, s: EntryState) {
  if (!e.contentId) return;
  const url = process.env.SUPABASE_URL!.replace(/\/$/, '');
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const publicUrl = `${url}/storage/v1/object/public/public-media/${s.storagePath}`;
  const r = await fetch(`${url}/rest/v1/media_sources`, {
    method: 'POST', headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json', prefer: 'return=minimal' },
    body: JSON.stringify({ content_id: e.contentId, provider: 'storage', url: publicUrl, canonical_url: publicUrl, delivery_mode: 'storage', kind: 'media',
      mime: s.mime, filesize: s.bytes, checksum: `sha256:${s.sha256}`, rights_status: 'licensed', rights_evidence: e.rightsEvidence,
      storage_bucket: 'public-media', storage_path: s.storagePath, is_primary: false }),
  });
  if (!r.ok) throw new Error(`attach failed: ${r.status} ${(await r.text()).slice(0, 200)}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifestPath = resolve(process.argv[2] ?? 'import-jobs/manifest.json');
  const dir = dirname(manifestPath);
  const statePath = resolve(dir, 'state.json');
  const allow = (process.env.IMPORT_URL_ALLOWLIST ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!allow.length) { console.error('IMPORT_URL_ALLOWLIST is empty — list the hosts you are authorised to download from.'); process.exit(2); }
  if (!process.env.SUPABASE_URL || !(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)) { console.error('SUPABASE_URL / SUPABASE_SECRET_KEY missing (.env.local).'); process.exit(2); }
  const manifest: ManifestEntry[] = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const state: Record<string, EntryState> = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};
  const save = () => writeFileSync(statePath, JSON.stringify(state, null, 1));
  const deps: Deps = {
    probe: (u) => guardedProbe(u, { allowHosts: allow }), download: realDownload(allow), upload: realUpload, attach: realAttach,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)), log: (m) => console.log(m),
  };
  for (const e of manifest) {
    state[e.id] ??= { status: 'pending', bytes: 0, total: null, sha256: null, mime: null, storagePath: null, attempts: 0, error: null };
    if (state[e.id]!.status === 'failed') state[e.id]!.attempts = 0, state[e.id]!.status = state[e.id]!.sha256 ? 'downloaded' : 'pending';
    await runEntry(e, state[e.id]!, dir, deps, save);
  }
  const summary = Object.values(state).reduce<Record<string, number>>((a, s) => ({ ...a, [s.status]: (a[s.status] ?? 0) + 1 }), {});
  console.log('summary', summary);
}
