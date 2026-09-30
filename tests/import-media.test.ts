import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runEntry, type Deps, type EntryState, type ManifestEntry } from '../scripts/import-media.ts';

// Mocked network: a fake "server" that fails once mid-download, then resumes from the partial file.
const MP3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(2000, 7)]);
const fresh = (): EntryState => ({ status: 'pending', bytes: 0, total: null, sha256: null, mime: null, storagePath: null, attempts: 0, error: null });

function deps(over: Partial<Deps> = {}): Deps & { uploads: string[]; sleeps: number[] } {
  const uploads: string[] = [];
  const sleeps: number[] = [];
  let calls = 0;
  return {
    uploads, sleeps,
    probe: async () => ({ contentType: 'audio/mpeg', contentLength: MP3.length, finalUrl: 'x' }),
    download: async (_u, file, from) => {
      calls++;
      if (calls === 1) { writeFileSync(file, MP3.subarray(0, 700)); throw new Error('connection reset'); }
      assert.equal(from, 700, 'resumes from partial size');
      appendFileSync(file, MP3.subarray(from));
      return MP3.length;
    },
    upload: async (_f, path) => { uploads.push(path); },
    attach: async () => {},
    sleep: async (ms) => { sleeps.push(ms); },
    log: () => {},
    ...over,
  };
}
const entry: ManifestEntry = { id: 'lesson-1', url: 'https://kol-barama.co.il/a.mp3', approved: true, rightsEvidence: 'אישור בכתב מהלשכה' };

test('resumes after a network failure with backoff, verifies checksum and type, uploads once', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'imp-'));
  const d = deps();
  const s = fresh();
  await runEntry(entry, s, dir, d, () => {});
  assert.equal(s.status, 'done');
  assert.equal(s.bytes, MP3.length);
  assert.equal(s.mime, 'audio/mpeg');
  assert.match(s.sha256!, /^[0-9a-f]{64}$/);
  assert.deepEqual(d.sleeps, [2000]);
  assert.equal(d.uploads.length, 1);
  assert.match(d.uploads[0]!, /^\d{4}\/[0-9a-f-]{36}\/lesson-1\.mp3$/);
});

test('refuses unapproved sources, oversize files and non-media content', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'imp-'));
  const s1 = fresh();
  await runEntry({ ...entry, approved: false }, s1, dir, deps(), () => {});
  assert.equal(s1.status, 'rejected');
  const s2 = fresh();
  await runEntry({ ...entry, maxBytes: 100 }, s2, dir, deps(), () => {});
  assert.equal(s2.status, 'rejected');
  const s3 = fresh();
  await runEntry({ ...entry, id: 'html' }, s3, dir, deps({ download: async (_u, f) => { writeFileSync(f, '<html><script>x</script>'); return 24; }, probe: async () => ({ contentType: 'text/html', contentLength: 24, finalUrl: 'x' }) }), () => {});
  assert.equal(s3.status, 'rejected');
});

test('gives up after 4 retries and marks failed (no infinite loop)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'imp-'));
  const d = deps({ download: async () => { throw new Error('offline'); } });
  const s = fresh();
  await runEntry({ ...entry, id: 'offline' }, s, dir, d, () => {});
  assert.equal(s.status, 'failed');
  assert.deepEqual(d.sleeps, [2000, 4000, 8000, 16000]);
});
