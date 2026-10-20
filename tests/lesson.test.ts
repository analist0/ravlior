import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyQuery } from '../src/shared/query.ts';
import { chaptersToText, isoDuration, lessonJsonLd, parseChapterLines, parseTimestamp, videoObject, videoSitemapXml } from '../src/shared/lesson.ts';
import { embedUrl } from '../src/shared/media.ts';
import type { ContentItem, SeedData } from '../src/shared/types.ts';

const seed: SeedData = JSON.parse(readFileSync(new URL('../src/data/seed.json', import.meta.url), 'utf8'));

test('hall, length and date filters stay inside published rows', () => {
  const watch = applyQuery(seed.content, { hall: 'watch', pageSize: 100 }, seed.topics, seed.series);
  assert.ok(watch.total > 0);
  assert.ok(watch.items.every((c) => c.type === 'video' || c.type === 'short' || c.type === 'live'));
  const listen = applyQuery(seed.content, { hall: 'listen', pageSize: 100 }, seed.topics, seed.series);
  assert.ok(listen.total >= 1);
  assert.ok(listen.items.every((c) => c.type === 'audio'));
  const long = applyQuery(seed.content, { length: 'long', pageSize: 100 }, seed.topics, seed.series);
  assert.ok(long.items.every((c) => (c.durationSeconds ?? 0) >= 2400));
  const dated = applyQuery(seed.content, { dated: 'known', pageSize: 100 }, seed.topics, seed.series);
  assert.ok(dated.items.every((c) => !!(c.eventDate || c.sourcePublishedDate)));
  const undated = applyQuery(seed.content, { dated: 'unknown', hall: 'watch', pageSize: 5 }, seed.topics, seed.series);
  assert.ok(undated.items.every((c) => !c.eventDate && !c.sourcePublishedDate));
});

test('chapters parse only explicit timestamps and round-trip', () => {
  const ok = parseChapterLines('0:30 | פתיחה\n1:02:03 | סיום');
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.deepEqual(ok.chapters, [{ t: 30, label: 'פתיחה' }, { t: 3723, label: 'סיום' }]);
    assert.match(chaptersToText(ok.chapters), /0:30 \| פתיחה/);
  }
  assert.equal(parseChapterLines('בערך באמצע | משהו').ok, false);
  const empty = parseChapterLines('');
  assert.equal(empty.ok, true);
  if (empty.ok) assert.equal(empty.chapters.length, 0);
});

test('timestamps and durations', () => {
  assert.equal(parseTimestamp('90'), 90);
  assert.equal(parseTimestamp('1:30'), 90);
  assert.equal(parseTimestamp('1m30s'), 90);
  assert.equal(parseTimestamp('לא'), null);
  assert.equal(isoDuration(90), 'PT1M30S');
  assert.equal(isoDuration(3600), 'PT1H');
  assert.equal(isoDuration(null), null);
});

test('embed stays on youtube-nocookie and can start at a timestamp', () => {
  const url = embedUrl('youtube', 'M6BfU-i-_xk', { start: 90, jsapi: true, origin: 'https://elyashar.online' })!;
  assert.match(url, /^https:\/\/www\.youtube-nocookie\.com\/embed\/M6BfU-i-_xk/);
  assert.match(url, /start=90/);
  assert.match(url, /enablejsapi=1/);
  assert.doesNotMatch(url, /youtube\.com\/embed/);
});

test('structured data is omitted without a real date and included with one', () => {
  const video = seed.content.find((c) => c.type === 'video' && !c.eventDate && !c.sourcePublishedDate)!;
  assert.equal(videoObject(video, 'כותרת'), null);
  const dated = seed.content.find((c) => c.type === 'audio' && (c.eventDate || c.sourcePublishedDate))!;
  const ld = lessonJsonLd(dated, 'כותרת', 'https://elyashar.online/item/x', null);
  assert.equal(ld?.['@type'], 'PodcastEpisode');
  assert.equal(ld?.datePublished, dated.eventDate || dated.sourcePublishedDate);
  const withDate: ContentItem = { ...video, sourcePublishedDate: '2025-04-28', summary: null };
  const obj = videoObject(withDate, 'כותרת אמיתית');
  assert.equal(obj?.uploadDate, '2025-04-28');
  assert.equal(obj?.description, 'כותרת אמיתית');
  const xml = videoSitemapXml([withDate, dated], 'https://elyashar.online');
  assert.match(xml, /xmlns:video/);
  assert.match(xml, /video:title/);
  assert.doesNotMatch(xml, /<script/);
  const evil: ContentItem = { ...withDate, title: 'a <b> & "c' };
  assert.match(videoSitemapXml([evil], 'https://elyashar.online'), /a &lt;b&gt; &amp; &quot;c/);
});
