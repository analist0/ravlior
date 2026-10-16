// Validation for source-archive rows. The table has no status or trash column,
// so delete is permanent and these checks are the only gate before a write.
import { safeUrl } from './blocks.ts';
import type { Verification } from './types.ts';

export const ARCHIVE_VERIFICATIONS = ['located', 'archive', 'candidate', 'historical', 'blocked'] as const;

export const ARCHIVE_VERIFICATION_LABEL: Record<Verification, string> = {
  located: 'אותר',
  archive: 'ארכיון',
  candidate: 'מועמד — טעון בדיקה',
  historical: 'היסטורי',
  blocked: 'חסום',
};

export interface ArchiveDraft {
  name?: unknown;
  material?: unknown;
  url?: unknown;
  verification?: unknown;
  note?: unknown;
}

/** Field errors in Hebrew. Empty object means the draft can be saved. */
export function validateArchive(data: ArchiveDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (typeof data.name !== 'string' || !data.name.trim()) errors.name = 'שדה חובה';
  else if (data.name.trim().length > 200) errors.name = 'השם ארוך מדי (עד 200 תווים)';
  if (typeof data.url !== 'string' || !data.url.trim()) errors.url = 'שדה חובה';
  else if (!safeUrl(data.url.trim()) || !data.url.trim().startsWith('https://')) errors.url = 'נדרש קישור https תקין';
  if (data.verification != null && data.verification !== '' && !ARCHIVE_VERIFICATIONS.includes(data.verification as Verification)) {
    errors.verification = 'מצב אימות לא מוכר';
  }
  if (data.material != null && typeof data.material !== 'string') errors.material = 'תיאור החומר אינו תקין';
  if (data.note != null && typeof data.note !== 'string') errors.note = 'ההערה אינה תקינה';
  return errors;
}
