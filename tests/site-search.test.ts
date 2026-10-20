import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchScore, mergeNav, searchDocs, wordSimilarity, type SiteDoc } from '../src/shared/site-search.ts';

const docs: SiteDoc[] = [
  { kind: 'content', id: '1', title: 'הלכות קריאת מגילה', extra: 'פורים', href: '/item/a', label: 'article' },
  { kind: 'topic', id: '2', title: 'סוכה', extra: 'חג', href: '/topics/sukka', label: 'topic' },
  { kind: 'content', id: '3', title: 'שיעור על אמונה', extra: '', href: '/item/b', label: 'video' },
];

test('trigram word similarity tolerates one Hebrew letter', () => {
  assert.ok(wordSimilarity('מגילא', 'הלכות קריאת מגילה') >= 0.35);
  assert.ok(wordSimilarity('שופר', 'הלכות קריאת מגילה') < 0.35);
});

test('exact tokens outrank a fuzzy typo, and a typo still hits', () => {
  const exact = searchDocs(docs, 'מגילה', 5);
  assert.equal(exact[0]?.href, '/item/a');
  assert.equal(exact[0]?.fuzzy, false);
  const typo = searchDocs(docs, 'מגילא', 5);
  assert.equal(typo[0]?.href, '/item/a');
  assert.equal(typo[0]?.fuzzy, true);
  assert.equal(searchDocs(docs, 'שופר', 5).length, 0);
});

test('niqqud still matches before fuzzy scoring', () => {
  assert.ok(matchScore('הלכות קריאת מגילה', '', 'מְגִילָּה') >= 5);
});

test('navigation hits are merged without dropping content', () => {
  const hits = mergeNav(searchDocs(docs, 'ספרייה', 5), 'ספרייה');
  assert.ok(hits.some((h) => h.href === '/library'));
});
