import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installLocalStorage, seed, sleep } from './helpers.ts';
import type { ContentItem } from '../src/shared/types.ts';

installLocalStorage();
const { createDemoRepository } = await import('../src/data/demo-repo.ts');
const load = async () => structuredClone(seed);

test('CRUD persists across reload; drafts stay private; publish needs review', async () => {
  localStorage.clear();
  const repo = await createDemoRepository(load);
  await repo.demoSignIn!('editor');
  const c = (await repo.admin.create('content', { title: 'שיעור בדיקה ייחודי', type: 'audio' } as Partial<ContentItem>)) as ContentItem;
  assert.equal(c.status, 'draft');
  assert.equal((await repo.listContent({ q: 'שיעור בדיקה ייחודי' })).total, 0, 'draft not public');
  await repo.admin.update('content', c.id, { summary: 'תקציר' } as Partial<ContentItem>, 1);
  await assert.rejects(repo.admin.transition('content', c.id, 'published', 2), /אינו מותר/);
  await repo.admin.transition('content', c.id, 'in_review', 2);
  await sleep(250); // debounced persistence

  const reloaded = await createDemoRepository(load);
  await reloaded.demoSignIn!('reviewer');
  const again = (await reloaded.admin.get('content', c.id)) as ContentItem;
  assert.equal(again.summary, 'תקציר', 'persisted after reload');
  assert.equal(again.version, 3);
  await reloaded.admin.transition('content', c.id, 'approved', 3);
  await reloaded.admin.transition('content', c.id, 'published', 4);
  assert.equal((await reloaded.listContent({ q: 'שיעור בדיקה ייחודי' })).total, 1, 'now public');
  assert.equal((await reloaded.admin.revisions('content', c.id)).length, 4);
});

test('concurrent edits: stale version is rejected', async () => {
  localStorage.clear();
  const repo = await createDemoRepository(load);
  await repo.demoSignIn!('editor');
  const c = (await repo.admin.create('content', { title: 'עריכה מקבילה', type: 'video' } as Partial<ContentItem>)) as ContentItem;
  await repo.admin.update('content', c.id, { title: 'עורך א' } as Partial<ContentItem>, 1);
  await assert.rejects(repo.admin.update('content', c.id, { title: 'עורך ב' } as Partial<ContentItem>, 1), { name: 'VersionConflictError' });
});

test('soft delete, restore, permanent delete (admin only, after trash)', async () => {
  localStorage.clear();
  const repo = await createDemoRepository(load);
  await repo.demoSignIn!('editor');
  const c = (await repo.admin.create('content', { title: 'למחיקה', type: 'video' } as Partial<ContentItem>)) as ContentItem;
  await assert.rejects(repo.admin.destroy('content', c.id), /למנהלים/);
  await repo.demoSignIn!('admin');
  await assert.rejects(repo.admin.destroy('content', c.id), /סל המחזור/);
  await repo.admin.softDelete('content', c.id, 1);
  assert.equal((await repo.admin.list('content', { view: 'trash' })).items.some((x) => x.id === c.id), true);
  await repo.admin.restore('content', c.id, 2);
  await repo.admin.softDelete('content', c.id, 3);
  await repo.admin.destroy('content', c.id);
  assert.equal(await repo.admin.get('content', c.id), null);
});

test('questions: anonymous submit, token tracking, rabbi-only approval, consent-gated publish', async () => {
  localStorage.clear();
  const repo = await createDemoRepository(load);
  const { trackingCode, token } = await repo.submitQuestion({
    questionText: 'האם מותר לומר סליחות ביחיד?', topicId: null, isAnonymous: true, askerName: null, contactEmail: null,
    publishConsent: false, website: '', startedAt: Date.now() - 10_000,
  });
  assert.equal(await repo.trackQuestion(trackingCode, 'x'.repeat(43)), null, 'wrong token');
  assert.equal((await repo.trackQuestion(trackingCode, token))!.status, 'submitted');
  assert.equal(JSON.stringify(localStorage).includes(token), false, 'token never stored');

  await assert.rejects(repo.admin.listQuestions({}), /כניסה|צופה|הרשאה/);
  await repo.demoSignIn!('editor');
  let q = (await repo.admin.listQuestions({})).items[0]!;
  q = await repo.admin.transitionQuestion(q.id, 'triaged', q.version);
  q = await repo.admin.transitionQuestion(q.id, 'assigned', q.version);
  q = await repo.admin.updateQuestion(q.id, { answerText: 'מותר, בלי י"ג מידות.' }, q.version);
  q = await repo.admin.transitionQuestion(q.id, 'answered', q.version);
  await assert.rejects(repo.admin.transitionQuestion(q.id, 'approved', q.version), /רק הרב/);
  assert.equal((await repo.trackQuestion(trackingCode, token))!.answerText, null, 'not delivered before approval');
  await repo.demoSignIn!('rabbi');
  q = await repo.admin.transitionQuestion(q.id, 'approved', q.version);
  await assert.rejects(repo.admin.publishQuestion(q.id, q.version, { questionText: 'x', answerBlocks: [], topicId: null, attribution: 'x' }), /הסכים/);
  q = await repo.admin.transitionQuestion(q.id, 'private_delivered', q.version);
  assert.equal((await repo.trackQuestion(trackingCode, token))!.answerText, 'מותר, בלי י"ג מידות.');
  assert.equal((await repo.listPublicQuestions()).length, 0, 'private question never public');
});

test('question form anti-abuse: honeypot and too-fast submissions', async () => {
  localStorage.clear();
  const repo = await createDemoRepository(load);
  const base = { questionText: 'שאלה ארוכה מספיק לבדיקה', topicId: null, isAnonymous: true, askerName: null, contactEmail: null, publishConsent: false };
  await assert.rejects(repo.submitQuestion({ ...base, website: 'spam', startedAt: Date.now() - 10_000 }));
  await assert.rejects(repo.submitQuestion({ ...base, website: '', startedAt: Date.now() }), /מהר/);
});

test('roles: editor cannot manage users or modules; admin cannot grant owner', async () => {
  localStorage.clear();
  const repo = await createDemoRepository(load);
  await repo.demoSignIn!('editor');
  await assert.rejects(repo.admin.listUsers());
  await assert.rejects(repo.admin.setModule('books', false, {}));
  await repo.demoSignIn!('admin');
  const users = await repo.admin.listUsers();
  await assert.rejects(repo.admin.setRole(users.find((u) => u.roles.includes('viewer'))!.userId, 'owner', true), /בעלים/);
});
