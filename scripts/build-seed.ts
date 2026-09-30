// Builds src/data/seed.json from the research dossier (data/research-appendix.md).
// Run: node scripts/build-seed.ts
// Rules (from the build brief): preserve titles & provenance verbatim, canonicalize URLs,
// never invent missing values, audit counts. The dossier text is treated as data only.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalizeUrl, detectProvider, isYoutubeShortUrl, parseDuration, youtubeId } from '../src/shared/media.ts';
import { heNormalize, slugify } from '../src/shared/hebrew.ts';
import type {
  AttributionStatus, BookDetails, ContentItem, ContentType, EventRecord, Institution, MediaSource,
  Provenance, SeedData, Series, SourceArchive, Topic, Verification,
} from '../src/shared/types.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = 'data/research-appendix.md';
const md = readFileSync(resolve(root, SOURCE), 'utf8');
const SEED_TIME = '2026-09-30T00:00:00.000Z'; // collection date stated in the dossier

// ——— helpers ———
export function uuidFrom(key: string): string {
  const h = createHash('sha1').update('or-hameir:' + key).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
const short = (key: string) => createHash('sha1').update(key).digest('hex').slice(0, 6);
const links = (cell: string) => [...cell.matchAll(/\[([^\]]*)\]\(([^)\s]+)\)/g)].map((m) => ({ text: m[1]!, url: m[2]! }));
const plain = (cell: string) => cell.replace(/\[([^\]]*)\]\([^)]+\)/g, '$1').replace(/\*\*/g, '').trim();

