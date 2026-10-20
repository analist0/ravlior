// Chunked uploads into public.storage_objects, and downloads (public buckets, or a short HMAC URL).
import { BUCKETS, checkUpload, storagePathOk, type BucketId } from '../src/shared/upload-policy.ts';
import { ApiError, asOwner, withActor } from './db.ts';
import { verifyMedia } from './media-sign.ts';

const PUBLIC = new Set(['public-media', 'public-books']);

function bucketOf(v: string): BucketId {
  if (v in BUCKETS) return v as BucketId;
  throw new ApiError(400, 'דלי אחסון לא מוכר');
}

export async function readObject(bucket: string, path: string, exp: string | null, sig: string | null, secret: string): Promise<Response> {
  if (path.includes('..') || path.includes('\\')) return new Response('לא נמצא', { status: 404 });
  const rows = await asOwner((sql) => sql(
    `select o.mime, o.bytes, b.public as is_public from public.storage_objects o
     join public.storage_buckets b on b.id = o.bucket_id
     where o.bucket_id = $1 and o.name = $2`,
    [bucket, path],
  ));
  const row = rows[0];
  if (!row?.bytes) return new Response('לא נמצא', { status: 404 });
  const isPublic = row.is_public === true && PUBLIC.has(bucket);
  if (!isPublic && !(exp && sig && verifyMedia(secret, bucket, path, exp, sig))) return new Response('לא נמצא', { status: 404 });
  const raw = row.bytes instanceof Uint8Array ? row.bytes : Buffer.from(String(row.bytes));
  const copy = new Uint8Array(raw.byteLength);
  copy.set(raw);
  const mime = typeof row.mime === 'string' ? row.mime : 'application/octet-stream';
  return new Response(copy.buffer, {
    headers: {
      'content-type': mime,
      'x-content-type-options': 'nosniff',
      'cache-control': isPublic ? 'public, max-age=3600' : 'private, no-store',
    },
  });
}

export async function uploadChunk(userId: string, headers: Headers, bytes: Uint8Array): Promise<{ done: boolean; received: number; size: number }> {
  const bucket = bucketOf(headers.get('x-bucket') ?? '');
  const path = headers.get('x-path') ?? '';
  const id = headers.get('x-upload-id') ?? '';
  const offset = Number(headers.get('x-offset') ?? '');
  const size = Number(headers.get('x-size') ?? '');
  if (!/^[0-9a-f-]{36}$/.test(id) || !storagePathOk(path) || !Number.isInteger(offset) || !Number.isInteger(size)) {
    throw new ApiError(400, 'פרטי ההעלאה אינם תקינים');
  }
  const policy = BUCKETS[bucket];
  if (size <= 0 || size > policy.maxBytes) throw new ApiError(413, `הקובץ גדול מהמותר (${Math.round(policy.maxBytes / 1048576)}MB)`);
  if (offset === 0) {
    const name = path.split('/').pop() ?? 'file';
    const check = checkUpload(bucket, { name, size, type: '' }, bytes.slice(0, 16));
    if (!check.ok) throw new ApiError(422, check.error ?? 'סוג הקובץ אינו מותר');
    headers.set('x-sniffed-mime', check.mime ?? '');
  }
  const mime = headers.get('x-sniffed-mime') || headers.get('x-mime') || 'application/octet-stream';
  if (!policy.mimes.includes(mime) && offset !== 0) {
    // Later chunks trust the mime stored with the upload row.
  }
  await withActor(userId, async (sql) => {
    const ok = await sql(
      `select public.storage_path_ok($2) and case
         when $1 = 'private-submissions' then public.has_role(array['owner','admin','rabbi']::public.app_role[])
         when $1 in ('public-media','public-books','private-drafts') then public.can_edit()
         else false end as ok`,
      [bucket, path],
    );
    if (ok[0]?.ok !== true) throw new ApiError(403, 'אין הרשאה להעלות ליעד הזה.', '42501');
  });
  const storedMime = await asOwner(async (sql) => {
    if (offset === 0) {
      await sql(`delete from public.storage_uploads where created_at < now() - interval '1 day'`);
      await sql(
        `insert into public.storage_uploads (id, user_id, bucket_id, name, mime, size, received, bytes)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, userId, bucket, path, mime, size, bytes.byteLength, Buffer.from(bytes)],
      );
      return mime;
    }
    const cur = await sql(`select received, mime from public.storage_uploads where id = $1 and user_id = $2 and bucket_id = $3 and name = $4`, [id, userId, bucket, path]);
    if (!cur[0] || Number(cur[0].received) !== offset) throw new ApiError(409, 'רצף ההעלאה לא תואם. התחילו מחדש.');
    await sql(`update public.storage_uploads set bytes = bytes || $2, received = received + $3 where id = $1`, [id, Buffer.from(bytes), bytes.byteLength]);
    return String(cur[0].mime);
  });
  const received = offset + bytes.byteLength;
  if (received > size) throw new ApiError(400, 'ההעלאה חרגה מגודל הקובץ');
  if (received === size) {
    const file = await asOwner((sql) => sql(`select bytes, mime, size from public.storage_uploads where id = $1 and user_id = $2`, [id, userId]));
    const row = file[0];
    if (!row) throw new ApiError(400, 'ההעלאה לא נמצאה');
    await withActor(userId, (sql) => sql(
      `insert into public.storage_objects (bucket_id, name, mime, bytes, size, created_by) values ($1, $2, $3, $4, $5, $6)`,
      [bucket, path, storedMime, row.bytes, size, userId],
    ));
    await asOwner((sql) => sql(`delete from public.storage_uploads where id = $1`, [id]));
    return { done: true, received, size };
  }
  return { done: false, received, size };
}
