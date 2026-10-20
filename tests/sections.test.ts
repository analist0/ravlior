import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  blocksToWriting, bookJsonLd, bookOffers, bookSample, bookToc, classifyEvent, eventIcs, eventJsonLd,
  externalHref, googleCalendarUrl, hebrewDateFromIso, hebrewNumeral, isListed, monthGrid, partitionEvents,
  revisionDiff, validateContact, writingToBlocks,
} from '../src/shared/sections.ts';
import type { Block, BookDetails, EventRecord } from '../src/shared/types.ts';

const book = (over: Partial<BookDetails> = {}): BookDetails => ({
  authorText: null, editorText: null, publisher: null, authoredByRabbi: false, coverPath: null, pdfAccess: 'none', locatedStatus: '',
  ...over,
});

test('links: https only, no credentials, empty stays hidden', () => {
  assert.equal(externalHref(null), null);
  assert.equal(externalHref('  '), null);
  assert.equal(externalHref('http://shop.example/book'), null);
  assert.equal(externalHref('javascript:alert(1)'), null);
  assert.equal(externalHref('https://user:pw@shop.example/a'), null);
  assert.equal(externalHref('https://shop.example/book'), 'https://shop.example/book');
  const offers = bookOffers(book({ purchaseUrl: 'https://example.org/buy', donationUrl: 'notaurl' }));
  assert.equal(offers.purchase, 'https://example.org/buy');
  assert.equal(offers.donation, null);
  assert.deepEqual(bookOffers(book()), { purchase: null, donation: null });
});

test('table of contents and sample appear only from stored fields', () => {
  assert.deepEqual(bookToc(null), []);
  assert.deepEqual(bookToc(book()), []);
  const loose = book();
  (loose as { toc: unknown }).toc = [{ title: '  פתיחה  ' }, { title: '' }, 'נספח'];
  assert.deepEqual(bookToc(loose), [
    { id: 'toc-1', title: 'פתיחה' },
    { id: 'toc-2', title: 'נספח' },
  ]);
  assert.deepEqual(bookSample(book()), []);
  const sample: Block[] = [{ type: 'paragraph', text: 'קטע' }];
  assert.equal(bookSample(book({ sample })).length, 1);
});

test('scheduled publish_at hides a published row until that moment', () => {
  const now = Date.parse('2026-10-20T12:00:00Z');
  assert.equal(isListed({ status: 'published', deletedAt: null }, now), true);
  assert.equal(isListed({ status: 'draft', deletedAt: null }, now), false);
  assert.equal(isListed({ status: 'published', deletedAt: null, publishAt: '2026-10-21T00:00:00Z' }, now), false);
  assert.equal(isListed({ status: 'published', deletedAt: null, publishAt: '2026-10-20T11:00:00Z' }, now), true);
});

test('events: upcoming, past and undated — dates are never guessed from dateText', () => {
  const base = { title: 'א', startsAt: null } as Pick<EventRecord, 'eventDate' | 'startsAt' | 'title'>;
  assert.equal(classifyEvent({ ...base, eventDate: null }, '2026-10-20'), 'undated');
  assert.equal(classifyEvent({ ...base, eventDate: '2026-10-20' }, '2026-10-20'), 'upcoming');
  assert.equal(classifyEvent({ ...base, eventDate: '2020-01-01' }, '2026-10-20'), 'past');
  const groups = partitionEvents([
    { ...base, title: 'בלי תאריך', eventDate: null },
    { ...base, title: 'עבר', eventDate: '2024-01-02' },
    { ...base, title: 'עתיד', eventDate: '2027-03-01' },
  ], '2026-10-20');
  assert.deepEqual(groups.upcoming.map((e) => e.title), ['עתיד']);
  assert.deepEqual(groups.past.map((e) => e.title), ['עבר']);
  assert.deepEqual(groups.undated.map((e) => e.title), ['בלי תאריך']);
});

