// The question/probe/user endpoints talk to this interface. Tests pass an in-memory stand-in.
// The real implementation is server/lib/db-client.ts.

export class UpstreamError extends Error {
  status: number;
  constructor(status: number, msg: string) { super(msg); this.status = status; this.name = 'UpstreamError'; }
}

export interface DataClient {
  insertQuestion: (row: Record<string, unknown>) => Promise<unknown>;
  rateLimit: (bucket: string, windowSeconds: number, max: number) => Promise<boolean>;
  questionByCode: (code: string) => Promise<{ token_hash: string; notify_token_hash: string | null; answer_audio_path: string | null; status: string; approved_by: string | null }[]>;
  signPrivate: (bucket: string, path: string, expiresIn: number) => Promise<{ url: string }>;
  userFromToken: (token: string) => Promise<{ id: string; email?: string } | null>;
  rolesOf: (userId: string) => Promise<{ role: string }[]>;
  listUsers: () => Promise<{ id: string; email: string | null; display_name: string | null }[]>;
  allRoles: () => Promise<{ user_id: string; role: string }[]>;
  invite: (email: string, invitedBy: string) => Promise<{ token: string; expiresAt: string }>;
  followUp: (code: string, token: string, questionText: string) => Promise<{ trackingCode: string; token: string }>;
  attachVoice: (code: string, token: string, bytes: Uint8Array, mime: string) => Promise<void>;
  /** Owner insert into update_signups. `exists` when the same channel+contact is already stored. */
  insertSignup: (row: { channel: 'email' | 'whatsapp'; contact: string }) => Promise<'created' | 'exists'>;
}
