import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkUpload, sanitizeFilename, signedUrlValid, storagePath, storagePathOk } from '../src/shared/upload-policy.ts';

const bytes = (...xs: (number | string)[]) => new Uint8Array(xs.flatMap((x) => (typeof x === 'string' ? [...x].map((c) => c.charCodeAt(0)) : [x])));

test('content sniffing: real MP3 accepted, renamed HTML rejected, SVG rejected', () => {
  assert.ok(checkUpload('public-media', { name: 'lesson.mp3', size: 1000, type: 'audio/mpeg' }, bytes('ID3', 3, 0)).ok);
  const html = checkUpload('public-media', { name: 'lesson.mp3', size: 1000, type: 'audio/mpeg' }, bytes('<html><script>'));
  assert.equal(html.ok, false);
  const svg = checkUpload('public-media', { name: 'x.svg', size: 10, type: 'image/svg+xml' }, bytes('<svg xmlns='));
  assert.equal(svg.ok, false);
  const pdfAsJpg = checkUpload('public-books', { name: 'a.jpg', size: 10, type: 'image/jpeg' }, bytes('%PDF-1.7'));
  assert.equal(pdfAsJpg.ok, false, 'extension must match content');
});

test('bucket policy: size and MIME limits', () => {
  assert.equal(checkUpload('private-submissions', { name: 'a.pdf', size: 10, type: 'application/pdf' }, bytes('%PDF-')).ok, false);
  assert.equal(checkUpload('public-books', { name: 'a.pdf', size: 200 * 1024 * 1024, type: 'application/pdf' }, bytes('%PDF-')).ok, false);
  assert.equal(checkUpload('public-books', { name: 'a.pdf', size: 0, type: 'application/pdf' }, bytes('%PDF-')).ok, false);
});

test('filename sanitization and storage paths match the SQL rule', () => {
  assert.equal(sanitizeFilename('../../etc/passwd'), 'passwd');
  assert.equal(sanitizeFilename('שיעור פרשת נח.MP3'), 'file.mp3');
  assert.equal(sanitizeFilename('My Lesson (1).m4a'), 'my-lesson-1.m4a');
  const p = storagePath('Lesson 1.mp3', '0f8fad5b-d9cb-469f-a165-70867728950e', new Date('2026-09-30'));
  assert.equal(p, '2026/0f8fad5b-d9cb-469f-a165-70867728950e/lesson-1.mp3');
  assert.ok(storagePathOk(p));
  assert.ok(!storagePathOk('2026/../x.mp3'));
  assert.ok(!storagePathOk('2026/0f8fad5b-d9cb-469f-a165-70867728950e/x.html'));
});

test('expired signed URLs are not used', () => {
  const now = 1_000_000;
  assert.ok(signedUrlValid(now + 60_000, now));
  assert.ok(!signedUrlValid(now + 1_000, now), 'within skew counts as expired');
  assert.ok(!signedUrlValid(now - 1, now));
});
