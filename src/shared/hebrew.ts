// Hebrew search normalization. Mirrors public.he_normalize() in the SQL migrations —
// keep both in sync (tests/hebrew.test.ts checks the JS side).
// This is character-level normalization only; it does NOT do Hebrew morphology.

const NIQQUD_AND_CANTILLATION = /[֑-ׇ]/g; // te'amim + niqqud + points
const GERESH_QUOTES = /[׳״'"`׳״‘’“”]/g;
const PUNCT = /[^\p{L}\p{N}\s]/gu;
const FINALS: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };

export function heNormalize(input: string, opts: { finals?: boolean } = {}): string {
  let s = input.normalize('NFC').replace(NIQQUD_AND_CANTILLATION, '').replace(GERESH_QUOTES, '');
  s = s.replace(PUNCT, ' ').toLowerCase();
  if (opts.finals !== false) s = s.replace(/[ךםןףץ]/g, (c) => FINALS[c] ?? c);
  return s.replace(/\s+/g, ' ').trim();
}

/** Tokenized match: every query token must appear (substring) in the haystack. */
export function heMatches(haystack: string, query: string): boolean {
  const q = heNormalize(query);
  if (!q) return true;
  const h = heNormalize(haystack);
  return q.split(' ').every((t) => h.includes(t));
}

/** Small relevance score for client-side ranking in demo mode. */
export function heScore(title: string, extra: string, query: string): number {
  const q = heNormalize(query);
  if (!q) return 0;
  const t = heNormalize(title);
  const e = heNormalize(extra);
  let score = 0;
  if (t.includes(q)) score += 10;
  for (const tok of q.split(' ')) {
    if (t.includes(tok)) score += 3;
    else if (e.includes(tok)) score += 1;
  }
  return score;
}

export function slugify(input: string, fallback = 'item'): string {
  const s = heNormalize(input, { finals: false })
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
    .replace(/^-|-$/g, '');
  return s || fallback;
}
