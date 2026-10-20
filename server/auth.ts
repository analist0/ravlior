// Email + password sessions. The cookie holds the raw token; the database stores only its SHA-256.
import { sha256Hex, newToken } from '../src/shared/questions.ts';
import type { Role } from '../src/shared/types.ts';
import { ApiError, asOwner, asService } from './db.ts';

const WEEK = 14 * 24 * 60 * 60;

export function sessionCookie(token: string, secure: boolean): string {
  return [`or_session=${encodeURIComponent(token)}`, 'HttpOnly', 'Path=/', 'SameSite=Lax', `Max-Age=${WEEK}`, secure ? 'Secure' : ''].filter(Boolean).join('; ');
}
export function clearCookie(secure: boolean): string {
  return `or_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}
export function tokenFrom(req: Request): string | null {
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (bearer) return bearer;
  const m = (req.headers.get('cookie') ?? '').match(/(?:^|;\s*)or_session=([^;]+)/);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}
export function wantsSecure(req: Request, siteUrl: string): boolean {
  return req.headers.get('x-forwarded-proto') === 'https' || siteUrl.startsWith('https://');
}

async function rolesOf(userId: string): Promise<Role[]> {
  const rows = await asOwner((sql) => sql(`select role from public.user_roles where user_id = $1`, [userId]));
  return rows.map((r) => String(r.role) as Role);
}

async function startSession(userId: string, email: string): Promise<{ token: string; session: { userId: string; email: string; roles: Role[]; demo: false } }> {
  const token = newToken();
  const tokenHash = await sha256Hex(token);
  await asOwner((sql) => sql(
    `insert into public.sessions (user_id, token_hash, expires_at) values ($1, $2, now() + interval '14 days')`,
    [userId, tokenHash],
  ));
  return { token, session: { userId, email, roles: await rolesOf(userId), demo: false } };
}

export async function login(email: string, password: string) {
  const rows = await asOwner((sql) => sql(
    `select id, email from public.app_users
     where email = lower($1) and password_hash is not null and disabled_at is null
       and password_hash = extensions.crypt($2, password_hash)`,
    [email, password],
  ));
  const row = rows[0];
  if (!row) throw new ApiError(401, 'פרטי הכניסה שגויים.');
  return startSession(String(row.id), String(row.email));
}

export async function logout(token: string): Promise<void> {
  const tokenHash = await sha256Hex(token);
  await asOwner((sql) => sql(`delete from public.sessions where token_hash = $1`, [tokenHash]));
}

export async function acceptInvite(token: string, password: string, displayName: string) {
  if (password.length < 10) throw new ApiError(422, 'הסיסמה צריכה 10 תווים לפחות.');
  const tokenHash = await sha256Hex(token);
  const name = displayName.trim() || null;
  const created = await asService(async (sql) => {
    const inv = await sql(
      `select id, email, role from public.invites where token_hash = $1 and accepted_at is null and expires_at > now()`,
      [tokenHash],
    );
    const row = inv[0];
    if (!row) throw new ApiError(400, 'ההזמנה אינה תקפה או שפגה.');
    const users = await sql(
      `insert into public.app_users (email, password_hash, display_name)
       values ($1, extensions.crypt($2, extensions.gen_salt('bf')), $3) returning id, email`,
      [row.email, password, name],
    );
    const user = users[0];
    if (!user) throw new ApiError(409, 'כבר קיים חשבון לכתובת הזו.', '23505');
    await sql(`insert into public.profiles (id, display_name) values ($1, $2)`, [user.id, name]);
    await sql(`insert into public.user_roles (user_id, role) values ($1, $2::public.app_role)`, [user.id, row.role]);
    await sql(`update public.invites set accepted_at = now() where id = $1`, [row.id]);
    return user;
  });
  return startSession(String(created.id), String(created.email));
}