test('Hebrew calendar: known civil dates and a Sunday-first month grid', () => {
  const rh = hebrewDateFromIso('2024-10-03');
  assert.ok(rh);
  assert.equal(rh.day, 1);
  assert.equal(rh.monthName, 'תשרי');
  assert.equal(rh.year, 5785);
  assert.equal(rh.yearLabel, 'תשפ״ה');
  const pesach = hebrewDateFromIso('2025-04-13');
  assert.ok(pesach);
  assert.equal(pesach.day, 15);
  assert.equal(pesach.monthName, 'ניסן');
  assert.equal(pesach.dayLabel, 'ט״ו');
  assert.equal(hebrewNumeral(16), 'ט״ז');
  const grid = monthGrid(2026, 10);
  assert.equal(grid.weekdayLabels[0], 'ראשון');
  assert.equal(grid.cells.filter((c) => c.inMonth).length, 31);
  assert.equal(grid.cells.length % 7, 0);
  assert.equal(grid.cells.find((c) => c.iso === '2026-10-01')?.gregorian, 1);
});

test('calendar export and Event structured data require a real date', () => {
  const undated = { id: '1', slug: 'a', title: 'מעמד', summary: null, eventDate: null, startsAt: null, endsAt: null, locationLabel: null, mapUrl: null };
  assert.equal(eventIcs(undated, 'https://elyashar.online/events#a'), null);
  assert.equal(googleCalendarUrl(undated), null);
  assert.equal(eventJsonLd(undated, null), null);
  const dated = { ...undated, eventDate: '2026-11-02', summary: 'שורה, עם פסיק', locationLabel: 'אלעד', mapUrl: 'https://maps.example/pin' };
  const ics = eventIcs(dated, 'https://elyashar.online/events#a');
  assert.match(ics!, /DTSTART;VALUE=DATE:20261102/);
  assert.match(ics!, /SUMMARY:מעמד/);
  assert.match(ics!, /שורה\\, עם פסיק/);
  assert.match(ics!, /LOCATION:אלעד/);
  assert.match(googleCalendarUrl(dated)!, /^https:\/\/calendar\.google\.com\/calendar\/render\?/);
  const ld = eventJsonLd(dated, 'https://elyashar.online/events#a');
  assert.equal(ld?.['@type'], 'Event');
  assert.equal(ld?.startDate, '2026-11-02');
  assert.equal((ld?.location as { name: string }).name, 'אלעד');
  const plain = bookJsonLd({ title: 'ימי מלך', summary: 'דיווח', bookDetails: book() }, null);
  assert.equal(plain['@type'], 'Book');
  assert.equal('offers' in plain, false);
});

test('contact form: honeypot, timing, and field limits', () => {
  const now = 1_000_000;
  const ok = { name: 'דוד', email: 'a@b.co', subject: 'שלום', body: 'פנייה כללית לבדיקה', website: '', startedAt: now - 5000 };
  assert.equal(validateContact(ok, now).ok, true);
  assert.equal(validateContact({ ...ok, website: 'http://spam' }, now).ok, false);
  assert.equal((validateContact({ ...ok, website: 'http://spam' }, now) as { bot?: boolean }).bot, true);
  assert.equal(validateContact({ ...ok, startedAt: now }, now).ok, false);
  assert.equal(validateContact({ ...ok, email: 'nope' }, now).ok, false);
  assert.equal(validateContact({ ...ok, body: 'קצר' }, now).ok, false);
  const value = validateContact({ ...ok, name: '  ' }, now);
  assert.equal(value.ok && value.value.name, null);
});

test('revision diff and Hebrew writing round-trip', () => {
  const rows = revisionDiff({ title: 'א', summary: 'ישן', version: 1 }, { title: 'ב', summary: 'ישן', version: 2 });
  assert.deepEqual(rows, [{ key: 'title', before: 'א', after: 'ב' }]);
  const blocks: Block[] = [
    { type: 'heading', level: 2, text: 'פתיחה' },
    { type: 'paragraph', text: 'שורה ראשונה' },
    { type: 'quote', text: 'ציטוט', source: 'מקור' },
  ];
  const draft = blocksToWriting(blocks);
  assert.match(draft.text, /## פתיחה/);
  assert.equal(draft.rest.length, 1);
  const back = writingToBlocks(draft.text, draft.rest);
  assert.equal(back[0]?.type, 'heading');
  assert.equal(back[1]?.type, 'paragraph');
  assert.equal(back[2]?.type, 'quote');
});
