// Hebrew search normalization. Mirrors public.he_normalize() in the SQL migrations —
// keep both in sync (tests/hebrew.test.ts checks the JS side).
// This is character-level normalization only; it does NOT do Hebrew morphology.

const NIQQUD_AND_CANTILLATION = /[֑-ׇ]/g; // te'amim + niqqud + points
const GERESH_QUOTES = /[׳״'"`׳״‘’“”]/g;
const PUNCT = /[^\p{L}\p{N}\s]/gu;
const FINALS: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
// Internal vav/yod are the usual ktiv male/haser difference (תפילה / תפלה). Mirrors he_skeleton().
const MATRES = /([א-ת])[וי]+([א-ת])/g;

export function heNormalize(input: string, opts: { finals?: boolean } = {}): string {
  let s = input.normalize('NFC').replace(NIQQUD_AND_CANTILLATION, '').replace(GERESH_QUOTES, '');
  s = s.replace(PUNCT, ' ').toLowerCase();
  if (opts.finals !== false) s = s.replace(/[ךםןףץ]/g, (c) => FINALS[c] ?? c);
  return s.replace(/\s+/g, ' ').trim();
}

/** Drop internal matres lectionis so spelling variants share one skeleton. */
export function heSkeleton(input: string): string {
  let s = heNormalize(input);
  for (let i = 0; i < 4; i++) {
    const next = s.replace(MATRES, '$1$2');
    if (next === s) break;
    s = next;
  }
  return s;
}

/** Tokenized match: every query token must appear, exactly or as a ktiv variant. */
export function heMatches(haystack: string, query: string): boolean {
  const q = heNormalize(query);
  if (!q) return true;
  const h = heNormalize(haystack);
  const hs = heSkeleton(h);
  return q.split(' ').every((t) => {
    if (!t) return true;
    if (h.includes(t)) return true;
    const sk = heSkeleton(t);
    return sk.length >= 2 && hs.includes(sk);
  });
}

/** Small relevance score for client-side ranking in demo mode. */
export function heScore(title: string, extra: string, query: string): number {
  const q = heNormalize(query);
  if (!q) return 0;
  const t = heNormalize(title);
  const e = heNormalize(extra);
  const ts = heSkeleton(t);
  const es = heSkeleton(e);
  let score = 0;
  if (t.includes(q)) score += 10;
  for (const tok of q.split(' ')) {
    if (!tok) continue;
    const sk = heSkeleton(tok);
    if (t.includes(tok)) score += 3;
    else if (sk.length >= 2 && ts.includes(sk)) score += 2;
    else if (e.includes(tok)) score += 1;
    else if (sk.length >= 2 && es.includes(sk)) score += 1;
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
