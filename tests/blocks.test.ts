import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeUrl, sanitizeBlocks } from '../src/shared/blocks.ts';

test('unknown/HTML/script blocks are dropped with an issue', () => {
  const { blocks, issues } = sanitizeBlocks([
    { type: 'html', html: '<script>alert(1)</script>' },
    { type: 'iframe', src: 'https://evil.example' },
    { type: 'paragraph', text: '<img src=x onerror=alert(1)>' },
  ]);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]!.type, 'paragraph'); // kept as plain text; rendered escaped by React
  assert.equal(issues.length, 2);
});

test('unsafe URLs are rejected; https and same-origin paths allowed', () => {
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('data:text/html,hi'), null);
  assert.equal(safeUrl('http://example.org'), null);
  assert.equal(safeUrl('//evil.example/x'), null);
  assert.equal(safeUrl('/ask'), '/ask');
  assert.equal(safeUrl('https://ktr.org.il/post/_1110'), 'https://ktr.org.il/post/_1110');
  const { blocks, issues } = sanitizeBlocks([
    { type: 'cta', label: 'x', href: 'javascript:alert(1)' },
    { type: 'image', src: 'https://x.org/a.svg', alt: 'a' },
    { type: 'quote', text: 'ציטוט', source: '' },
    { type: 'image', src: 'https://x.org/a.jpg', alt: '' },
  ]);
  assert.equal(blocks.length, 0);
  assert.equal(issues.length, 4);
});
