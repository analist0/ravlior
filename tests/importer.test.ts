import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, previewRows, rowsFromCsv } from '../src/shared/importer.ts';
import { seed } from './helpers.ts';

test('CSV parser handles quotes, commas and CRLF', () => {
  assert.deepEqual(parseCsv('a,b\r\n"x, ""y""",z\n'), [['a', 'b'], ['x, "y"', 'z']]);
});

test('importer dedupes against the library and within the batch', () => {
  const rows = rowsFromCsv([
    'title,type,url',
    'קיים כבר,video,https://youtu.be/M6BfU-i-_xk',
    'חדש,audio,https://kol-barama.co.il/item/new-1/',
    'חדש שוב,audio,https://www.kol-barama.co.il/item/new-1',
    'לא תקין,video,http://insecure.example/x',
    ',video,https://example.org/a',
    'סוג שגוי,podcast,https://example.org/b',
  ].join('\n'));
  const p = previewRows(rows, seed.content);
  assert.deepEqual(p.map((x) => x.action), ['duplicate', 'create', 'duplicate', 'invalid', 'invalid', 'invalid']);
  assert.ok(p[0]!.existingId);
});
