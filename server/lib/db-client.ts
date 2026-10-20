// Privileged database calls for endpoints that must bypass visitor RLS:
// question intake, rate limits, token checks, and session lookup.
import { sha256Hex, newToken, newTrackingCode } from '../../src/shared/questions.ts';
import { checkUpload, storagePath } from '../../src/shared/upload-policy.ts';
import { asOwner, asService, ApiError } from '../db.ts';
import { signMedia } from '../media-sign.ts';
import { UpstreamError, type DataClient } from './data-client.ts';
import type { ServerEnv } from './env.ts';

export function dbClient(env: ServerEnv): DataClient {
  return {
    async insertQuestion(row) {
      try {
        await asOwner(async (sql) => {
          await sql(
            `insert into public.question_submissions
              (tracking_code, token_hash, is_anonymous, asker_name, contact_email, topic_id, question_text, publish_consent, client_fingerprint)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [row.tracking_code, row.token_hash, row.is_anonymous, row.asker_name, row.contact_email, row.topic_id, row.question_text, row.publish_consent, row.client_fingerprint],
          );
        });
        return null;
      } catch (e) {
        if (e instanceof ApiError && e.code === '23505') throw new UpstreamError(409, 'conflict');
        throw e;
      }
    },
    async rateLimit(bucket, windowSeconds, max) {
      const rows = await asOwner((sql) => sql(`select public.hit_rate_limit($1, $2, $3) as ok`, [bucket, windowSeconds, max]));
      return rows[0]?.ok === true;
    },
    async questionByCode(code) {
      return asOwner((sql) => sql(
        `select token_hash, notify_token_hash, answer_audio_path, status, approved_by from public.question_submissions where tracking_code = $1`,
        [code],
      )) as Promise<{ token_hash: string; notify_token_hash: string | null; answer_audio_path: string | null; status: string; approved_by: string | null }[]>;
    },
    async signPrivate(bucket, path, expiresIn) {
      const exp = Math.floor(Date.now() / 1000) + expiresIn;
      return { url: signMedia(env.authSecret, bucket, path, exp) };
    },
    async userFromToken(token) {
      const hash = await sha256Hex(token);
      const rows = await asOwner((sql) => sql(
        `select u.id, u.email from public.sessions s
         join public.app_users u on u.id = s.user_id
         where s.token_hash = $1 and s.expires_at > now() and u.disabled_at is null`,
        [hash],
      ));
      const row = rows[0];
      return row ? { id: String(row.id), email: String(row.email ?? '') } : null;
    },
    async rolesOf(userId) {
      const rows = await asOwner((sql) => sql(`select role from public.user_roles where user_id = $1`, [userId]));
      return rows.map((r) => ({ role: String(r.role) }));
    },
    async listUsers() {
      return asOwner((sql) => sql(
        `select id, email, display_name from public.app_users order by email`,
      )) as Promise<{ id: string; email: string | null; display_name: string | null }[]>;
    },
    async allRoles() {
      return asOwner((sql) => sql(`select user_id, role from public.user_roles`)) as Promise<{ user_id: string; role: string }[]>;
    },
    async insertContact(row) {
      await asOwner((sql) => sql(
        `insert into public.contact_messages (name, email, subject, body) values ($1, $2, $3, $4)`,
        [row.name, row.email, row.subject, row.body],
      ));
    },
    async invite(email, invitedBy) {
      const token = newToken();
      const tokenHash = await sha256Hex(token);
      const rows = await asService((sql) => sql(
        `insert into public.invites (email, role, token_hash, invited_by, expires_at)
         values (lower($1), 'viewer', $2, $3, now() + interval '7 days')
         returning expires_at`,
        [email, tokenHash, invitedBy],
      ));
      const exp = rows[0]?.expires_at;
      return { token, expiresAt: exp instanceof Date ? exp.toISOString() : String(exp ?? '') };
    },
    async followUp(code, token, questionText) {
      const given = await sha256Hex(token);
      const fresh = newToken();
      const freshHash = await sha256Hex(fresh);
      const text = questionText.trim();
      if (text.length < 10 || text.length > 4000) throw new ApiError(422, 'נא לכתוב שאלת המשך של 10 עד 4000 תווים.');
      let tracking = '';
      await asOwner(async (sql) => {
        const parent = await sql(
          `select id, status, approved_by, contact_email, topic_id, is_anonymous, asker_name
           from public.question_submissions
           where tracking_code = $1 and (token_hash = $2 or notify_token_hash = $2)`,
          [code.toUpperCase(), given],
        );
        const row = parent[0];
        if (!row?.approved_by || !['private_delivered', 'published', 'closed'].includes(String(row.status))) {
          throw new ApiError(404, 'לא נמצאה תשובה שאפשר להמשיך.');
        }
        for (let i = 0; i < 3; i++) {
          tracking = newTrackingCode();
          try {
            await sql(
              `insert into public.question_submissions
                (tracking_code, token_hash, is_anonymous, asker_name, contact_email, topic_id, question_text, publish_consent, parent_id)
               values ($1,$2,$3,$4,$5,$6,$7,false,$8)`,
              [tracking, freshHash, row.is_anonymous, row.asker_name, row.contact_email, row.topic_id, text, row.id],
            );
            return;
          } catch (e) {
            if (e instanceof ApiError && e.code === '23505') continue;
            throw e;
          }
        }
        throw new ApiError(500, 'לא ניתן היה ליצור מספר מעקב.');
      });
      return { trackingCode: tracking, token: fresh };
    },
    async attachVoice(code, token, bytes, mimeHint) {
      const given = await sha256Hex(token);
      const name = /webm/i.test(mimeHint) ? 'question.webm' : 'question.mp3';
      const check = checkUpload('private-submissions', { name, size: bytes.byteLength, type: '' }, bytes.slice(0, 16));
      if (!check.ok) throw new ApiError(422, check.error ?? 'סוג הקובץ לא מותר');
      const path = storagePath(name, crypto.randomUUID());
      await asOwner(async (sql) => {
        const rows = await sql(
          `select id, status from public.question_submissions
           where tracking_code = $1 and (token_hash = $2 or notify_token_hash = $2)`,
          [code.toUpperCase(), given],
        );
        const row = rows[0];
        if (!row || !['submitted', 'triaged', 'assigned'].includes(String(row.status))) {
          throw new ApiError(404, 'לא ניתן לצרף הקלטה לשאלה הזו.');
        }
        await sql(
          `insert into public.storage_objects (bucket_id, name, mime, bytes, size) values ('private-submissions', $1, $2, $3, $4)`,
          [path, check.mime, Buffer.from(bytes), bytes.byteLength],
        );
        await sql(`update public.question_submissions set voice_question_path = $1, version = version where id = $2`, [path, row.id]);
      });
    },
    async insertSignup(row) {
      try {
        await asOwner(async (sql) => {
          await sql(
            `insert into public.update_signups (channel, contact, consent) values ($1, $2, true)`,
            [row.channel, row.contact],
          );
        });
        return 'created';
      } catch (e) {
        if (e instanceof ApiError && e.code === '23505') return 'exists';
        throw e;
      }
    },
  };
}
