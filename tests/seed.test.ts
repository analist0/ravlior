import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { seed } from './helpers.ts';

const dossier = readFileSync(new URL('../data/research-appendix.md', import.meta.url), 'utf8');

test('seed audit matches the dossier counts', () => {
  const a = seed.audit;
  assert.equal(a.distinctUrls, 254);
  assert.equal(a.distinctVideoIds, 182);
  assert.deepEqual(a.activeChannel, { video: 80, short: 87, live: 2, total: 169 });
  assert.equal(a.legacyChannel, 5);
  assert.equal(a.additionalVideoIds, 8);
  assert.equal(a.readPages, 41);
  assert.deepEqual(a.unassignedUrls, [], 'every URL in the dossier is represented in the seed');
});

test('one canonical record per YouTube id; 182 distinct ids across items', () => {
  const ids = seed.content.flatMap((c) => c.sources.filter((s) => s.provider === 'youtube' && s.kind === 'media').map((s) => s.providerId));
  assert.equal(ids.length, 182);
  assert.equal(new Set(ids).size, 182);
});

test('titles preserved verbatim from the channel listing', () => {
  const t = seed.content.find((c) => c.sources.some((s) => s.providerId === 'M6BfU-i-_xk'))!;
  assert.ok(dossier.includes(`| 1 | ${t.title} | 24:26 |`), 'title is byte-identical to the dossier row');
  const channel = seed.content.filter((c) => c.provenance.some((p) => p.section === 'יא'));
  assert.ok(channel.every((c) => dossier.includes(`| ${c.title} |`)), 'all 169 channel titles verbatim');
  assert.equal(t.durationText, '24:26');
  assert.equal(t.durationSeconds, 1466);
});

test('no invented dates: channel items have no event date', () => {
  const channel = seed.content.filter((c) => c.provenance.some((p) => p.section === 'יא'));
  assert.equal(channel.length, 169);
  assert.ok(channel.every((c) => c.eventDate === null && c.sourcePublishedDate === null));
});

test('attribution rules: note-only answer, two different "ימי מלך" books', () => {
  const note = seed.content.find((c) => c.sources.some((s) => s.url.includes('question/8748')))!;
  assert.equal(note.attributionStatus, 'note_only');
  assert.equal(note.speaker, null);
  const yemei = seed.content.filter((c) => c.type === 'book' && c.title.startsWith('ימי מלך'));
  assert.equal(yemei.length, 2);
  assert.notEqual(yemei[0]!.id, yemei[1]!.id);
  assert.deepEqual(yemei.map((b) => b.bookDetails!.authoredByRabbi).sort(), [false, true]);
  assert.ok(yemei.every((b) => b.bookDetails!.pdfAccess === 'none'), 'no PDF presented as existing');
});

test('seed is public metadata only (no private questions) and candidates are not published', () => {
  assert.equal((seed as unknown as { questions?: unknown }).questions, undefined);
  const candidates = seed.content.filter((c) => c.verification === 'candidate');
  assert.ok(candidates.length >= 1);
  assert.ok(candidates.every((c) => c.status !== 'published'));
});

test('duplicates (long + Short with same title) are grouped, not merged', () => {
  const g = seed.content.filter((c) => c.duplicateGroup && c.title.startsWith('איך קושרים ארבעת המינים'));
  assert.equal(g.length, 2);
  assert.equal(new Set(g.map((x) => x.duplicateGroup)).size, 1);
  assert.deepEqual(g.map((x) => x.type).sort(), ['short', 'video']);
});

test('system series are labelled as built on this site', () => {
  assert.ok(seed.series.every((s) => s.kind === 'system' && s.sourceUrl === null));
  const or = seed.series.find((s) => s.slug === 'or-haneeman')!;
  assert.ok(or.items.length >= 22);
});
