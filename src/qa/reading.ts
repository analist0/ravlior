import { sanitizeBlocks } from '../shared/blocks.ts';
import type { Block, QuestionStatus } from '../shared/types.ts';

const CHARS_PER_MINUTE = 900;

/** Reading time from Hebrew letters. Whitespace does not count. Minimum one minute. */
export function readingMinutes(text: string): number {
  const letters = text.replace(/\s+/g, '').length;
  return Math.max(1, Math.ceil(letters / CHARS_PER_MINUTE));
}

export function readingLabel(text: string): string {
  const n = readingMinutes(text);
  return n === 1 ? 'זמן קריאה: כדקה' : `זמן קריאה: כ־${n} דקות`;
}

export interface TocItem { id: string; text: string; level: 2 | 3 }

/** Headings only, after the same sanitizer the renderer uses. Ids match `qa-${index}`. */
export function tocFromBlocks(blocks: Block[]): TocItem[] {
  const { blocks: safe } = sanitizeBlocks(blocks);
  return safe.flatMap((b, i) => (b.type === 'heading' ? [{ id: `qa-${i}`, text: b.text, level: b.level }] : []));
}

export function sourceLines(sources: string | null | undefined): string[] {
  if (!sources) return [];
  return sources.split(/\n+/).map((s) => s.trim()).filter(Boolean);
}

export type PublicStage = 'received' | 'review' | 'answered' | 'approved' | 'delivered';

export const PUBLIC_STAGES: PublicStage[] = ['received', 'review', 'answered', 'approved', 'delivered'];

export const PUBLIC_STAGE_LABEL: Record<PublicStage, string> = {
  received: 'התקבלה',
  review: 'בבדיקה',
  answered: 'נענתה',
  approved: 'אושרה בידי הרב',
  delivered: 'נמסרה',
};

export function publicStage(status: QuestionStatus | string): PublicStage {
  if (status === 'submitted') return 'received';
  if (status === 'triaged' || status === 'assigned') return 'review';
  if (status === 'answered') return 'answered';
  if (status === 'approved') return 'approved';
  return 'delivered';
}