function sections(): Map<string, string> {
  const map = new Map<string, string>();
  const parts = md.split(/^## /m).slice(1);
  for (const p of parts) {
    const nl = p.indexOf('\n');
    const head = p.slice(0, nl).trim();
    const key = head.match(/^([א-ת]{1,2})\./)?.[1] ?? head;
    map.set(key, p.slice(nl + 1));
  }
  return map;
}
function tableRows(text: string): string[][] {
  return text
    .split('\n')
    .filter((l) => l.startsWith('|') && !/^\|\s*-/.test(l))
    .slice(0) // header rows removed below
    .map((l) => l.slice(1, l.endsWith('|') ? -1 : undefined).split(' | ').map((c) => c.replace(/^\s*\|?\s*|\s*\|?\s*$/g, '')))
    .filter((cells, i, all) => !(i === 0 || isHeader(cells, all)));
}
function isHeader(cells: string[], _all: string[][]): boolean {
  return cells.some((c) => ['מס׳', 'כותרת', 'מזהה', 'חומר', 'תוכן', 'מקור', 'נושא', 'פעילות מתועדת'].includes(c));
}
function tablesIn(text: string): string[][] {
  // A section can hold several tables (e.g. יא). Header rows are removed per table.
  const out: string[][] = [];
  for (const chunk of text.split(/\n(?=###)|\n\n(?=\|)/)) out.push(...tableRows(chunk));
  return out;
}

// ——— stores ———
const content = new Map<string, ContentItem>(); // key -> item
const archives: SourceArchive[] = [];
const events: EventRecord[] = [];
const usedUrls = new Set<string>();
let order = 0;

function source(contentId: string, url: string, kind: MediaSource['kind'], primary: boolean): MediaSource {
  usedUrls.add(url);
  const provider = detectProvider(url);
  const yt = youtubeId(url);
  const embed = provider === 'youtube' && yt !== null;
  return {
    id: uuidFrom('src:' + canonicalizeUrl(url) + ':' + contentId),
    contentId,
    provider,
    providerId: yt ?? null,
    url,
    canonicalUrl: canonicalizeUrl(url),
    deliveryMode: embed ? 'embed' : 'link',
    kind,
    mime: provider === 'pdf' ? 'application/pdf' : null,
    filesize: null,
    durationSeconds: null,
    checksum: null,
    rightsStatus: embed ? 'embed_only' : 'unverified',
    rightsEvidence: embed ? 'נגן YouTube רשמי בלבד; אין בכך הרשאה להורדה' : null,
    embedStatus: embed ? 'unchecked' : 'unsupported',
    lastCheckedAt: null,
    error: null,
    isPrimary: primary,
    storageBucket: null,
    storagePath: null,
  };
}

interface NewItem {
  key: string;
  type: ContentType;
  title: string;
  prov: Provenance;
  speaker?: string | null;
  attribution: AttributionStatus;
  attributionNote?: string | null;
  verification?: Verification;
  durationText?: string | null;
  eventDate?: string | null;
  eventDateText?: string | null;
  sourcePublishedDate?: string | null;
  summary?: string | null;
  status?: ContentItem['status'];
  book?: BookDetails | null;
}

function upsert(n: NewItem): ContentItem {
  const existing = content.get(n.key);
  if (existing) {
    existing.provenance.push(n.prov);
    // Fill gaps only; never overwrite a value that came from an earlier, more specific row.
    existing.sourcePublishedDate ??= n.sourcePublishedDate ?? null;
    existing.summary ??= n.summary ?? null;
    return existing;
  }
  const id = uuidFrom('content:' + n.key);
  const titleForSlug = n.title.split('/')[0] ?? n.title;
  const item: ContentItem = {
    id,
    slug: `${slugify(titleForSlug, n.type)}-${short(n.key)}`,
    type: n.type,
    title: n.title,
    summary: n.summary ?? null,
    body: [],
    speaker: n.speaker ?? null,
    attributionStatus: n.attribution,
    attributionNote: n.attributionNote ?? null,
    eventDate: n.eventDate ?? null,
    eventDateText: n.eventDateText ?? null,
    sourcePublishedDate: n.sourcePublishedDate ?? null,
    durationSeconds: parseDuration(n.durationText),
    durationText: n.durationText && parseDuration(n.durationText) !== null ? n.durationText : null,
    status: n.status ?? 'published',
    publishedAt: (n.status ?? 'published') === 'published' ? SEED_TIME : null,
    featured: false,
    verification: n.verification ?? 'located',
    provenance: [n.prov],
    duplicateGroup: null,
    catalogOrder: order++,
    topicIds: [],
    seriesIds: [],
    sources: [],
    bookDetails: n.book ?? null,
    version: 1,
    createdAt: SEED_TIME,
    updatedAt: SEED_TIME,
    deletedAt: null,
  };
  content.set(n.key, item);
  return item;
}
function addSource(item: ContentItem, url: string, kind: MediaSource['kind']) {
  const canon = canonicalizeUrl(url);
  if (item.sources.some((s) => s.canonicalUrl === canon)) {
    usedUrls.add(url);
    return;
  }
  const primary = kind === 'media' && !item.sources.some((s) => s.isPrimary);
  item.sources.push(source(item.id, url, kind, primary));
}
const RABBI = 'הרב ליאור כהן';
const namesRabbi = (t: string) => /ליאור כהן|ליאור הכהן|הגר"ל כהן|Lior Cohen/.test(t);
const dmy = (s: string | undefined) => {
  const m = s?.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

const S = sections();

// ——— יא: active channel catalog (80 video, 87 short, 2 live) ———
const channelCounts = { video: 0, short: 0, live: 0 };
{
  const text = S.get('יא')!;
  const blocks = text.split(/^### /m).slice(1);
  for (const b of blocks) {
    const head = b.slice(0, b.indexOf('\n'));
    const type: ContentType = head.startsWith('סרטון קצר') ? 'short' : head.startsWith('שידור חי') ? 'live' : 'video';
    for (const cells of tableRows(b)) {
      const [row, title, dur, link] = cells;
      const url = links(link ?? '')[0]?.url;
      if (!url || !title) continue;
      const vid = youtubeId(url)!;
      const item = upsert({
        key: 'yt:' + vid,
        type: type === 'video' && isYoutubeShortUrl(url) ? 'short' : type,
        title: title.trim(),
        prov: { section: 'יא', row },
        speaker: namesRabbi(title) ? RABBI : null,
        attribution: namesRabbi(title) ? 'title_names_rabbi' : 'channel_only',
        attributionNote: namesRabbi(title) ? null : 'פורסם בערוץ מוסדות אור המאיר; הכותרת אינה מציינת את הדובר',
        durationText: dur === 'לא חולץ' ? null : dur,
        eventDateText: title.match(/[א-ת]{1,2}["״]?[א-ת]? ?(אייר|אב|תשרי|אלול|ניסן|סיון|תמוז|חשון|כסלו|טבת|שבט|אדר) ה?תשפ["״]?[א-ת]/)?.[0] ?? null,
      });
      addSource(item, url, 'media');
      channelCounts[item.type === 'live' ? 'live' : item.type === 'short' ? 'short' : 'video']++;
    }
  }
}

// ——— יב: legacy channel (5) ———
let legacyCount = 0;
for (const [title, link] of tableRows(S.get('יב')!)) {
  const url = links(link ?? '')[0]!.url;
  const item = upsert({
    key: 'yt:' + youtubeId(url),
    type: 'video',
    title: title!.trim(),
    prov: { section: 'יב', note: 'ערוץ ותיק נוסף; בעלות לא אומתה' },
    speaker: RABBI,
    attribution: 'title_names_rabbi',
    verification: 'archive',
  });
  addSource(item, url, 'media');
  legacyCount++;
}

// ——— ב: videos, lessons, podcast (rows 10–19) ———
for (const [row, what, kindDate, link, note] of tableRows(S.get('ב')!)) {
  const ls = links(link ?? '');
  const video = ls.find((l) => youtubeId(l.url));
  const pages = ls.filter((l) => !youtubeId(l.url));
  const dateSrc = dmy(kindDate?.match(/(?:כתבת המקור|כתבת מקור|פרסום) (\d{2}\.\d{2}\.\d{4})/)?.[1]);
  const isCandidate = row === '19';
  const key = video ? 'yt:' + youtubeId(video.url) : 'url:' + canonicalizeUrl(pages[0]!.url);
  const type: ContentType = video && isYoutubeShortUrl(video.url) ? 'short' : 'video';
  const item = upsert({
    key,
    type,
    title: plain(what!),
    prov: { section: 'ב', row, note: [plain(kindDate ?? ''), plain(note ?? '')].filter(Boolean).join(' — ') },
    speaker: row === '10' ? `${RABBI} (בהגשת הרב דניאל יהודה)` : RABBI,
    attribution: row === '13' ? 'other_speaker' : 'source_page',
    attributionNote: row === '13' ? 'תיעוד ברכת הרב עובדיה יוסף לרב ליאור כהן; אינו שיעור' : plain(note ?? '') || null,
    verification: isCandidate ? 'candidate' : 'located',
    status: isCandidate ? 'in_review' : 'published',
    sourcePublishedDate: row === '13' ? dmy('22.05.2025') : dateSrc,
    eventDateText: row === '13' ? 'סוכות תשע״ג (לפי המקור)' : row === '18' ? 'מוצאי שבת תצוה תשפ״ה (בכותרת)' : row === '19' ? '30.09.2025 בכותרת — ייתכן אי־התאמה לשנה העברית' : null,
  });
  if (video) addSource(item, video.url, 'media');
  for (const p of pages) addSource(item, p.url, row === '18' || row === '19' ? 'archive' : row === '16' || row === '17' ? 'media' : 'source_page');
}

// ——— יג: additional video ids (8) ———
let additional = 0;
for (const [vid, watch, src] of tableRows(S.get('יג')!)) {
  const url = links(watch ?? '')[0]!.url;
  const srcUrl = links(src ?? '')[0]!.url;
  const existed = content.has('yt:' + vid);
  const item = upsert({
    key: 'yt:' + vid,
    type: 'video',
    title: existed ? '' : `סרטון מתוך ${srcUrl}`,
    prov: { section: 'יג', row: vid },
    speaker: RABBI,
    attribution: 'source_page',
  });
  addSource(item, url, 'media');
  addSource(item, srcUrl, 'source_page');
  additional++;
}

// ——— ד: parasha drashot (text pages; video where extracted in טו) ———
const readPages = tableRows(S.get('טו')!).map(([row, title, link, vids]) => ({
  row: row!,
  title: plain(title ?? ''),
  url: links(link ?? '')[0]!.url,
  videoIds: links(vids ?? '').map((l) => youtubeId(l.url)!).filter(Boolean),
}));
for (const p of readPages) usedUrls.add(p.url);
for (const [row, topic, link] of tableRows(S.get('ד')!)) {
  const url = links(link ?? '')[0]!.url;
  const read = readPages.find((p) => canonicalizeUrl(p.url) === canonicalizeUrl(url));
  const vid = read?.videoIds[0];
  const pageTitle = read?.title.split('/')[0]?.replace(/^אור המאיר >\s*/, '').replace(/^המאור הגדול\s*/, '').trim();
  const item = upsert({
    key: vid ? 'yt:' + vid : 'url:' + canonicalizeUrl(url),
    type: vid ? 'video' : 'article',
    title: pageTitle && pageTitle.length > 3 ? pageTitle : plain(topic!),
    summary: plain(topic!),
    prov: { section: 'ד', row, note: 'תאריך ההקלטה אינו ידוע; הסרטונים לא נצפו' },
    speaker: RABBI,
    attribution: 'source_page',
  });
  if (vid) {
    const yt = readPages.find((p) => p.videoIds.includes(vid));
    if (yt) addSource(item, `https://www.youtube.com/watch?v=${vid}`, 'media');
  }
  addSource(item, url, 'source_page');
}
// Fill titles for יג items that only had a source page, from the read-pages list.
for (const item of content.values()) {
  if (item.title === '' || item.title.startsWith('סרטון מתוך ')) {
    const page = item.sources.find((s) => s.kind === 'source_page');
    const read = page && readPages.find((p) => canonicalizeUrl(p.url) === page.canonicalUrl);
    item.title = read?.title ? read.title.replace(/\s+\/\s+/g, ' / ') : item.title || 'סרטון ללא כותרת במקור';
  }
}

// ——— ג + יד: radio program items (Kol Barama) ———
{
  const url12 = links(S.get('ג')!).find((l) => l.url.includes('/item/'))!.url;
  const a = upsert({
    key: 'url:' + canonicalizeUrl(url12),
    type: 'audio',
    title: 'אור הנאמן — דברי הרב על היחס ללימוד תורה לפני תשעה באב',
    prov: { section: 'ג', note: 'בעמוד מוזכרת גם הקלטה של הרב מאזוז; יש להבדיל בין שני הדוברים' },
    speaker: RABBI,
    attribution: 'source_page',
    attributionNote: 'בעמוד מופיעה גם הקלטה של הרב מאזוז זצ״ל — שני דוברים שונים',
    eventDate: '2026-07-12',
  });
  addSource(a, url12, 'source_page');
}

// ——— ה: written answers ———
for (const [row, topic, link, attr] of tableRows(S.get('ה')!)) {
  const url = links(link ?? '')[0]!.url;
  const noteOnly = row === '39';
  const item = upsert({
    key: 'url:' + canonicalizeUrl(url),
    type: 'answer',
    title: plain(topic!),
    prov: { section: 'ה', row, note: plain(attr ?? '') },
    speaker: noteOnly ? null : RABBI,
    attribution: noteOnly ? 'note_only' : 'source_page',
    attributionNote: noteOnly ? 'בתשובה מופיעה הערה המיוחסת לרב; התשובה כולה אינה מיוחסת לו' : plain(attr ?? ''),
  });
  addSource(item, url, 'source_page');
}

// ——— ז: books and PDFs ———
{
  const text = S.get('ז')!;
  const lines = text.split('\n').filter((l) => /^\d\. \*\*/.test(l));
  const books: [string, BookDetails, AttributionStatus][] = [
    ['ימי מלך — שיחות הרב ליאור כהן על הרב מאזוז', { authorText: 'שיחות הרב ליאור כהן (לפי הדיווח)', editorText: null, publisher: null, authoredByRabbi: true, coverPath: null, pdfAccess: 'none', locatedStatus: 'אותר דיווח על קיומו; לא אותר PDF מלא ולא פרטי עריכה והוצאה' }, 'source_page'],
    ['ימי מלך — קונטרס משפחתי בענייני חופה ונישואין', { authorText: null, editorText: null, publisher: 'הוצא בידי החתן בשמחת נישואין', authoredByRabbi: false, coverPath: null, pdfAccess: 'none', locatedStatus: 'דיווחים בלבד; ספר שונה מ"ימי מלך" של שיחות הרב' }, 'not_author'],
    ['אגרות הנאמ״ן', { authorText: 'מכתבי הרב מאזוז עם הרב שמואל דוד הכהן מונק', editorText: null, publisher: null, authoredByRabbi: false, coverPath: null, pdfAccess: 'none', locatedStatus: 'מוזכר בדיווחי הנישואין; לא אותר קובץ' }, 'not_author'],
    ['חיים נתת לו', { authorText: 'ליקוט מתורת הרב מאזוז', editorText: 'הרב ינון חי מאדאר', publisher: null, authoredByRabbi: false, coverPath: null, pdfAccess: 'none', locatedStatus: 'אותר פרסום על הקונטרס' }, 'not_author'],
    ['בית נאמן חלק ד׳ והיומן האישי של הרב מאזוז', { authorText: null, editorText: null, publisher: null, authoredByRabbi: false, coverPath: null, pdfAccess: 'none', locatedStatus: 'מוזכרים בתיעוד הביקור בדרום; תפקיד הרב ליאור בעריכתם לא אומת' }, 'not_author'],
  ];
  lines.forEach((line, i) => {
    const [title, details, attr] = books[i]!;
    const item = upsert({
      key: 'book:' + title,
      type: 'book',
      title,
      summary: plain(line.replace(/^\d\. \*\*[^*]+\*\*:?\s*/, '')),
      prov: { section: 'ז', row: String(i + 1) },
      speaker: details.authoredByRabbi ? RABBI : null,
      attribution: attr,
      book: details,
    });
    for (const l of links(line)) addSource(item, l.url, 'source_page');
  });
  const pdfRows = tableRows(text.slice(text.indexOf('### קובצי PDF')));
  const yd = tableRows(S.get('יד')!).filter(([, link]) => /\.pdf/i.test(decodeURI(links(link ?? '')[0]?.url ?? '')));
  for (const [title, link, state] of [...pdfRows, ...yd]) {
    const url = links(link ?? '')[0]!.url;
    const item = upsert({
      key: 'url:' + canonicalizeUrl(url),
      type: 'leaflet',
      title: plain(title!),
      summary: plain(state ?? ''),
      prov: { section: pdfRows.some((r) => r[1] === link) ? 'ז' : 'יד', note: plain(state ?? '') },
      speaker: null,
      attribution: 'source_page',
      attributionNote: 'עלון שבו מוזכר הרב; אינו חיבור שלו',
      book: { authorText: null, editorText: null, publisher: 'ישיבת כסא רחמים (אתר המקור)', authoredByRabbi: false, coverPath: null, pdfAccess: 'none', locatedStatus: 'קישור ל-PDF חיצוני; לא נקרא במלואו ולא נשמר אצלנו' },
    });
    addSource(item, url, 'pdf');
  }
}

// ——— א + prose + יד: archives ———
{
  for (const [row, name, material, link] of tableRows(S.get('א')!)) {
    const l = links(link ?? '')[0]!;
    usedUrls.add(l.url);
    const state = plain(link ?? '').replace(l.text, '').replace(/^\s*—\s*/, '');
    archives.push({
      id: uuidFrom('archive:' + canonicalizeUrl(l.url)),
      name: plain(name!),
      material: plain(material!),
      url: l.url,
      verification: /מועמד/.test(state) ? 'candidate' : 'archive',
      note: [`שורה ${row}`, state].filter(Boolean).join(' — '),
    });
  }
  const active = 'https://www.youtube.com/channel/UCMnbrfOfK2Chfh7sGUiv_rA';
  usedUrls.add(active);
  archives.unshift({
    id: uuidFrom('archive:' + active),
    name: 'ערוץ YouTube של מוסדות אור המאיר (הערוץ הפעיל)',
    material: '80 סרטונים, 87 קצרים ושני שידורים מוקלטים נאספו',
    url: active,
    verification: 'archive',
    note: 'תיאור הערוץ מציג אותו כערוץ מוסדות אור המאיר בראשות הרב',
  });
  const yd = tableRows(S.get('יד')!);
  const [name, link, state] = yd[0]!;
  const u = links(link ?? '')[0]!.url;
  usedUrls.add(u);
  archives.push({ id: uuidFrom('archive:' + u), name: plain(name!), material: 'כתבות על הרב', url: u, verification: 'archive', note: plain(state ?? '') });
}

// ——— ו + יד: institutions and events ———
const institutions: Institution[] = [
  { slug: 'or-hameir', name: 'מוסדות אור המאיר', description: 'מקורות מוסדיים מתארים את הרב ליאור כהן כראש מוסדות אור המאיר באלעד.', sourceUrls: ['https://www.ktr.org.il/post/_1110', 'https://www.youtube.com/channel/UCMnbrfOfK2Chfh7sGUiv_rA'] },
  { slug: 'maor-yosef', name: 'ישיבת מאור יוסף', description: 'מקורות מוסדיים מציגים את הרב כראש ישיבת מאור יוסף. לפי כתבת הייסוד זו ישיבה לצעירים, נפרדת מהישיבה הגדולה אורחות מאיר.', sourceUrls: ['https://www.ktr.org.il/post/_1110'] },
  { slug: 'orchot-meir', name: 'הישיבה הגדולה אורחות מאיר', description: 'ישיבה גדולה שייסודה בראשות הרב מתועד בכתבה בכתר מלוכה.', sourceUrls: ['https://www.ktr.org.il/post/_1110'] },
  { slug: 'heichal-moshe', name: 'קהילת היכל משה, רמת גן', description: 'נמצא תיעוד על קהילת היכל משה במגדל משה אביב ברמת גן. זמני שיעורים ופעילות כיום טרם אומתו.', sourceUrls: ['https://www.ktr.org.il/post/__806-1'] },
].map((i) => ({ id: uuidFrom('inst:' + i.slug), ...i, status: 'published' as const, version: 1, deletedAt: null }));
{
  const instFor = (t: string) =>
    /אורחות מאיר/.test(t) ? 'orchot-meir' : /היכל משה/.test(t) ? 'heichal-moshe' : /אור המאיר/.test(t) ? 'or-hameir' : null;
  for (const [row, what, link, meaning] of tableRows(S.get('ו')!)) {
    const urls = links(link ?? '').map((l) => l.url);
    urls.forEach((u) => usedUrls.add(u));
    const slugKey = instFor(plain(what!) + ' ' + plain(meaning ?? ''));
    events.push({
      id: uuidFrom('event:' + urls[0]),
      slug: `${slugify(plain(what!))}-${short(urls[0]!)}`,
      institutionId: slugKey ? institutions.find((i) => i.slug === slugKey)!.id : null,
      title: plain(what!),
      eventDate: null,
      dateText: plain(meaning ?? '').match(/פרסום (\d{2}\.\d{2}\.\d{4})/) ? `פרסום ${plain(meaning ?? '').match(/פרסום (\d{2}\.\d{2}\.\d{4})/)![1]}` : null,
      summary: plain(meaning ?? ''),
      sourceUrls: urls,
      status: 'published',
      version: 1,
      deletedAt: null,
    });
    void row;
  }
  for (const [name, link, state] of tableRows(S.get('יד')!).slice(1)) {
    const url = links(link ?? '')[0]!.url;
    if (/\.pdf/i.test(decodeURI(url)) || url.includes('kol-barama')) continue;
    usedUrls.add(url);
    const family = /נישואי נכד/.test(name!);
    events.push({
      id: uuidFrom('event:' + url),
      slug: `${slugify(plain(name!))}-${short(url)}`,
      institutionId: null,
      title: plain(name!),
      eventDate: null,
      dateText: null,
      summary: plain(state ?? ''),
      sourceUrls: [url],
      status: family ? 'draft' : 'published', // dossier: no need to publish every family detail
      version: 1,
      deletedAt: null,
    });
  }
  // Kol Barama item from יד (04.08.2026 program page)
  const kb = tableRows(S.get('יד')!).find(([, l]) => (l ?? '').includes('kol-barama'))!;
  const kbUrl = links(kb[1]!)[0]!.url;
  const item = upsert({
    key: 'url:' + canonicalizeUrl(kbUrl),
    type: 'audio',
    title: plain(kb[0]!).replace(/^תוכנית /, ''),
    prov: { section: 'יד', note: plain(kb[2] ?? '') },
    speaker: RABBI,
    attribution: 'source_page',
    eventDate: '2026-08-04',
    summary: 'אותר דף אודיו; האודיו לא חולץ',
  });
  addSource(item, kbUrl, 'source_page');
}
// Identification sources in prose (already referenced as events) — mark used.
for (const l of links(md)) if (usedUrls.has(l.url) === false && content.size) {
  /* audited below */
}

// ——— topics (auto-suggested from titles; flagged auto) ———
const TOPIC_RULES: [string, string, RegExp][] = [
  ['yamim-noraim', 'ראש השנה והימים הנוראים', /ראש השנה|ר"ה|יום הדין|כיפור|סליחות|אלול|התרת נדרים|Hatarat Nedarim|מלכויות|ימים נוראים|תשובה/],
  ['sukkot', 'סוכות', /סוכות|סוכה|ארבעת המינים|אושפיזין|אוּשְׁפִּיזִין/],
  ['pesach', 'פסח', /פסח|ליל הסדר|יציאת מצרים/],
  ['shavuot', 'שבועות ומתן תורה', /שבועות|מתן תורה/],
  ['purim', 'פורים ומחצית השקל', /פורים|מגילה|מחצית השקל|המן/],
  ['chanukah', 'חנוכה', /חנוכה|סביבון/],
  ['bein-hametzarim', 'בין המצרים ותשעה באב', /תשעה באב|חורבן|שבת חזון|נחמו|ט"ו באב|דבר האבד|ר"ח אב/],
  ['parasha', 'פרשת השבוע', /פרשת|פרשה|לפרשה/],
  ['mazuz', 'מורשת מרן הרב מאזוז זצ״ל', /מאזוז|מרן|חמיו|הנאמ"ן|הנאמן/],
  ['halacha', 'הלכה', /הלכות|הלכה|דיני|מותר|ברכת|ברכה מברכים/],
  ['emunah', 'אמונה וביטחון', /אמונה|ביטחון|בורא עולם|לבטוח/],
  ['geulah', 'גאולה', /גאולה|משיח/],
  ['smachot', 'חופות ושמחות', /חופה|כתובה|שבע ברכות|נישואין|חתן/],
  ['mishnah', 'משנה והפרק היומי', /הפרק היומי|משנה|ברכות פרק/],
  ['mussar', 'מוסר ומחשבה', /מוסרי|מוסר|יצר הרע|מתחים|אהוב/],
];
const topics: Topic[] = TOPIC_RULES.map(([slug, name], i) => ({
  id: uuidFrom('topic:' + slug), slug, name, description: null, sort: i, status: 'published', version: 1, deletedAt: null, auto: true,
}));
for (const item of content.values()) {
  const text = item.title + ' ' + (item.summary ?? '');
  TOPIC_RULES.forEach(([slug, , re]) => {
    if (re.test(text)) item.topicIds.push(uuidFrom('topic:' + slug));
  });
}

// ——— system series (built on this site from titles — NOT source playlists) ———
const all = [...content.values()];
const byCatalog = (a: ContentItem, b: ContentItem) => a.catalogOrder - b.catalogOrder;
const seriesDefs: [string, string, string, (c: ContentItem) => boolean][] = [
  ['or-haneeman', 'אור הנאמ״ן', 'תוכנית הלכות והנהגות מתורת מרן הרב מאזוז זצ״ל. רשימה שנבנתה באתר מכותרות הערוץ ועמודי קול ברמה; אין בה טענה שכל התוכנית קיימת כאן.', (c) => /^אור הנאמ/.test(c.title) || c.type === 'audio'],
  ['parasha-idea', 'רעיון מוסרי לפרשת השבוע', 'סרטונים שכותרתם מציינת רעיון מוסרי לפרשה או לחג. רשימה שנבנתה באתר.', (c) => /ברעיון/.test(c.title) && c.type === 'video'],
  ['perek-yomi', 'הפרק היומי', 'המשך לימוד המשנה לזכר הרב מאזוז.', (c) => /הפרק היומי/.test(c.title)],
  ['halacha-yomit', 'הלכה יומית — כסא רחמים', 'דפים מאונדקסים באתר כסא רחמים על שם הרב.', (c) => /הלכה יומית/.test(c.title)],
  ['maran-stories', 'סיפורים על מרן הרב מאזוז', 'קטעים קצרים שבהם הרב מספר על חמיו. רשימה שנבנתה באתר.', (c) => c.type === 'short' && /מספר|חושף/.test(c.title)],
];
const series: Series[] = seriesDefs.map(([slug, title, description, match], i) => {
  const items = all.filter(match).sort(byCatalog).map((c) => c.id);
  const id = uuidFrom('series:' + slug);
  for (const cid of items) all.find((c) => c.id === cid)!.seriesIds.push(id);
  return { id, slug, title, description, kind: 'system', sourceUrl: null, status: 'published', sort: i, items, version: 1, deletedAt: null };
});

// ——— duplicate detection (long video vs Short with same title stay separate records) ———
{
  const groups = new Map<string, ContentItem[]>();
  for (const c of all) {
    if (!['video', 'short', 'live'].includes(c.type)) continue;
    const head = heNormalize((c.title.split('/')[0] ?? '').replace(/‼️|⁉️|❓️|🔥|🎥/g, ''));
    if (head.length < 8 || /^אור הנאמ|^אור המאיר$/.test(head)) continue;
    const key = head.replace(/\s/g, '').replace(/ה?שנה$/, '');
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  let g = 0;
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const gid = `dup-${++g}`;
    for (const m of members) m.duplicateGroup = gid;
  }
}

// Featured: a few long lessons (editorial choice can be changed in CMS).
for (const c of all.filter((c) => c.type === 'video' && (c.durationSeconds ?? 0) > 2400).slice(0, 4)) c.featured = true;

// ——— audit ———
const allUrls = new Set([...md.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)].map((m) => m[1]!));
for (const m of md.matchAll(/https?:\/\/[^\s)|]+/g)) allUrls.add(m[0]);
const videoIds = new Set([...allUrls].map((u) => youtubeId(u)).filter(Boolean));
for (const c of all) for (const s of c.sources) usedUrls.add(s.url);
const unassigned = [...allUrls].filter((u) => !usedUrls.has(u));

const seed: SeedData = {
  generatedAt: SEED_TIME,
  sourceFile: SOURCE,
  audit: {
    distinctUrls: allUrls.size,
    distinctVideoIds: videoIds.size,
    activeChannel: { ...channelCounts, total: channelCounts.video + channelCounts.short + channelCounts.live },
    legacyChannel: legacyCount,
    additionalVideoIds: additional,
    readPages: readPages.length,
    contentItems: all.length,
    unassignedUrls: unassigned,
  },
  archives,
  content: all.sort(byCatalog),
  topics,
  series,
  institutions,
  events,
  readPages,
};

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  mkdirSync(resolve(root, 'src/data'), { recursive: true });
  writeFileSync(resolve(root, 'src/data/seed.json'), JSON.stringify(seed, null, 1) + '\n');
  console.log(JSON.stringify(seed.audit, null, 2));
}
export default seed;
