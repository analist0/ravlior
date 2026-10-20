import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractFootnotes, footnoteRuns } from '../src/shared/footnotes.ts';

test('definition paragraphs become notes and markers become refs', () => {
  const { body, notes } = extractFootnotes([
    'אהרן הכהן[^1] והחורבן.',
    '[^1]: ההפניה כפי שהיא בגוף הטקסט.',
    'שורה בלי הערה.',
  ]);
  assert.deepEqual(notes, [{ n: 1, text: 'ההפניה כפי שהיא בגוף הטקסט.' }]);
  assert.equal(body.length, 2);
  const defined = new Set(notes.map((n) => n.n));
  const runs = footnoteRuns(body[0]!, defined);
  assert.deepEqual(runs.map((r) => r.kind), ['text', 'ref', 'text']);
  assert.equal(footnoteRuns('אין [^2] הגדרה', defined).every((r) => r.kind === 'text'), true);
});
