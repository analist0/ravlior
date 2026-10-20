// Newsletter / WhatsApp signup validation. Nothing is sent — the server only stores a row.
import { MIN_FILL_MS } from './questions.ts';

export type UpdateChannel = 'email' | 'whatsapp';

export interface UpdateInput {
  channel: UpdateChannel;
  contact: string;
  consent: boolean;
  website: string;
  startedAt: number;
}

export interface UpdateValue {
  channel: UpdateChannel;
  contact: string;
}

export type FieldErrors = Record<string, string>;

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,80}\.[^\s@]{2,24}$/;

/** Israeli mobile, stored as 05XXXXXXXX. Accepts 05…, 9725… and +972-5…. */
export function normalizeMobile(raw: string): string | null {
  let d = raw.trim().replace(/[\s()-]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (d.startsWith('972')) d = `0${d.slice(3)}`;
  if (!/^05\d{8}$/.test(d)) return null;
  return d;
}

export function normalizeEmail(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (s.length > 120 || !EMAIL.test(s)) return null;
  return s;
}

export function validateUpdate(
  input: unknown,
  now = Date.now(),
): { ok: true; value: UpdateValue } | { ok: false; errors: FieldErrors; bot?: boolean } {
  const o = (input ?? {}) as Partial<UpdateInput>;
  if (typeof o.website === 'string' && o.website.trim()) return { ok: false, errors: { form: 'לא ניתן לשלוח את הטופס כעת.' }, bot: true };
  const startedAt = typeof o.startedAt === 'number' ? o.startedAt : 0;
  if (!startedAt || now - startedAt < MIN_FILL_MS) return { ok: false, errors: { form: 'הטופס נשלח מהר מדי. נסו שוב בעוד רגע.' }, bot: true };
  if (now - startedAt > 24 * 3600_000) return { ok: false, errors: { form: 'הטופס פתוח זמן רב מדי. רעננו את הדף ושלחו שוב.' } };
  if (o.consent !== true) return { ok: false, errors: { consent: 'נדרשת הסכמה לשמירת הפרטים.' } };
  const channel = o.channel;
  if (channel !== 'email' && channel !== 'whatsapp') return { ok: false, errors: { channel: 'בחרו דוא״ל או וואטסאפ.' } };
  const contact = channel === 'email' ? normalizeEmail(String(o.contact ?? '')) : normalizeMobile(String(o.contact ?? ''));
  if (!contact) {
    return {
      ok: false,
      errors: {
        contact: channel === 'email' ? 'כתובת הדוא״ל אינה תקינה.' : 'נדרש מספר נייד ישראלי (05…).',
      },
    };
  }
  return { ok: true, value: { channel, contact } };
}
