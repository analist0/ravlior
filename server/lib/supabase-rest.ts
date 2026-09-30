// Minimal Supabase REST/Auth/Storage calls with the SECRET key (server only).
import type { ServerEnv } from './env.ts';

export class UpstreamError extends Error {
  status: number;
  constructor(status: number, msg: string) { super(msg); this.status = status; this.name = 'UpstreamError'; }
}

export function adminClient(env: ServerEnv, fetchImpl: typeof fetch = fetch) {
  const h = (extra: Record<string, string> = {}) => ({ apikey: env.secretKey, authorization: `Bearer ${env.secretKey}`, 'content-type': 'application/json', ...extra });
  const call = async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
    const res = await fetchImpl(`${env.supabaseUrl}${path}`, { ...init, headers: { ...h(), ...(init.headers as Record<string, string> | undefined) } });
    const text = await res.text();
    if (!res.ok) throw new UpstreamError(res.status, text.slice(0, 300));
    return (text ? JSON.parse(text) : null) as T;
  };
  return {
    insertQuestion: (row: Record<string, unknown>) =>
      call('/rest/v1/question_submissions', { method: 'POST', body: JSON.stringify(row), headers: { prefer: 'return=minimal' } }),
    rateLimit: (bucket: string, windowSeconds: number, max: number) =>
      call<boolean>('/rest/v1/rpc/hit_rate_limit', { method: 'POST', body: JSON.stringify({ p_bucket: bucket, p_window_seconds: windowSeconds, p_max: max }) }),
    questionByCode: (code: string) =>
      call<{ token_hash: string; answer_audio_path: string | null; status: string; approved_by: string | null }[]>(
        `/rest/v1/question_submissions?tracking_code=eq.${encodeURIComponent(code)}&select=token_hash,answer_audio_path,status,approved_by`),
    signPrivate: (bucket: string, path: string, expiresIn: number) =>
      call<{ signedURL: string }>(`/storage/v1/object/sign/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`, { method: 'POST', body: JSON.stringify({ expiresIn }) }),
    userFromJwt: async (jwt: string) => {
      const res = await fetchImpl(`${env.supabaseUrl}/auth/v1/user`, { headers: { apikey: env.secretKey, authorization: `Bearer ${jwt}` } });
      if (!res.ok) return null;
      return (await res.json()) as { id: string; email?: string };
    },
    rolesOf: (userId: string) => call<{ role: string }[]>(`/rest/v1/user_roles?user_id=eq.${encodeURIComponent(userId)}&select=role`),
    listUsers: () => call<{ users: { id: string; email?: string }[] }>('/auth/v1/admin/users?per_page=200'),
    allRoles: () => call<{ user_id: string; role: string }[]>('/rest/v1/user_roles?select=user_id,role'),
    invite: (email: string) => call('/auth/v1/invite', { method: 'POST', body: JSON.stringify({ email }) }),
  };
}
export type AdminClient = ReturnType<typeof adminClient>;
