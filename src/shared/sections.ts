// Public books, events and contact — shared by the site, the CMS, the API and tests.
// Nothing here invents rabbi biography, dates, prices or addresses.

import type { Block, BookDetails, EventRecord } from './types.ts';

const HTTPS = /^https:\/\/[^\s]+$/;

/** A public https link, or null when the field is empty or not a safe URL. */
export function externalHref(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const url = raw.trim();
  if (!HTTPS.test(url)) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export interface TocItem { id: string; title: string }

export function bookToc(details: BookDetails | null | undefined): TocItem[] {
  const raw = details?.toc;
  if (!Array.isArray(raw)) return [];
  const out: TocItem[] = [];
  for (const row of raw) {
    const title = typeof row === 'string' ? row : (row && typeof row === 'object' && 'title' in row ? String((row as { title: unknown }).title) : '');
    const clean = title.replace(/\s+/g, ' ').trim();
    if (!clean || clean.length > 200) continue;
    out.push({ id: `toc-${out.length + 1}`, title: clean });
  }
  return out;
}

export interface TocAnchor extends TocItem { blockIndex: number | null }

/** Match saved chapter titles to heading blocks, in order. A title with no heading is listed, not linked. */
export function tocAnchors(blocks: readonly { type: string; text?: string }[], toc: readonly TocItem[]): TocAnchor[] {
  const used = new Set<number>();
  return toc.map((item) => {
    const blockIndex = blocks.findIndex((b, i) => {
      if (used.has(i) || b.type !== 'heading') return false;
      return (b.text ?? '').replace(/\s+/g, ' ').trim() === item.title;
    });
    if (blockIndex >= 0) used.add(blockIndex);
    return { id: item.id, title: item.title, blockIndex: blockIndex >= 0 ? blockIndex : null };
  });
}

export function linkHost(url: string): string {
  try { return decodeURI(new URL(url).hostname.replace(/^www\./, '')); } catch { return url; }
}

export function bookSample(details: BookDetails | null | undefined): Block[] {
  const raw = details?.sample;
  if (!Array.isArray(raw)) return [];
  return raw.filter((b): b is Block => !!b && typeof b === 'object' && typeof (b as Block).type === 'string');
}

export function bookOffers(details: BookDetails | null | undefined): { purchase: string | null; donation: string | null } {
  return {
    purchase: externalHref(details?.purchaseUrl),
    donation: externalHref(details?.donationUrl),
  };
}

/** Published, not deleted, and not waiting for a future publish_at. */
export function isListed(row: { status: string; deletedAt?: string | null; publishAt?: string | null }, now = Date.now()): boolean {
  if (row.status !== 'published' || row.deletedAt != null) return false;
  if (!row.publishAt) return true;
  const t = Date.parse(row.publishAt);
  return !Number.isNaN(t) && t <= now;
}

export type EventBucket = 'upcoming' | 'past' | 'undated';

/** ISO date (YYYY-MM-DD) when the source recorded one. Never guessed from dateText. */
export function eventIsoDate(event: Pick<EventRecord, 'eventDate' | 'startsAt'>): string | null {
  const raw = event.eventDate || (event.startsAt ? event.startsAt.slice(0, 10) : null);
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

export function classifyEvent(event: Pick<EventRecord, 'eventDate' | 'startsAt'>, todayIso: string): EventBucket {
  const iso = eventIsoDate(event);
  if (!iso) return 'undated';
  return iso >= todayIso ? 'upcoming' : 'past';
}

export function partitionEvents<T extends Pick<EventRecord, 'eventDate' | 'startsAt' | 'title'>>(events: T[], todayIso: string): Record<EventBucket, T[]> {
  const groups: Record<EventBucket, T[]> = { upcoming: [], past: [], undated: [] };
  const sorted = [...events].sort((a, b) => (eventIsoDate(a) ?? '9999').localeCompare(eventIsoDate(b) ?? '9999') || a.title.localeCompare(b.title, 'he'));
  for (const event of sorted) groups[classifyEvent(event, todayIso)].push(event);
  groups.past.reverse();
  return groups;
}

const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const HEB_MONTHS: Record<number, string> = {
  1: 'ניסן', 2: 'אייר', 3: 'סיון', 4: 'תמוז', 5: 'אב', 6: 'אלול',
  7: 'תשרי', 8: 'חשוון', 9: 'כסלו', 10: 'טבת', 11: 'שבט', 12: 'אדר', 13: 'אדר ב׳',
};

function hebrewLeap(year: number): boolean {
  return (7 * year + 1) % 19 < 7;
}
function hebrewDelay1(year: number): number {
  const months = Math.floor((235 * year - 234) / 19);
  const parts = 12084 + 13753 * months;
  const day = months * 29 + Math.floor(parts / 25920);
  return (3 * (day + 1)) % 7 < 3 ? day + 1 : day;
}
function hebrewDelay2(year: number): number {
  const last = hebrewDelay1(year - 1);
  const present = hebrewDelay1(year);
  const next = hebrewDelay1(year + 1);
  if (next - present === 356) return 2;
  if (present - last === 382) return 1;
  return 0;
}
// Julian day number of 1 Tishrei, year 1. Chosen so known Rosh Hashana civil dates line up
// (5785 → 2024-10-03, 5786 → 2025-09-23). Daytime Hebrew date of a civil day.
const HEBREW_EPOCH = 347998;
function hebrewNewYear(year: number): number {
  return HEBREW_EPOCH + hebrewDelay1(year) + hebrewDelay2(year);
}
function hebrewYearLength(year: number): number {
  return hebrewNewYear(year + 1) - hebrewNewYear(year);
}
function hebrewMonthDays(year: number, month: number): number {
  const len = hebrewYearLength(year);
  const longHeshvan = len === 355 || len === 385;
  const shortKislev = len === 353 || len === 383;
  if (month === 2 || month === 4 || month === 6 || month === 10 || month === 13) return 29;
  if (month === 12 && !hebrewLeap(year)) return 29;
  if (month === 8 && !longHeshvan) return 29;
  if (month === 9 && shortKislev) return 29;
  return 30;
}
function gregorianToJd(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}

export interface HebrewDate { year: number; month: number; day: number; monthName: string; yearLabel: string; dayLabel: string }

const ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
const TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];

export function hebrewNumeral(n: number): string {
  if (n <= 0 || n > 999) return String(n);
  let rest = n;
  let s = '';
  while (rest >= 400) { s += 'ת'; rest -= 400; }
  if (rest >= 100) { s += 'קרש'[Math.floor(rest / 100) - 1]; rest %= 100; }
  if (rest === 15) s += 'טו';
  else if (rest === 16) s += 'טז';
  else {
    if (rest >= 10) s += TENS[Math.floor(rest / 10)];
    s += ONES[rest % 10];
  }
  if (s.length <= 1) return `${s}׳`;
  return `${s.slice(0, -1)}״${s.slice(-1)}`;
}

export function hebrewDateFromIso(iso: string): HebrewDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const jd = gregorianToJd(Number(m[1]), Number(m[2]), Number(m[3]));
  let year = Math.floor((jd - HEBREW_EPOCH) / 365.24682220597794) + 1;
  while (hebrewNewYear(year) > jd) year--;
  while (hebrewNewYear(year + 1) <= jd) year++;
  let remain = jd - hebrewNewYear(year) + 1;
  const months = [7, 8, 9, 10, 11, 12, ...(hebrewLeap(year) ? [13] : []), 1, 2, 3, 4, 5, 6];
  let month = 7;
  for (const candidate of months) {
    const len = hebrewMonthDays(year, candidate);
    if (remain <= len) { month = candidate; break; }
    remain -= len;
  }
  const monthName = month === 12 && hebrewLeap(year) ? 'אדר א׳' : HEB_MONTHS[month] ?? '';
  return { year, month, day: remain, monthName, yearLabel: hebrewNumeral(year % 1000), dayLabel: hebrewNumeral(remain) };
}

