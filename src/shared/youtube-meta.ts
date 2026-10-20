import { formatDuration } from './media.ts';

/** Staff-facing metadata read from YouTube. Nothing here is invented: missing fields stay null. */
export interface YoutubeMeta {
  providerId: string;
  title: string;
  author: string | null;
  thumbnailUrl: string;
  durationSeconds: number | null;
  durationText: string | null;
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  if (/[<>]/.test(value)) return null;
  const s = value.replace(/[\u0000-\u001f]/g, '').trim();
  if (!s) return null;
  return s.slice(0, max);
}

/** Official oEmbed JSON → title and channel name. Thumbnail is always our own ytimg URL. */
export function parseOEmbedPayload(id: string, data: unknown): { title: string; author: string | null } | null {
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
  if (!data || typeof data !== 'object') return null;
  const rec = data as Record<string, unknown>;
  const title = cleanText(rec.title, 300);
  if (!title) return null;
  return { title, author: cleanText(rec.author_name, 160) };
}

/** `"lengthSeconds":"123"` as published on YouTube's embed page. Rejects junk and extremes. */
export function parseLengthSeconds(html: string): number | null {
  const m = html.match(/"lengthSeconds"\s*:\s*"(\d{1,5})"/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0 || n > 12 * 60 * 60) return null;
  return n;
}

export function youtubeMetaFromParts(
  id: string,
  oembed: unknown,
  html: string | null,
): YoutubeMeta | null {
  const parsed = parseOEmbedPayload(id, oembed);
  if (!parsed) return null;
  const durationSeconds = html ? parseLengthSeconds(html) : null;
  return {
    providerId: id,
    title: parsed.title,
    author: parsed.author,
    thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    durationSeconds,
    durationText: durationSeconds ? formatDuration(durationSeconds) : null,
  };
}
