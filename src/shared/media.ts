import type { MediaProvider } from './types.ts';

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

/** Extract an 11-char YouTube video id from watch/shorts/youtu.be/embed URLs. */
export function youtubeId(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0] ?? null;
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else {
      const m = url.pathname.match(/^\/(shorts|embed|live|v)\/([^/?#]+)/);
      if (m) id = m[2] ?? null;
    }
  }
  return id && YT_ID.test(id) ? id : null;
}

export function isYoutubeShortUrl(input: string): boolean {
  try {
    return new URL(input).pathname.startsWith('/shorts/');
  } catch {
    return false;
  }
}

/** Canonical URL used for dedupe. Keeps the source URL separately; never replaces provenance. */
export function canonicalizeUrl(input: string): string {
  const yt = youtubeId(input);
  if (yt) return `https://www.youtube.com/watch?v=${yt}`;
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return input.trim();
  }
  url.hash = '';
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  for (const p of [...url.searchParams.keys()]) if (/^utm_|^fbclid$|^gclid$/.test(p)) url.searchParams.delete(p);
  url.protocol = 'https:';
  let s = url.toString();
  // Decode percent-encoded Hebrew so canonical forms compare equal regardless of encoding.
  try {
    s = decodeURI(s);
  } catch {
    /* keep encoded */
  }
  return s.endsWith('/') && url.pathname !== '/' ? s.slice(0, -1) : s;
}

export function detectProvider(input: string): MediaProvider {
  let host = '';
  try {
    host = new URL(input).hostname.replace(/^www\./, '');
  } catch {
    return 'web';
  }
  if (/\.pdf$/i.test(decodeURI(input).split('?')[0] ?? '')) return 'pdf';
  if (host === 'youtube.com' || host === 'youtu.be' || host.endsWith('.youtube.com')) return 'youtube';
  if (host === 'kol-barama.co.il') return 'kol-barama';
  if (host === 'ykr.org.il') return 'ykr';
  if (host === 'ktr.org.il') return 'ktr';
  if (host === 'hm-news.co.il') return 'hm-news';
  return 'web';
}

/** Only these iframe origins may ever be rendered. Everything else falls back to a source link. */
export const IFRAME_ALLOWLIST: Record<string, (id: string) => string> = {
  youtube: (id) => `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0&modestbranding=1`,
};

export function embedUrl(provider: MediaProvider, providerId: string | null): string | null {
  if (!providerId) return null;
  const make = IFRAME_ALLOWLIST[provider];
  if (!make) return null;
  if (provider === 'youtube' && !YT_ID.test(providerId)) return null;
  return make(providerId);
}

export function youtubeThumb(id: string, size: 'mq' | 'hq' = 'mq'): string {
  return `https://i.ytimg.com/vi/${id}/${size}default.jpg`;
}

/** Parse "1:10:35" / "24:26" / "0:30" into seconds; returns null for "לא חולץ" etc. */
export function parseDuration(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = text.trim().match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return m[3] !== undefined ? a * 3600 + b * 60 + Number(m[3]) : a * 60 + b;
}

export function formatDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return '';
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

/** Native <audio>/<video> can play these directly; HLS is intentionally not listed. */
export const NATIVE_PLAYABLE_MIME = ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'video/mp4', 'video/webm'];
