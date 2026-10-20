import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installLocalStorage, seed } from './helpers.ts';
import { applyAnswerEdit, applyPublicEdit, buildPublicFromApproved } from '../src/shared/responsa.ts';
import { notifyAnswerReady, notifyStaff } from '../server/mailer.ts';
import type { PublicQuestion } from '../src/shared/types.ts';

installLocalStorage();
const { createDemoRepository } = await import('../src/data/demo-repo.ts');
const load = async () => structuredClone(seed);

const base = {
  questionText: 'האם מותר לבדוק את נעילת התשובה אחרי מסירה?',
  status: 'private_delivered' as const,
  approvedBy: 'rabbi',
  answerText: 'נוסח שנמסר',
  answerAudioPath: null,
};

test('delivered answers are locked; an approved edit returns for re-approval', () => {
  assert.throws(() => applyAnswerEdit(base, { answerText: 'נוסח אחר' }), /נעולה/);
  const back = applyAnswerEdit({ ...base, status: 'approved' }, { answerText: 'נוסח ששונה' });
  assert.equal(back.status, 'answered');
  assert.equal(back.approvedBy, null);
  assert.equal(back.answerText, 'נוסח ששונה');
});

test('publish uses the approved answer, and edited public wording is not approved', () => {
  const q = { questionText: 'שאלה פרטית מקורית', answerText: 'תשובת בדיקה', status: 'approved' as const, approvedBy: 'rabbi', publishConsent: true };
  const same = buildPublicFromApproved(q, 'שאלה פרטית מקורית');
  assert.equal(same.needsReapproval, false);
  assert.equal(same.approvedByRabbi, true);
  assert.equal(same.blocks[0]?.type === 'paragraph' && same.blocks[0].text, 'תשובת בדיקה');
  const edited = buildPublicFromApproved(q, 'ניסוח ציבורי שונה');
  assert.equal(edited.needsReapproval, true);
  assert.equal(edited.approvedByRabbi, false);
  assert.equal(edited.blocks[0]?.type === 'paragraph' && edited.blocks[0].text, 'תשובת בדיקה');
  assert.throws(() => buildPublicFromApproved({ ...q, publishConsent: false }, q.questionText), /הסכים/);
});

test('unpublishing a public answer requires an audit reason', () => {
  const row = { status: 'published' as const, approvedByRabbi: true, questionText: 'שאלה', answerBlocks: [{ type: 'paragraph' as const, text: 'תשובה' }] };
  assert.throws(() => applyPublicEdit(row, { questionText: 'שאלה אחרת' }, ''), /סיבה/);
  const next = applyPublicEdit(row, { questionText: 'שאלה אחרת' }, 'הסרת פרסום לעריכה');
  assert.equal(next.status, 'draft');
  assert.equal(next.approvedByRabbi, false);
});

test('demo: lock, server-side publish, re-approval, and a reasoned send-back', async () => {
  localStorage.clear();
  const repo = await createDemoRepository(load);
  await repo.demoSignIn!('editor');
  const created = await repo.submitQuestion({
    questionText: 'שאלה לבדיקת פרסום שרת', topicId: null, isAnonymous: true, askerName: null, contactEmail: null,
    publishConsent: true, website: '', startedAt: Date.now() - 10_000,
  });
  let q = (await repo.admin.listQuestions({})).items.find((x) => x.trackingCode === created.trackingCode)!;
  q = await repo.admin.transitionQuestion(q.id, 'triaged', q.version);
  q = await repo.admin.transitionQuestion(q.id, 'assigned', q.version);
  q = await repo.admin.updateQuestion(q.id, { answerText: 'תשובה מאושרת לבדיקה' }, q.version);
  q = await repo.admin.transitionQuestion(q.id, 'answered', q.version);
  await repo.demoSignIn!('rabbi');
  q = await repo.admin.transitionQuestion(q.id, 'approved', q.version);
  await assert.rejects(repo.admin.transitionQuestion(q.id, 'assigned', q.version), /סיבה/);
  q = await repo.admin.transitionQuestion(q.id, 'assigned', q.version, 'החזרה לטיפול');
  assert.equal(q.status, 'assigned');
  assert.equal(q.approvedBy, null);
  q = await repo.admin.transitionQuestion(q.id, 'answered', q.version);
  q = await repo.admin.transitionQuestion(q.id, 'approved', q.version);
  const held = await repo.admin.publishQuestion(q.id, q.version, {
    questionText: 'ניסוח ציבורי שונה', answerBlocks: [{ type: 'paragraph', text: 'לא זה הנוסח' }], topicId: null, attribution: 'הרב ליאור כהן',
  });
  assert.equal(held.published, false);
  assert.equal(held.needsReapproval, true);
  const pub = (await repo.admin.get('publicQuestions', held.id!)) as PublicQuestion;
  assert.equal(pub.approvedByRabbi, false);
  assert.equal(pub.status, 'in_review');
  assert.equal(pub.answerBlocks[0]?.type === 'paragraph' && pub.answerBlocks[0].text, 'תשובה מאושרת לבדיקה');
  q = (await repo.admin.getQuestion(q.id))!;
  assert.equal(q.status, 'approved');
  const live = await repo.admin.publishQuestion(q.id, q.version, {
    questionText: q.questionText, answerBlocks: [{ type: 'paragraph', text: 'בלוק מהלקוח' }], topicId: null, attribution: 'הרב ליאור כהן',
  });
  assert.equal(live.published, true);
  const shown = (await repo.admin.get('publicQuestions', live.id!)) as PublicQuestion;
  assert.equal(shown.answerBlocks[0]?.type === 'paragraph' && shown.answerBlocks[0].text, 'תשובה מאושרת לבדיקה');
  await assert.rejects(repo.admin.unpublishPublic(shown.id, shown.version, 'draft', ''), /סיבה/);
  await repo.admin.unpublishPublic(shown.id, shown.version, 'draft', 'הסרת פרסום לעריכה');
  const hidden = (await repo.admin.get('publicQuestions', shown.id)) as PublicQuestion;
  assert.equal(hidden.status, 'draft');
  assert.equal(hidden.approvedByRabbi, false);
  q = (await repo.admin.getQuestion(q.id))!;
  assert.equal(q.status, 'published');
  await assert.rejects(repo.admin.updateQuestion(q.id, { answerText: 'אחרי מסירה' }, q.version), /נעולה/);
});

test('mailer does not send when credentials are unset', async () => {
  const saved = {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    MAIL_FROM: process.env.MAIL_FROM,
    NOTIFY_EMAILS: process.env.NOTIFY_EMAILS,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
  };
  delete process.env.RESEND_API_KEY;
  delete process.env.MAIL_FROM;
  delete process.env.NOTIFY_EMAILS;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (() => { throw new Error('mail network'); }) as typeof fetch;
  try {
    await notifyAnswerReady('asker@example.com', 'ABCD-EFGH', 't'.repeat(40));
    await notifyStaff('שאלה חדשה', 'מספר מעקב: ABCD-EFGH');
  } finally {
    globalThis.fetch = realFetch;
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});
