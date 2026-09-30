import { canonicalizeUrl, youtubeId } from './media.ts';
import { CONTENT_TYPES, type ContentItem, type ContentType } from './types.ts';

// CSV/JSON import with validation and duplicate detection (by canonical URL / provider id).

export interface RawImportRow { title: string; type: ContentType; url: string; summary?: string; speaker?: string; durationText?: string }
export interface Preview { row: RawImportRow; action: 'create' | 'duplicate' | 'invalid'; reason?: string; existingId?: string }

/** RFC-4180-ish CSV parser (quotes, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export function rowsFromCsv(text: string): RawImportRow[] {
  const [header, ...body] = parseCsv(text);
  if (!header) return [];
  const idx = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name);
  const get = (r: string[], name: string) => (idx(name) >= 0 ? (r[idx(name)] ?? '').trim() : '');
  return body.map((r) => ({
    title: get(r, 'title'), type: (get(r, 'type') || 'video') as ContentType, url: get(r, 'url'),
    summary: get(r, 'summary') || undefined, speaker: get(r, 'speaker') || undefined, durationText: get(r, 'duration') || undefined,
  }));
}

export function rowsFromJson(text: string): RawImportRow[] {
  const data: unknown = JSON.parse(text);
  const arr = Array.isArray(data) ? data : Array.isArray((data as { items?: unknown }).items) ? (data as { items: unknown[] }).items : [];
  return arr.map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const s = (k: string) => (typeof o[k] === 'string' ? (o[k] as string).trim() : '');
    return { title: s('title'), type: (s('type') || 'video') as ContentType, url: s('url'), summary: s('summary') || undefined, speaker: s('speaker') || undefined, durationText: s('durationText') || s('duration') || undefined };
  });
}

export function previewRows(rows: RawImportRow[], existing: Pick<ContentItem, 'id' | 'sources'>[]): Preview[] {
  const known = new Map<string, string>();
  for (const c of existing) for (const s of c.sources) {
    known.set(s.canonicalUrl, c.id);
    if (s.providerId) known.set(`${s.provider}:${s.providerId}`, c.id);
  }
  const seenInBatch = new Set<string>();
  return rows.map((row) => {
    if (!row.title || row.title.length > 400) return { row, action: 'invalid', reason: 'כותרת חסרה או ארוכה מדי' };
    if (!CONTENT_TYPES.includes(row.type)) return { row, action: 'invalid', reason: `סוג לא מוכר: ${row.type}` };
    let url: URL;
    try { url = new URL(row.url); } catch { return { row, action: 'invalid', reason: 'קישור לא תקין' }; }
    if (url.protocol !== 'https:') return { row, action: 'invalid', reason: 'רק קישורי https' };
    const canon = canonicalizeUrl(row.url);
    const yt = youtubeId(row.url);
    const key = yt ? `youtube:${yt}` : canon;
    const existingId = known.get(canon) ?? (yt ? known.get(`youtube:${yt}`) : undefined);
    if (existingId) return { row, action: 'duplicate', reason: 'קיים כבר בספרייה', existingId };
    if (seenInBatch.has(key)) return { row, action: 'duplicate', reason: 'מופיע פעמיים בקובץ' };
    seenInBatch.add(key);
    return { row, action: 'create' };
  });
}
