// Q&A rules shared by the server, the demo repository, and tests.
// The database triggers are the enforcement point. This module mirrors them.
import type { Block, PublicQuestion, QuestionStatus, QuestionSubmission } from './types.ts';

export const LOCKED_ANSWER_STATUSES: QuestionStatus[] = ['published', 'private_delivered', 'closed'];

export type AnswerKind = 'written' | 'oral' | 'both';

export function blocksFromAnswer(text: string): Block[] {
  return text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean).map((part) => ({ type: 'paragraph' as const, text: part }));
}

export function plainFromBlocks(blocks: Block[]): string {
  return blocks.map((b) => ('text' in b ? b.text.trim() : '')).filter(Boolean).join(' ');
}

export function sameWording(a: string, b: string): boolean {
  return a.trim() === b.trim();
}

/** What publish is allowed to put on the public site. The client does not choose the answer body. */
export function buildPublicFromApproved(q: Pick<QuestionSubmission, 'questionText' | 'answerText' | 'status' | 'approvedBy' | 'publishConsent'>, publicQuestionText: string): {
  blocks: Block[];
  approvedByRabbi: boolean;
  needsReapproval: boolean;
} {
  if (q.status !== 'approved' || !q.approvedBy) {
    throw new Error('פרסום אפשרי רק אחרי אישור הרב.');
  }
  if (!q.publishConsent) throw new Error('השואל לא הסכים לפרסום.');
  const answer = (q.answerText ?? '').trim();
  if (answer.length < 1) throw new Error('אין נוסח תשובה מאושר לפרסום.');
  const blocks = blocksFromAnswer(answer);
  const needsReapproval = !sameWording(publicQuestionText, q.questionText);
  return { blocks, approvedByRabbi: !needsReapproval, needsReapproval };
}

export interface AnswerEditResult {
  status: QuestionStatus;
  approvedBy: string | null;
  answerText: string | null;
  answerAudioPath: string | null;
}

/** Mirror of tg_question_update: lock after delivery, or return an approved answer for re-approval. */
export function applyAnswerEdit(q: Pick<QuestionSubmission, 'status' | 'approvedBy' | 'answerText' | 'answerAudioPath'>, patch: { answerText?: string | null; answerAudioPath?: string | null }): AnswerEditResult {
  const answerText = 'answerText' in patch ? patch.answerText ?? null : q.answerText;
  const answerAudioPath = 'answerAudioPath' in patch ? patch.answerAudioPath ?? null : q.answerAudioPath;
  const changed = answerText !== q.answerText || answerAudioPath !== q.answerAudioPath;
  if (changed && LOCKED_ANSWER_STATUSES.includes(q.status)) {
    throw new Error('התשובה נעולה לאחר שנמסרה. אי אפשר לשנות אותה בלי להסיר את הפרסום.');
  }
  if (changed && q.status === 'approved') {
    return { status: 'answered', approvedBy: null, answerText, answerAudioPath };
  }
  return { status: q.status, approvedBy: q.approvedBy, answerText, answerAudioPath };
}

export function applyPublicEdit(row: Pick<PublicQuestion, 'status' | 'approvedByRabbi' | 'questionText' | 'answerBlocks'>, patch: { questionText?: string; answerBlocks?: Block[] }, reason: string | undefined): { status: PublicQuestion['status']; approvedByRabbi: boolean; needsReason: boolean } {
  const questionText = patch.questionText ?? row.questionText;
  const answerBlocks = patch.answerBlocks ?? row.answerBlocks;
  const changed = questionText !== row.questionText || JSON.stringify(answerBlocks) !== JSON.stringify(row.answerBlocks);
  if (!changed) return { status: row.status, approvedByRabbi: row.approvedByRabbi, needsReason: false };
  const unpublish = row.status === 'published';
  if (unpublish && !reason?.trim()) {
    throw new Error('נדרשת סיבה ליומן כדי לשנות תשובה שפורסמה.');
  }
  return { status: unpublish ? 'draft' : row.status, approvedByRabbi: false, needsReason: unpublish };
}

export function etaLabel(days: number): string {
  if (!Number.isFinite(days) || days <= 0) return 'זמן המענה תלוי בעומס. אין בכך התחייבות למועד.';
  return `זמן מענה משוער: עד ${days} ימים. אין בכך התחייבות.`;
}

export function audioFileLabel(path: string | null | undefined): string {
  if (!path) return '';
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const kind = ext === 'mp3' || ext === 'm4a' || ext === 'aac' || ext === 'ogg' || ext === 'webm' ? 'שמע' : 'קובץ';
  return `תשובה קולית (${kind})`;
}

export const ANSWER_KIND_LABEL: Record<AnswerKind, string> = {
  written: 'כתובה',
  oral: 'בעל פה',
  both: 'כתובה ובעל פה',
};

export function isOverdue(dueAt: string | null | undefined, status: QuestionStatus, now = Date.now()): boolean {
  if (!dueAt) return false;
  if (['published', 'private_delivered', 'closed'].includes(status)) return false;
  const t = new Date(dueAt).getTime();
  return Number.isFinite(t) && t < now;
}
