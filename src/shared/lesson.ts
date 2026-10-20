import { embedUrl, formatDuration, parseDuration, youtubeId } from './media.ts';
import type { ContentItem, MediaChapter } from './types.ts';

const CHAPTER_LINE = /^(\d{1,2}:\d{2}(?::\d{2})?|\d+)\s*[|–—-]\s*(.+)$/;

export function chaptersFromUnknown(value: unknown): { ok: true; chapters: MediaChapter[] } | { ok: false; error: string } {
  if (value == null || value === '') return { ok: true, chapters: [] };
  if (!Array.isArray(value)) return { ok: false, error: 'פרקים חייבים להיות רשימה' };
  if (value.length > 80) return { ok: false, error: 'יותר מדי פרקים (עד 80)' };
  const chapters: MediaChapter[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object') return { ok: false, error: 'פרק לא תקין' };
    const t = Number((row as { t?: unknown }).t);
    const label = String((row as { label?: unknown }).label ?? '').replace(/\s+/g, ' ').trim();
    if (!Number.isFinite(t) || t < 0 || t > 12 * 3600) return { ok: false, error: 'זמן פרק לא תקין' };
    if (!label || label.length > 160) return { ok: false, error: 'לכל פרק נדרשת כותרת קצרה מהמקור' };
    if (/[<>]/.test(label)) return { ok: false, error: 'כותרת פרק היא טקסט בלבד' };
    chapters.push({ t: Math.round(t), label });
  }
  return { ok: true, chapters };
}

export function parseChapterLines(text: string): { ok: true; chapters: MediaChapter[] } | { ok: false; error: string } {
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const rows: MediaChapter[] = [];
  for (const line of lines) {
    const m = line.match(CHAPTER_LINE);
    if (!m) return { ok: false, error: `שורה לא תקינה: ${line}. הפורמט: 12:40 | כותרת` };
    const raw = m[1] ?? '';
    const t = raw.includes(':') ? parseDuration(raw) : Number(raw);
    if (t == null || !Number.isFinite(t)) return { ok: false, error: `זמן לא תקין: ${line}` };
    rows.push({ t, label: (m[2] ?? '').trim() });
  }
  return chaptersFromUnknown(rows);
}

export function chaptersToText(chapters: MediaChapter[] | null | undefined): string {
  return (chapters ?? []).map((c) => `${formatDuration(c.t)} | ${c.label}`).join('\n');
}

export function cleanTranscript(value: unknown): { ok: true; transcript: string | null } | { ok: false; error: string } {
  if (value == null) return { ok: true, transcript: null };
  const s = String(value).trim();
  if (!s) return { ok: true, transcript: null };
  if (s.length > 20000) return { ok: false, error: 'התמליל ארוך מדי' };
  if (/[<>]/.test(s)) return { ok: false, error: 'התמליל הוא טקסט בלבד, בלי תגיות' };
  return { ok: true, transcript: s };
}

/** YouTube-style t=90, t=1:30, t=1m30s. */
export function parseTimestamp(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Math.min(Number(s), 12 * 3600);
  const clock = parseDuration(s);
  if (clock != null) return clock;
  const m = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m || m[0] === '') return null;
  const sec = Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return sec > 0 ? Math.min(sec, 12 * 3600) : null;
}

export function isoDuration(sec: number | null | undefined): string | null {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return null;
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `PT${h ? `${h}H` : ''}${m ? `${m}M` : ''}${r || (!h && !m) ? `${r}S` : r ? `${r}S` : ''}`;
}

/** A date that was stated for the lesson. The site's own publish time is not a recording date. */
export function lessonDate(item: ContentItem): string | null {
  return item.sourcePublishedDate || item.eventDate || null;
}

export function lessonDescription(item: ContentItem, title: string): string {
  const text = (item.summary ?? '').trim();
  return (text || title).slice(0, 300);
}

function ytId(item: ContentItem): string | null {
  const src = item.sources.find((s) => s.provider === 'youtube' && s.providerId && youtubeId(`https://youtu.be/${s.providerId}`));
  return src?.providerId && /^[A-Za-z0-9_-]{11}$/.test(src.providerId) ? src.providerId : null;
}

/** VideoObject only when a real date exists. uploadDate is never invented. */
export function videoObject(item: ContentItem, title: string): Record<string, unknown> | null {
  if (item.type !== 'video' && item.type !== 'short' && item.type !== 'live') return null;
  const id = ytId(item);
  const date = lessonDate(item);
  if (!id || !date) return null;
  const duration = isoDuration(item.durationSeconds);
  return {
    '@type': 'VideoObject',
    name: title,
    description: lessonDescription(item, title),
    thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    embedUrl: embedUrl('youtube', id),
    uploadDate: date,
    ...(duration ? { duration } : {}),
    inLanguage: 'he',
  };
}

/** PodcastEpisode only for audio that has a real date. No invented audio file. */
export function podcastEpisode(item: ContentItem, title: string, pageUrl: string | null): Record<string, unknown> | null {
  if (item.type !== 'audio') return null;
  const date = lessonDate(item);
  if (!date) return null;
  const audio = item.sources.find((s) => s.kind === 'media' && s.mime?.startsWith('audio/') && s.rightsStatus !== 'blocked');
  const duration = isoDuration(item.durationSeconds);
  return {
    '@type': 'PodcastEpisode',
    name: title,
    description: lessonDescription(item, title),
    datePublished: date,
    ...(duration ? { duration } : {}),
    ...(pageUrl ? { url: pageUrl } : {}),
    ...(audio ? { associatedMedia: { '@type': 'MediaObject', contentUrl: audio.url } } : {}),
    inLanguage: 'he',
  };
}

export function lessonJsonLd(item: ContentItem, title: string, pageUrl: string | null, breadcrumb: Record<string, unknown> | null): Record<string, unknown> | null {
  const media = videoObject(item, title) ?? podcastEpisode(item, title, pageUrl);
  const graph = [breadcrumb, media].filter((x): x is Record<string, unknown> => !!x);
  if (!graph.length) return null;
  if (graph.length === 1) return { '@context': 'https://schema.org', ...graph[0] };
  return { '@context': 'https://schema.org', '@graph': graph };
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Google video sitemap. Entries only for YouTube lessons; description is the summary or the real title. */
export function videoSitemapXml(items: ContentItem[], site: string): string {
  const rows: string[] = [];
  for (const item of items) {
    if (item.type !== 'video' && item.type !== 'short' && item.type !== 'live') continue;
    const id = ytId(item);
    if (!id) continue;
    const title = item.title.split(' / ')[0]?.trim() || item.title;
    const desc = lessonDescription(item, title);
    const date = lessonDate(item);
    const loc = `${site}${encodeURI(`/item/${item.slug}`)}`;
    const bits = [
      `<video:thumbnail_loc>https://i.ytimg.com/vi/${id}/hqdefault.jpg</video:thumbnail_loc>`,
      `<video:title>${xml(title)}</video:title>`,
      `<video:description>${xml(desc)}</video:description>`,
      `<video:player_loc>https://www.youtube-nocookie.com/embed/${id}</video:player_loc>`,
    ];
    if (item.durationSeconds && item.durationSeconds > 0) bits.push(`<video:duration>${Math.round(item.durationSeconds)}</video:duration>`);
    if (date) bits.push(`<video:publication_date>${xml(date)}</video:publication_date>`);
    rows.push(`  <url>\n    <loc>${xml(loc)}</loc>\n    <video:video>\n      ${bits.join('\n      ')}\n    </video:video>\n  </url>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">\n${rows.join('\n')}\n</urlset>\n`;
}
