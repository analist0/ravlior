import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contentTransitionAllowed as ct, questionTransitionAllowed as qt, nextContentStatuses } from '../src/shared/workflow.ts';

test('content role matrix', () => {
  assert.ok(ct('draft', 'in_review', ['editor']));
  assert.ok(!ct('in_review', 'approved', ['editor']), 'editor cannot approve');
  assert.ok(!ct('approved', 'published', ['editor']), 'editor cannot publish');
  assert.ok(ct('in_review', 'approved', ['reviewer']));
  assert.ok(ct('approved', 'published', ['rabbi']));
  assert.ok(!ct('published', 'archived', ['reviewer']), 'only admins archive');
  assert.ok(ct('published', 'archived', ['admin']));
  assert.ok(!ct('draft', 'published', ['owner']), 'no skipping review, even for owner');
  assert.ok(!ct('draft', 'in_review', ['viewer']));
  assert.deepEqual(nextContentStatuses('draft', ['viewer']), []);
});

test('question workflow: only the rabbi approves; publishing needs consent', () => {
  assert.ok(qt('submitted', 'triaged', ['editor'], false));
  assert.ok(qt('assigned', 'answered', ['editor'], false));
  for (const r of ['owner', 'admin', 'editor', 'reviewer'] as const) assert.ok(!qt('answered', 'approved', [r], true), `${r} cannot approve`);
  assert.ok(qt('answered', 'approved', ['rabbi'], true));
  assert.ok(!qt('approved', 'published', ['rabbi'], false), 'no consent → no publish');
  assert.ok(qt('approved', 'published', ['rabbi'], true));
  assert.ok(qt('approved', 'private_delivered', ['admin'], false));
  assert.ok(!qt('submitted', 'published', ['owner'], true));
});
