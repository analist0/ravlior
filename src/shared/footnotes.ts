// Footnote markers inside whitelisted paragraph text.
// A definition paragraph is one that is only "[^n] note" or "[^n]: note".
// Markers in other paragraphs become references. Unknown markers are left as text
// by the renderer only when no definition exists — the parser still records them.

export interface Footnote {
  n: number;
  text: string;
}

const DEF = /^\[\^(\d{1,3})\]:?\s+(\S[\s\S]*)$/;
const MARK = /\[\^(\d{1,3})\]/g;

export function extractFootnotes(paragraphs: string[]): { body: string[]; notes: Footnote[] } {
  const notes: Footnote[] = [];
  const seen = new Set<number>();
  const body: string[] = [];
  for (const raw of paragraphs) {
    const text = raw.trim();
    const def = DEF.exec(text);
    if (def && !text.slice(def[0].length).trim()) {
      const n = Number(def[1]);
      if (!seen.has(n)) {
        seen.add(n);
        notes.push({ n, text: def[2]!.trim() });
      }
      continue;
    }
    body.push(raw);
  }
  notes.sort((a, b) => a.n - b.n);
  return { body, notes };
}

/** Split a paragraph into text runs and footnote reference numbers that have a definition. */
export function footnoteRuns(text: string, defined: Set<number>): Array<{ kind: 'text'; text: string } | { kind: 'ref'; n: number }> {
  const runs: Array<{ kind: 'text'; text: string } | { kind: 'ref'; n: number }> = [];
  let last = 0;
  for (const m of text.matchAll(MARK)) {
    const n = Number(m[1]);
    const start = m.index ?? 0;
    if (!defined.has(n)) continue;
    if (start > last) runs.push({ kind: 'text', text: text.slice(last, start) });
    runs.push({ kind: 'ref', n });
    last = start + m[0].length;
  }
  if (last < text.length) runs.push({ kind: 'text', text: text.slice(last) });
  if (!runs.length) runs.push({ kind: 'text', text });
  return runs;
}
