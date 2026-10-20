// Site-wide search used by the command palette (demo mode) and mirrored by
// public.search_site() in neon/migrations/009_site_updates.sql.
// Token AND-match ranks first. A miss falls back to character-trigram
// word similarity (the same idea as pg_trgm.word_similarity) so a one-letter
// Hebrew typo still surfaces. No morphology: prefixes are not stripped.

import { heNormalize } from './hebrew.ts';

export const FUZZY_FLOOR = 0.35;
export const TOKEN_SCORE = 5;

export type SiteKind = 'content' | 'topic' | 'series' | 'page' | 'institution' | 'nav';

export interface SiteDoc {
  kind: SiteKind;
  id: string;
  title: string;
  extra?: string;
  href: string;
  label: string;
}

export interface SiteHit extends SiteDoc {
  score: number;
  fuzzy: boolean;
}

/** pg_trgm-style character trigrams, padded with two spaces. */
export function trigrams(input: string): string[] {
  const s = `  ${input} `;
  const out: string[] = [];
  for (let i = 0; i <= s.length - 3; i++) out.push(s.slice(i, i + 3));
  return out;
}

/** Jaccard similarity of trigram multisets. 1 when both strings are empty. */
export function trigramSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const count = (xs: string[]) => {
    const m = new Map<string, number>();
    for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
    return m;
  };
  const ma = count(trigrams(a));
  const mb = count(trigrams(b));
  let inter = 0;
  let union = 0;
  for (const k of new Set([...ma.keys(), ...mb.keys()])) {
    const ca = ma.get(k) ?? 0;
    const cb = mb.get(k) ?? 0;
    inter += Math.min(ca, cb);
    union += Math.max(ca, cb);
  }
  return union === 0 ? 0 : inter / union;
}

/**
 * Greatest trigram similarity between `query` and any word or short window of `hay`.
 * Approximates pg_trgm.word_similarity for short Hebrew titles.
 */
export function wordSimilarity(query: string, hay: string): number {
  if (!query || !hay) return 0;
  if (hay.includes(query)) return 1;
  let best = trigramSimilarity(query, hay.slice(0, 80));
  const words = hay.split(' ').filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    best = Math.max(best, trigramSimilarity(query, words[i]!));
    if (words[i + 1]) best = Math.max(best, trigramSimilarity(query, `${words[i]} ${words[i + 1]}`));
    if (words[i + 2]) best = Math.max(best, trigramSimilarity(query, `${words[i]} ${words[i + 1]} ${words[i + 2]}`));
  }
  const n = query.length;
  const span = hay.length;
  if (span > n && n >= 3 && span <= 240) {
    const step = n > 12 ? 2 : 1;
    for (let i = 0; i <= span - n; i += step) {
      best = Math.max(best, trigramSimilarity(query, hay.slice(i, i + n)));
      if (best >= 0.92) break;
    }
  }
  return best;
}

/** 0 = no match. Token hits are ≥ TOKEN_SCORE; fuzzy-only hits are the similarity itself. */
export function matchScore(title: string, extra: string, query: string): number {
  const q = heNormalize(query);
  if (!q) return 0;
  const t = heNormalize(title);
  const h = heNormalize(`${title} ${extra}`);
  const tokens = q.split(' ').filter(Boolean);
  const allIn = (s: string) => tokens.every((tok) => s.includes(tok));
  const sim = Math.max(wordSimilarity(q, t), wordSimilarity(q, h));
  if (t.includes(q)) return 12 + sim;
  if (allIn(t)) return 8 + sim;
  if (allIn(h)) return TOKEN_SCORE + sim;
  if (q.length < 3 || sim < FUZZY_FLOOR) return 0;
  return sim;
}

export function searchDocs(docs: SiteDoc[], query: string, limit = 12): SiteHit[] {
  const q = query.trim();
  if (heNormalize(q).length < 2) return [];
  const hits: SiteHit[] = [];
  for (const doc of docs) {
    const score = matchScore(doc.title, doc.extra ?? '', q);
    if (score <= 0) continue;
    hits.push({ ...doc, score, fuzzy: score < TOKEN_SCORE });
  }
  hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'he'));
  return hits.slice(0, Math.min(24, Math.max(1, limit)));
}

/** Fixed destinations. Labels are the site's own navigation, not new claims. */
export const NAV_DOCS: SiteDoc[] = [
  { kind: 'nav', id: 'nav-library', title: 'ספריית השיעורים', extra: 'חיפוש וידאו אודיו קטעים', href: '/library', label: 'nav' },
  { kind: 'nav', id: 'nav-series', title: 'סדרות', extra: 'פלייליסטים', href: '/series', label: 'nav' },
  { kind: 'nav', id: 'nav-topics', title: 'נושאים', extra: 'חגים הלכה פרשה', href: '/topics', label: 'nav' },
  { kind: 'nav', id: 'nav-books', title: 'ספרים עלונים ודברי תורה', extra: 'עיון', href: '/books', label: 'nav' },
  { kind: 'nav', id: 'nav-responsa', title: 'שאלות ותשובות', extra: 'שו״ת מאגר', href: '/responsa', label: 'nav' },
  { kind: 'nav', id: 'nav-ask', title: 'שאלה לרב', extra: 'פנייה', href: '/ask', label: 'nav' },
  { kind: 'nav', id: 'nav-about', title: 'הרב והמוסדות', extra: 'אודות', href: '/about', label: 'nav' },
  { kind: 'nav', id: 'nav-institutions', title: 'מוסדות ופעילות', extra: '', href: '/institutions', label: 'nav' },
  { kind: 'nav', id: 'nav-sources', title: 'מקורות', extra: 'ארכיונים', href: '/sources', label: 'nav' },
];

export function pageHref(slug: string): string {
  return slug === 'about' ? '/about' : `/p/${slug}`;
}

/** Adds fixed navigation hits and keeps the best score per href+title. */
export function mergeNav(hits: SiteHit[], query: string, limit = 12): SiteHit[] {
  const nav = searchDocs(NAV_DOCS, query, 4);
  const all = [...hits];
  const seen = new Set(hits.map((h) => `${h.href}\n${h.title}`));
  for (const n of nav) {
    const key = `${n.href}\n${n.title}`;
    if (!seen.has(key)) { seen.add(key); all.push(n); }
  }
  all.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'he'));
  return all.slice(0, limit);
}
