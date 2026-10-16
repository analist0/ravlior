import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installLocalStorage, seed } from './helpers.ts';
import { validateArchive } from '../src/shared/archives.ts';
import { filterStaff } from '../src/admin/staff-filter.ts';
import type { ContentItem, PublicQuestion, Topic } from '../src/shared/types.ts';

installLocalStorage();
const { createDemoRepository } = await import('../src/data/demo-repo.ts');
const load = async () => structuredClone(seed);

test('archive validation rejects a missing name and a non-https url', () => {
  const errors = validateArchive({ name: '  ', url: 'http://example.com/a', verification: 'archive' });
  assert.equal(errors.name, 'שדה חובה');
  assert.match(errors.url ?? '', /https/);
  assert.deepEqual(validateArchive({ name: 'ערוץ', url: 'https://example.com/a', verification: 'archive' }), {});
});

test('staff list filters by email and role', () => {
  const users = [
    { email: 'owner@demo.invalid', displayName: 'בעלים', roles: ['owner'] },
    { email: 'editor@demo.invalid', displayName: 'עורך', roles: ['editor'] },
  ];
  assert.equal(filterStaff(users, { q: 'EDITOR' }).length, 1);
  assert.deepEqual(filterStaff(users, { role: 'owner' }).map((u) => u.email), ['owner@demo.invalid']);
  assert.equal(filterStaff(users, { q: 'אין', role: 'editor' }).length, 0);
});

test('entity lists sort by Hebrew title and keep the status filter when empty', async () => {
  localStorage.clear();
  const repo = await createDemoRepository(load);
  await repo.demoSignIn!('editor');
  const byTitle = await repo.admin.list('topics', { sort: 'title', pageSize: 50 });
  const names = byTitle.items.map((t) => (t as Topic).name);
  const expected = [...names].sort((a, b) => a.localeCompare(b, 'he'));
  assert.deepEqual(names, expected);
  assert.ok(names.length > 1);
  const none = await repo.admin.list('content', { status: 'archived', q: 'אין-כזה-שיעור-בכלל', sort: 'status' });
  assert.equal(none.total, 0);
});

test('public questions can be created as drafts and stay off the public site', async () => {
  localStorage.clear();
  const repo = await createDemoRepository(load);
  await repo.demoSignIn!('editor');
  const created = await repo.admin.create('publicQuestions', {
    questionText: 'שאלה ציבורית לבדיקת ניהול', attribution: 'הרב ליאור כהן', answerBlocks: [],
  } as Partial<PublicQuestion>) as PublicQuestion;
  assert.equal(created.status, 'draft');
  assert.match(created.slug, /שאלה/);
  assert.equal((await repo.listPublicQuestions()).some((q) => q.id === created.id), false);
  const found = await repo.admin.list('publicQuestions', { q: 'בדיקת ניהול', sort: 'title' });
  assert.equal(found.items.some((q) => q.id === created.id), true);
});

test('source archives: create, search, update, reject duplicate, delete', async () => {
  localStorage.clear();
  const repo = await createDemoRepository(load);
  await repo.demoSignIn!('viewer');
  await assert.rejects(repo.admin.createArchive({ name: 'x', material: '', url: 'https://example.com/x', verification: 'archive', note: null }), /הרשאה|עורך|נדרש/);
  await repo.demoSignIn!('editor');
  await assert.rejects(
    repo.admin.createArchive({ name: '', material: '', url: 'notaurl', verification: 'archive', note: null }),
    /שדה חובה|https/,
  );
  const created = await repo.admin.createArchive({
    name: 'ארכיון בדיקה ייחודי', material: 'דף אחד', url: 'https://example.com/archive-test', verification: 'candidate', note: 'הערה',
  });
  const found = await repo.admin.listArchivesAdmin({ q: 'בדיקה ייחודי', sort: 'name' });
  assert.equal(found.total, 1);
  assert.equal(found.items[0]?.verification, 'candidate');
  assert.equal((await repo.listArchives()).some((a) => a.id === created.id), true);
  await assert.rejects(
    repo.admin.createArchive({ name: 'כפול', material: '', url: 'https://example.com/archive-test', verification: 'archive', note: null }),
    /כבר קיים/,
  );
  const updated = await repo.admin.updateArchive(created.id, { name: 'ארכיון בדיקה אחרי עריכה' });
  assert.equal(updated.name, 'ארכיון בדיקה אחרי עריכה');
  assert.equal(updated.url, created.url);
  await repo.admin.deleteArchive(created.id);
  assert.equal((await repo.listArchives()).some((a) => a.id === created.id), false);
  await assert.rejects(repo.admin.deleteArchive(created.id), /לא נמצא/);
});

test('question inbox searches by text and sorts by tracking code', async () => {
  localStorage.clear();
  const repo = await createDemoRepository(load);
  const a = await repo.submitQuestion({
    questionText: 'שאלה ייחודית על נטילת ידיים בבוקר', topicId: null, isAnonymous: true, askerName: null, contactEmail: null,
    publishConsent: false, website: '', startedAt: Date.now() - 10_000,
  });
  await repo.submitQuestion({
    questionText: 'שאלה אחרת לגמרי על שבת', topicId: null, isAnonymous: true, askerName: null, contactEmail: null,
    publishConsent: false, website: '', startedAt: Date.now() - 10_000,
  });
  await repo.demoSignIn!('editor');
  const hit = await repo.admin.listQuestions({ q: 'נטילת ידיים' });
  assert.equal(hit.total, 1);
  assert.equal(hit.items[0]?.trackingCode, a.trackingCode);
  const sorted = await repo.admin.listQuestions({ sort: 'code' });
  const codes = sorted.items.map((q) => q.trackingCode);
  assert.deepEqual(codes, [...codes].sort((x, y) => x.localeCompare(y)));
});

test('media catalog lists a source and remove deletes only that source', async () => {
  localStorage.clear();
  const repo = await createDemoRepository(load);
  await repo.demoSignIn!('editor');
  const withSource = (await repo.admin.list('content', { pageSize: 50 })).items.find((c) => (c as ContentItem).sources.length > 0) as ContentItem;
  assert.ok(withSource, 'seed has a sourced item');
  const source = withSource.sources[0]!;
  const listed = await repo.admin.listMedia({ q: source.providerId ?? source.url, pageSize: 50 });
  assert.equal(listed.items.some((row) => row.id === source.id), true);
  await repo.admin.removeMedia(withSource.id, source.id);
  const again = await repo.admin.get('content', withSource.id) as ContentItem;
  assert.equal(again.sources.some((s) => s.id === source.id), false);
  assert.equal(again.title, withSource.title);
  const catalog = await repo.admin.listMedia({ provider: source.provider, pageSize: 200 });
  assert.equal(catalog.items.some((row) => row.id === source.id), false);
});

test('audit log can be filtered by entity name', async () => {
  localStorage.clear();
  const repo = await createDemoRepository(load);
  await repo.demoSignIn!('admin');
  await repo.admin.createArchive({ name: 'ליומן', material: '', url: 'https://example.com/audit-row', verification: 'historical', note: null });
  const rows = await repo.admin.audit(1, { q: 'source_archives' });
  assert.ok(rows.total >= 1);
  assert.ok(rows.items.every((a) => a.entity === 'source_archives'));
  assert.equal((await repo.admin.audit(1, { q: 'אין-פעולה-כזו' })).total, 0);
});
