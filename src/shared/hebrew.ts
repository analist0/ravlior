// Hebrew search normalization. Mirrors public.he_normalize(), he_search_fold() and
// he_keyboard() in the SQL migrations — keep both in sync (tests/hebrew.test.ts).
// Character-level only: niqqud, geresh, final letters, doubled י/ו, and a Latin
// keyboard typed as if it were Hebrew. This is NOT morphological analysis.

const NIQQUD_AND_CANTILLATION = /[֑-ׇ]/g; // te'amim + niqqud + points
const GERESH_QUOTES = /[׳״'"`׳״‘’“”]/g;
const PUNCT = /[^\p{L}\p{N}\s]/gu;
const FINALS: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };

/** Physical QWERTY key → the Hebrew letter printed on an Israeli keyboard. */
const EN_HE: Record<string, string> = {
  q: '/', w: '׳', e: 'ק', r: 'ר', t: 'א', y: 'ט', u: 'ו', i: 'ן', o: 'ם', p: 'פ',
  a: 'ש', s: 'ד', d: 'ג', f: 'כ', g: 'ע', h: 'י', j: 'ח', k: 'ל', l: 'ך', ';': 'ף',
  z: 'ז', x: 'ס', c: 'ב', v: 'ה', b: 'נ', n: 'מ', m: 'צ', ',': 'ת', '.': 'ץ',
};

export function heNormalize(input: string, opts: { finals?: boolean } = {}): string {
  let s = input.normalize('NFC').replace(NIQQUD_AND_CANTILLATION, '').replace(GERESH_QUOTES, '');
  s = s.replace(PUNCT, ' ').toLowerCase();
  if (opts.finals !== false) s = s.replace(/[ךםןףץ]/g, (c) => FINALS[c] ?? c);
  return s.replace(/\s+/g, ' ').trim();
}

/** Orthographic fold after heNormalize: יי→י and וו→ו (כתיב מלא / חסר of matres). */
export function heSearchFold(input: string): string {
  return heNormalize(input).replace(/יי+/g, 'י').replace(/וו+/g, 'ו');
}

/** Map a string typed on a Latin layout to Hebrew. Other characters pass through. */
export function heKeyboard(input: string): string {
  return [...input.toLowerCase()].map((ch) => EN_HE[ch] ?? ch).join('');
}

/** Primary fold, plus the Hebrew-keyboard reading when the query has no Hebrew letters. */
export function queryForms(query: string): string[] {
  const main = heSearchFold(query);
  const forms = main ? [main] : [];
  if (/[a-z]/i.test(query) && !/[א-ת]/.test(query)) {
    const alt = heSearchFold(heKeyboard(query));
    if (alt && alt !== main) forms.push(alt);
  }
  return forms;
}

/** Tokenized match: every query token must appear. Empty query matches everything. */
export function heMatches(haystack: string, query: string): boolean {
  const forms = queryForms(query);
  if (!forms.length) return true;
  const h = heSearchFold(haystack);
  return forms.some((q) => q.split(' ').filter(Boolean).every((t) => h.includes(t)));
}

function scoreFolded(title: string, extra: string, q: string): number {
  const t = heSearchFold(title);
  const e = heSearchFold(extra);
  let score = 0;
  if (t.includes(q)) score += 10;
  for (const tok of q.split(' ')) {
    if (!tok) continue;
    if (t.includes(tok)) score += 3;
    else if (e.includes(tok)) score += 1;
  }
  return score;
}

/** Small relevance score for client-side ranking in demo mode. */
export function heScore(title: string, extra: string, query: string): number {
  const forms = queryForms(query);
  if (!forms.length) return 0;
  return Math.max(...forms.map((q) => scoreFolded(title, extra, q)));
}

export function slugify(input: string, fallback = 'item'): string {
  const s = heNormalize(input, { finals: false })
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
    .replace(/^-|-$/g, '');
  return s || fallback;
}
