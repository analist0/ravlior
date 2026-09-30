import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyQuery } from '../src/shared/query.ts';
import { seed } from './helpers.ts';
import type { ContentItem } from '../src/shared/types.ts';

test('public queries return published, non-deleted items only (draft isolation)', () => {
  const draft: ContentItem = { ...seed.content[0]!, id: 'x-draft', slug: 'x', status: 'draft', title: 'טיוטה סודית' };
  const deleted: ContentItem = { ...seed.content[0]!, id: 'x-del', slug: 'y', deletedAt: '2026-09-30', title: 'טיוטה סודית' };
  const r = applyQuery([...seed.content, draft, deleted], { q: 'טיוטה סודית', pageSize: 100 }, seed.topics, seed.series);
  assert.equal(r.total, 0);
  const all = applyQuery(seed.content, { pageSize: 100 }, seed.topics, seed.series);
  assert.equal(all.total, seed.content.filter((c) => c.status === 'published').length);
});

test('filters: type, topic, series, provider, pagination', () => {
  const shorts = applyQuery(seed.content, { type: 'short', pageSize: 100 }, seed.topics, seed.series);
  assert.equal(shorts.total, seed.content.filter((c) => c.type === 'short' && c.status === 'published').length);
  const tb = applyQuery(seed.content, { topic: 'bein-hametzarim', pageSize: 5, page: 2 }, seed.topics, seed.series);
  assert.equal(tb.items.length, 5);
  assert.ok(tb.total > 10);
  const s = applyQuery(seed.content, { series: 'perek-yomi' }, seed.topics, seed.series);
  assert.equal(s.total, 2);
  const unknownTopic = applyQuery(seed.content, { topic: 'no-such' }, seed.topics, seed.series);
  assert.equal(unknownTopic.total, 0);
  const pdf = applyQuery(seed.content, { provider: 'pdf' }, seed.topics, seed.series);
  assert.equal(pdf.total, 5);
});

test('Hebrew search ranks title matches first', () => {
  const r = applyQuery(seed.content, { q: 'ארבעת המינים' }, seed.topics, seed.series);
  assert.ok(r.total >= 2);
  assert.ok(r.items[0]!.title.includes('ארבעת המינים'));
});
