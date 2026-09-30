// Upload policy — mirrors the bucket limits in supabase/migrations/*_storage_search.sql.
// Checked in the browser before upload; Storage enforces size/MIME again server-side.

export type BucketId = 'public-media' | 'public-books' | 'private-submissions' | 'private-drafts';

interface Kind { mime: string; ext: string[]; magic: (b: Uint8Array) => boolean }
const at = (b: Uint8Array, off: number, bytes: number[]) => bytes.every((x, i) => b[off + i] === x);
const ascii = (b: Uint8Array, off: number, s: string) => at(b, off, [...s].map((c) => c.charCodeAt(0)));

export const KINDS: Kind[] = [
  { mime: 'audio/mpeg', ext: ['mp3'], magic: (b) => ascii(b, 0, 'ID3') || (b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0) },
  { mime: 'audio/mp4', ext: ['m4a'], magic: (b) => ascii(b, 4, 'ftyp') },
  { mime: 'audio/aac', ext: ['aac'], magic: (b) => b[0] === 0xff && ((b[1] ?? 0) & 0xf6) === 0xf0 },
  { mime: 'audio/ogg', ext: ['ogg'], magic: (b) => ascii(b, 0, 'OggS') },
  { mime: 'video/mp4', ext: ['mp4'], magic: (b) => ascii(b, 4, 'ftyp') },
  { mime: 'video/webm', ext: ['webm'], magic: (b) => at(b, 0, [0x1a, 0x45, 0xdf, 0xa3]) },
  { mime: 'image/jpeg', ext: ['jpg', 'jpeg'], magic: (b) => at(b, 0, [0xff, 0xd8, 0xff]) },
  { mime: 'image/png', ext: ['png'], magic: (b) => at(b, 0, [0x89, 0x50, 0x4e, 0x47]) },
  { mime: 'image/webp', ext: ['webp'], magic: (b) => ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP') },
  { mime: 'application/pdf', ext: ['pdf'], magic: (b) => ascii(b, 0, '%PDF-') },
];

export const BUCKETS: Record<BucketId, { public: boolean; maxBytes: number; mimes: string[]; label: string }> = {
  'public-media': { public: true, maxBytes: 500 * 1024 * 1024, label: 'מדיה ציבורית מאושרת',
    mimes: ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'video/mp4', 'video/webm', 'image/jpeg', 'image/png', 'image/webp'] },
  'public-books': { public: true, maxBytes: 100 * 1024 * 1024, label: 'ספרים ועלונים', mimes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] },
  'private-submissions': { public: false, maxBytes: 50 * 1024 * 1024, label: 'תשובות קוליות פרטיות', mimes: ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg'] },
  'private-drafts': { public: false, maxBytes: 500 * 1024 * 1024, label: 'טיוטות פרטיות',
    mimes: ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'video/mp4', 'video/webm', 'image/jpeg', 'image/png', 'image/webp', 'application/pdf'] },
};

export function sanitizeFilename(name: string): string {
  const base = name.normalize('NFKD').split(/[\\/]/).pop() ?? 'file';
  const dot = base.lastIndexOf('.');
  const ext = dot > 0 ? base.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  let stem = (dot > 0 ? base.slice(0, dot) : base).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').replace(/\.{2,}/g, '.');
  if (!stem) stem = 'file';
  return `${stem.slice(0, 80)}${ext ? '.' + ext : ''}`;
}

export function storagePath(fileName: string, id: string, now = new Date()): string {
  return `${now.getUTCFullYear()}/${id}/${sanitizeFilename(fileName)}`;
}

/** Same rule as public.storage_path_ok() in SQL. */
export function storagePathOk(path: string): boolean {
  return /^[0-9]{4}\/[0-9a-f-]{36}\/[a-z0-9][a-z0-9._-]{0,100}\.(mp3|m4a|aac|ogg|mp4|webm|jpg|jpeg|png|webp|pdf)$/.test(path) && !path.includes('..');
}

export interface UploadCheck { ok: boolean; mime?: string; error?: string }

export function checkUpload(bucket: BucketId, file: { name: string; size: number; type: string }, head: Uint8Array): UploadCheck {
  const policy = BUCKETS[bucket];
  if (!policy) return { ok: false, error: 'דלי אחסון לא מוכר' };
  if (file.size <= 0) return { ok: false, error: 'הקובץ ריק' };
  if (file.size > policy.maxBytes) return { ok: false, error: `הקובץ גדול מהמותר (${Math.round(policy.maxBytes / 1048576)}MB)` };
  const ext = sanitizeFilename(file.name).split('.').pop() ?? '';
  const sniffed = KINDS.find((k) => k.magic(head));
  if (!sniffed) return { ok: false, error: 'סוג הקובץ לא זוהה מתוכנו. מותרים: MP3, M4A, AAC, OGG, MP4, WEBM, JPG, PNG, WEBP, PDF' };
  // ftyp is shared by mp4/m4a — accept either as long as the extension agrees with one of them.
  const candidates = KINDS.filter((k) => k.magic(head));
  const kind = candidates.find((k) => k.ext.includes(ext));
  if (!kind) return { ok: false, error: `סיומת הקובץ (.${ext}) אינה תואמת לתוכן (${sniffed.mime})` };
  if (!policy.mimes.includes(kind.mime)) return { ok: false, error: `סוג ${kind.mime} אינו מותר ביעד זה` };
  if (file.type && file.type !== kind.mime && !(file.type === 'audio/x-m4a' && kind.mime === 'audio/mp4')) {
    return { ok: false, error: `סוג הקובץ שהדפדפן דיווח (${file.type}) אינו תואם לתוכן` };
  }
  return { ok: true, mime: kind.mime };
}

/** A signed URL is only used while it is valid; never stored as a permanent link. */
export function signedUrlValid(expiresAtMs: number, nowMs = Date.now(), skewMs = 5000): boolean {
  return expiresAtMs - skewMs > nowMs;
}
