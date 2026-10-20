// Privileged database calls for endpoints that must bypass visitor RLS:
// question intake, rate limits, token checks, and session lookup.
import { sha256Hex, newToken } from '../../src/shared/questions.ts';
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
        `select token_hash, answer_audio_path, status, approved_by from public.question_submissions where tracking_code = $1`,
        [code],
      )) as Promise<{ token_hash: string; answer_audio_path: string | null; status: string; approved_by: string | null }[]>;
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
  };
}