export interface CalCell { iso: string; inMonth: boolean; gregorian: number; hebrew: HebrewDate | null }

export function monthGrid(year: number, month: number): { weekdayLabels: string[]; cells: CalCell[]; label: string } {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const startPad = first.getUTCDay();
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: CalCell[] = [];
  for (let i = 0; i < startPad; i++) {
    const d = new Date(Date.UTC(year, month - 1, 1 - (startPad - i)));
    const iso = d.toISOString().slice(0, 10);
    cells.push({ iso, inMonth: false, gregorian: d.getUTCDate(), hebrew: hebrewDateFromIso(iso) });
  }
  for (let day = 1; day <= days; day++) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    cells.push({ iso, inMonth: true, gregorian: day, hebrew: hebrewDateFromIso(iso) });
  }
  while (cells.length % 7) {
    const prev = cells[cells.length - 1]!.iso;
    const d = new Date(`${prev}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    const iso = d.toISOString().slice(0, 10);
    cells.push({ iso, inMonth: false, gregorian: d.getUTCDate(), hebrew: hebrewDateFromIso(iso) });
  }
  const sample = hebrewDateFromIso(`${year}-${String(month).padStart(2, '0')}-15`);
  const label = sample ? `${monthNameHe(month)} ${year} · ${sample.monthName} ${sample.yearLabel}` : `${monthNameHe(month)} ${year}`;
  return { weekdayLabels: WEEKDAYS, cells, label };
}

const GREG_HE = ['', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
function monthNameHe(month: number): string { return GREG_HE[month] ?? ''; }

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}
function compactDate(iso: string): string { return iso.replace(/-/g, ''); }

export function eventIcs(event: Pick<EventRecord, 'id' | 'title' | 'summary' | 'eventDate' | 'startsAt' | 'endsAt' | 'locationLabel' | 'mapUrl' | 'slug'>, pageUrl: string): string | null {
  const start = eventIsoDate(event);
  if (!start) return null;
  const endIso = event.endsAt && /^\d{4}-\d{2}-\d{2}/.test(event.endsAt) ? event.endsAt.slice(0, 10) : start;
  const end = new Date(`${endIso}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  const location = [event.locationLabel, externalHref(event.mapUrl)].filter(Boolean).join(' — ');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//or-hameir//events//HE',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${event.id}@elyashar.online`,
    `DTSTAMP:${compactDate(new Date().toISOString().slice(0, 10))}T000000Z`,
    `DTSTART;VALUE=DATE:${compactDate(start)}`,
    `DTEND;VALUE=DATE:${compactDate(end.toISOString().slice(0, 10))}`,
    `SUMMARY:${icsEscape(event.title)}`,
    event.summary ? `DESCRIPTION:${icsEscape(event.summary)}` : '',
    location ? `LOCATION:${icsEscape(location)}` : '',
    pageUrl ? `URL:${icsEscape(pageUrl)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  return lines.join('\r\n');
}

export function googleCalendarUrl(event: Pick<EventRecord, 'title' | 'summary' | 'eventDate' | 'startsAt' | 'endsAt' | 'locationLabel' | 'mapUrl'>): string | null {
  const start = eventIsoDate(event);
  if (!start) return null;
  const endIso = event.endsAt && /^\d{4}-\d{2}-\d{2}/.test(event.endsAt) ? event.endsAt.slice(0, 10) : start;
  const end = new Date(`${endIso}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${compactDate(start)}/${compactDate(end.toISOString().slice(0, 10))}`,
  });
  if (event.summary) params.set('details', event.summary);
  const location = event.locationLabel || externalHref(event.mapUrl);
  if (location) params.set('location', location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function eventJsonLd(event: Pick<EventRecord, 'title' | 'summary' | 'eventDate' | 'startsAt' | 'endsAt' | 'locationLabel' | 'mapUrl' | 'slug'>, pageUrl: string | null): Record<string, unknown> | null {
  const start = eventIsoDate(event);
  if (!start) return null;
  const locationName = event.locationLabel?.trim() || null;
  const map = externalHref(event.mapUrl);
  const place = locationName || map
    ? { '@type': 'Place', ...(locationName ? { name: locationName } : {}), ...(map ? { url: map } : {}) }
    : undefined;
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    ...(event.summary ? { description: event.summary } : {}),
    startDate: start,
    ...(event.endsAt ? { endDate: event.endsAt.slice(0, 10) } : {}),
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventScheduled',
    inLanguage: 'he',
    ...(place ? { location: place } : {}),
    ...(pageUrl ? { url: pageUrl } : {}),
  };
}

export function bookJsonLd(item: { title: string; summary: string | null; bookDetails: BookDetails | null }, pageUrl: string | null): Record<string, unknown> {
  const offers = bookOffers(item.bookDetails);
  return {
    '@context': 'https://schema.org',
    '@type': 'Book',
    name: item.title,
    inLanguage: 'he',
    ...(item.summary ? { description: item.summary } : {}),
    ...(item.bookDetails?.authorText ? { author: item.bookDetails.authorText } : {}),
    ...(pageUrl ? { url: pageUrl } : {}),
    ...(offers.purchase ? { offers: { '@type': 'Offer', url: offers.purchase, availability: 'https://schema.org/InStock' } } : {}),
  };
}

export interface ContactPayload { name: string | null; email: string; subject: string; body: string; website: string; startedAt: number }
export type ContactErrors = Partial<Record<'name' | 'email' | 'subject' | 'body' | 'form', string>>;

export function validateContact(raw: unknown, now = Date.now()): { ok: true; value: ContactPayload } | { ok: false; errors: ContactErrors; bot?: boolean } {
  const o = (raw ?? {}) as Record<string, unknown>;
  const str = (k: string, max: number) => (typeof o[k] === 'string' ? (o[k] as string).trim().slice(0, max) : '');
  const website = typeof o.website === 'string' ? o.website : '';
  const startedAt = typeof o.startedAt === 'number' ? o.startedAt : 0;
  if (website) return { ok: false, errors: { form: 'לא ניתן לשלוח את הטופס.' }, bot: true };
  if (!startedAt || now - startedAt < 3000) return { ok: false, errors: { form: 'הטופס נשלח מהר מדי. נסו שוב בעוד רגע.' }, bot: true };
  if (now - startedAt > 24 * 3600_000) return { ok: false, errors: { form: 'הטופס פתוח זמן רב מדי. רעננו ושלחו שוב.' } };
  const errors: ContactErrors = {};
  const name = str('name', 81);
  const email = str('email', 201);
  const subject = str('subject', 141);
  const body = str('body', 4001);
  if (name.length > 80) errors.name = 'השם ארוך מדי.';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.email = 'נא למלא כתובת דוא״ל תקינה.';
  if (subject.length < 2) errors.subject = 'נא לכתוב נושא.';
  if (subject.length > 140) errors.subject = 'הנושא ארוך מדי.';
  if (body.length < 10) errors.body = 'נא לכתוב פנייה של 10 תווים לפחות.';
  if (body.length > 4000) errors.body = 'הפנייה ארוכה מדי (עד 4000 תווים).';
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { name: name || null, email, subject, body, website: '', startedAt } };
}

export interface DiffRow { key: string; before: string; after: string }

function flat(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}

/** Field-level diff for a revision snapshot. Skips volatile ids and versions. */
export function revisionDiff(before: Record<string, unknown>, after: Record<string, unknown>): DiffRow[] {
  const skip = new Set(['id', 'version', 'updatedAt', 'createdAt', 'sources']);
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => !skip.has(k)).sort();
  const rows: DiffRow[] = [];
  for (const key of keys) {
    const a = flat(before[key]);
    const b = flat(after[key]);
    if (a !== b) rows.push({ key, before: a.slice(0, 500), after: b.slice(0, 500) });
  }
  return rows;
}

const WRITING_TYPES = new Set(['paragraph', 'heading']);

/** Round-trip of heading/paragraph blocks through a plain Hebrew draft. Other blocks stay put. */
export function blocksToWriting(blocks: Block[]): { text: string; rest: Block[] } {
  const lines: string[] = [];
  const rest: Block[] = [];
  for (const b of blocks) {
    if (b.type === 'heading') lines.push(`${'#'.repeat(b.level)} ${b.text}`);
    else if (b.type === 'paragraph') lines.push(b.text);
    else rest.push(b);
  }
  return { text: lines.join('\n\n'), rest };
}

export function writingToBlocks(text: string, rest: Block[]): Block[] {
  const chunks = text.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  const blocks: Block[] = chunks.map((chunk) => {
    const h = /^(#{2,3})\s+([\s\S]+)$/.exec(chunk);
    if (h) return { type: 'heading' as const, level: (h[1]!.length === 3 ? 3 : 2) as 2 | 3, text: h[2]!.trim() };
    return { type: 'paragraph' as const, text: chunk };
  });
  return [...blocks, ...rest.filter((b) => !WRITING_TYPES.has(b.type))];
}

export function todayIso(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

