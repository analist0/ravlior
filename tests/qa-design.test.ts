import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encode } from 'uqr';
import { publicStage, readingMinutes, sourceLines, tocFromBlocks } from '../src/qa/reading.ts';

test('reading time counts Hebrew letters, not spaces', () => {
  assert.equal(readingMinutes(''), 1);
  assert.equal(readingMinutes('א'.repeat(900)), 1);
  assert.equal(readingMinutes('א'.repeat(901)), 2);
  assert.equal(readingMinutes(`${'א '.repeat(900)}`), 1);
});

test('table of contents uses sanitized heading indexes only', () => {
  const toc = tocFromBlocks([
    { type: 'heading', level: 2, text: 'פתיחה' },
    { type: 'paragraph', text: 'גוף התשובה' },
    { type: 'heading', level: 3, text: '   ' },
    { type: 'heading', level: 3, text: 'סיום' },
  ]);
  assert.deepEqual(toc, [
    { id: 'qa-0', text: 'פתיחה', level: 2 },
    { id: 'qa-2', text: 'סיום', level: 3 },
  ]);
});

test('sources split on real lines and do not invent markers', () => {
  assert.deepEqual(sourceLines('שולחן ערוך אורח חיים סימן רעא\n\nמשנה ברורה שם'), [
    'שולחן ערוך אורח חיים סימן רעא',
    'משנה ברורה שם',
  ]);
  assert.deepEqual(sourceLines('  '), []);
});

test('public track stages map stored statuses without renaming them', () => {
  assert.equal(publicStage('submitted'), 'received');
  assert.equal(publicStage('assigned'), 'review');
  assert.equal(publicStage('answered'), 'answered');
  assert.equal(publicStage('approved'), 'approved');
  assert.equal(publicStage('private_delivered'), 'delivered');
  assert.equal(publicStage('published'), 'delivered');
});

test('local QR matrix is square', () => {
  const qr = encode('HELLO', { ecc: 'M' });
  assert.equal(qr.data.length, qr.size);
  assert.ok(qr.data.every((row) => row.length === qr.size));
  assert.ok(qr.data.some((row) => row.some(Boolean)));
});
