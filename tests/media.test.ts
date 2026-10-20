import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalizeUrl, detectProvider, embedUrl, formatDuration, parseDuration, youtubeId } from '../src/shared/media.ts';
import { parseLengthSeconds, parseOEmbedPayload, youtubeMetaFromParts } from '../src/shared/youtube-meta.ts';
import { whyRelated } from '../src/shared/hall.ts';

test('youtubeId handles watch/shorts/youtu.be/embed and rejects junk', () => {
  assert.equal(youtubeId('https://www.youtube.com/watch?v=M6BfU-i-_xk'), 'M6BfU-i-_xk');
  assert.equal(youtubeId('https://youtube.com/shorts/PiU0D8lx61w'), 'PiU0D8lx61w');
  assert.equal(youtubeId('https://youtu.be/4ypuILhb1eo?t=3'), '4ypuILhb1eo');
  assert.equal(youtubeId('https://www.youtube-nocookie.com/embed/W1L0rxlNYy4'), 'W1L0rxlNYy4');
  assert.equal(youtubeId('https://evil.example/watch?v=M6BfU-i-_xk'), null);
  assert.equal(youtubeId('https://www.youtube.com/watch?v=<script>'), null);
});

test('canonicalization merges shorts/watch forms and strips tracking', () => {
  assert.equal(canonicalizeUrl('https://youtube.com/shorts/PiU0D8lx61w'), canonicalizeUrl('https://www.youtube.com/watch?v=PiU0D8lx61w&feature=share'));
  assert.equal(canonicalizeUrl('https://www.ktr.org.il/post/_1110?utm_source=x#top'), 'https://ktr.org.il/post/_1110');
  assert.equal(canonicalizeUrl('https://kol-barama.co.il/show/%D7%90%D7%95%D7%A8/'), canonicalizeUrl('https://kol-barama.co.il/show/אור/'));
});

test('iframe allowlist: only YouTube (nocookie) embeds', () => {
  assert.match(embedUrl('youtube', 'M6BfU-i-_xk')!, /^https:\/\/www\.youtube-nocookie\.com\/embed\/M6BfU-i-_xk/);
  assert.equal(embedUrl('ykr', '3105'), null);
  assert.equal(embedUrl('web', 'x'), null);
  assert.equal(embedUrl('youtube', 'bad id"><'), null);
});

test('youtube metadata parser keeps only a real title, author and length', () => {
  assert.equal(parseOEmbedPayload('M6BfU-i-_xk', { title: '  שיעור לדוגמה  ', author_name: 'מוסדות אור המאיר' })?.title, 'שיעור לדוגמה');
  assert.equal(parseOEmbedPayload('short', { title: 'x' }), null);
  assert.equal(parseOEmbedPayload('M6BfU-i-_xk', { title: '<b>x</b>' }), null);
  assert.equal(parseLengthSeconds('{"lengthSeconds":"1466"}'), 1466);
  assert.equal(parseLengthSeconds('{"lengthSeconds":"0"}'), null);
  assert.equal(parseLengthSeconds('no duration here'), null);
  const meta = youtubeMetaFromParts('M6BfU-i-_xk', { title: 'כותרת מהמקור', author_name: 'ערוץ' }, '{"lengthSeconds":"90"}');
  assert.equal(meta?.thumbnailUrl, 'https://i.ytimg.com/vi/M6BfU-i-_xk/hqdefault.jpg');
  assert.equal(meta?.durationText, '1:30');
  assert.equal(meta?.author, 'ערוץ');
});

test('recommendations are labelled only from a real series, topic or duplicate', () => {
  const seed = { seriesIds: ['s1'], topicIds: ['t1'], duplicateGroup: null };
  assert.equal(whyRelated(seed, { seriesIds: ['s1'], topicIds: [], duplicateGroup: null }), 'אותה סדרה');
  assert.equal(whyRelated(seed, { seriesIds: [], topicIds: ['t1'], duplicateGroup: null }), 'נושא משותף');
  assert.equal(whyRelated(seed, { seriesIds: [], topicIds: [], duplicateGroup: null }), '');
});

test('provider detection and durations', () => {
  assert.equal(detectProvider('https://www.ykr.org.il/wp-content/uploads/2021/12/11091.pdf'), 'pdf');
  assert.equal(detectProvider('https://hm-news.co.il/642996/'), 'hm-news');
  assert.equal(parseDuration('1:10:35'), 4235);
  assert.equal(parseDuration('0:30'), 30);
  assert.equal(parseDuration('לא חולץ'), null);
  assert.equal(formatDuration(4235), '1:10:35');
});
