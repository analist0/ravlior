// Question submission helpers shared by the Node endpoint and the demo repository.
// Uses Web Crypto (globalThis.crypto) — available in modern browsers and Node ≥ 20.

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

export function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return b;
}

export function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 256-bit secret. Shown to the asker once; only its SHA-256 is stored. */
export function newToken(): string {
  return base64url(randomBytes(32));
}

export function newTrackingCode(): string {
  const b = randomBytes(8);
  const chars = [...b].map((x) => CODE_ALPHABET[x % CODE_ALPHABET.length]!);
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time comparison of two hex strings. */
export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface QuestionPayload {
  questionText: string;
  topicId: string | null;
  isAnonymous: boolean;
  askerName: string | null;
  contactEmail: string | null;
  publishConsent: boolean;
  website: string;
  startedAt: number;
}

export type FieldErrors = Partial<Record<'questionText' | 'askerName' | 'contactEmail' | 'form', string>>;

export const MIN_FILL_MS = 3000;

export function validateQuestion(raw: unknown, now = Date.now()): { ok: true; value: QuestionPayload } | { ok: false; errors: FieldErrors; bot?: boolean } {
  const o = (raw ?? {}) as Record<string, unknown>;
  const str = (k: string, max: number) => (typeof o[k] === 'string' ? (o[k] as string).trim().slice(0, max) : '');
  const errors: FieldErrors = {};
  const questionText = str('questionText', 4001);
  const askerName = str('askerName', 81);
  const contactEmail = str('contactEmail', 201);
  const website = typeof o.website === 'string' ? o.website : '';
  const startedAt = typeof o.startedAt === 'number' ? o.startedAt : 0;
  if (website) return { ok: false, errors: { form: 'לא ניתן לשלוח את הטופס.' }, bot: true };
  if (!startedAt || now - startedAt < MIN_FILL_MS) return { ok: false, errors: { form: 'הטופס נשלח מהר מדי. נסו שוב בעוד רגע.' }, bot: true };
  if (now - startedAt > 24 * 3600_000) return { ok: false, errors: { form: 'הטופס פתוח זמן רב מדי. רעננו את הדף ושלחו שוב.' } };
  if (questionText.length < 10) errors.questionText = 'נא לכתוב שאלה של 10 תווים לפחות.';
  if (questionText.length > 4000) errors.questionText = 'השאלה ארוכה מדי (עד 4000 תווים).';
  if (askerName.length > 80) errors.askerName = 'השם ארוך מדי.';
  if (contactEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail)) errors.contactEmail = 'כתובת הדוא״ל אינה תקינה.';
  if (Object.keys(errors).length) return { ok: false, errors };
  const isAnonymous = o.isAnonymous !== false;
  return {
    ok: true,
    value: {
      questionText,
      topicId: typeof o.topicId === 'string' && /^[0-9a-f-]{36}$/.test(o.topicId) ? o.topicId : null,
      isAnonymous,
      askerName: isAnonymous ? null : askerName || null,
      contactEmail: contactEmail || null,
      publishConsent: o.publishConsent === true,
      website: '',
      startedAt,
    },
  };
}

/** Build the private tracking link. The secret lives in the URL fragment (never sent to servers or logs). */
export function trackingLink(origin: string, code: string, token: string): string {
  return `${origin}/track#code=${encodeURIComponent(code)}&token=${encodeURIComponent(token)}`;
}

export function parseTrackingFragment(hash: string): { code: string; token: string } | null {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const code = p.get('code');
  const token = p.get('token');
  return code && token ? { code: code.toUpperCase(), token } : null;
}
