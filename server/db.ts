// Server-only Postgres access. Neon hosts use the serverless websocket driver;
// localhost uses node-postgres so the same code can be verified on a throwaway database.
// Every request runs in one transaction. Anonymous and signed-in work sets the role
// so RLS applies. The table owner is used only for login, invites, and question intake.
import { neonConfig, Pool as NeonPool } from '@neondatabase/serverless';
import pg from 'pg';
import ws from 'ws';

export type Row = Record<string, unknown>;
export type Sql = (text: string, params?: unknown[]) => Promise<Row[]>;

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

interface Querier {
  query(text: string, params?: unknown[]): Promise<{ rows: Row[]; rowCount: number | null }>;
  release(): void;
}

let pool: { connect: () => Promise<Querier> } | null = null;

function hostOf(url: string): string {
  return new URL(url).hostname;
}

export function databaseUrl(): string {
  return process.env.DATABASE_URL ?? '';
}

export function getPool(): { connect: () => Promise<Querier> } {
  if (pool) return pool;
  const url = databaseUrl();
  if (!url) throw new ApiError(503, 'השרת אינו מחובר למסד הנתונים.');
  const host = hostOf(url);
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) {
    const local = new pg.Pool({ connectionString: url, max: 4 });
    pool = local;
    return local;
  }
  neonConfig.webSocketConstructor = ws;
  const neon = new NeonPool({ connectionString: url, max: 4 });
  pool = neon;
  return neon;
}

function hebrew(message: string): string {
  if (/version conflict/i.test(message)) return 'הרשומה שונתה בידי משתמש אחר מאז שנטענה. רעננו כדי לראות את הגרסה העדכנית.';
  if (/consent/i.test(message)) return 'אי אפשר לפרסם בלי הסכמת השואל.';
  if (/approved_by_rabbi/i.test(message)) return 'סימון „אושר על ידי הרב” מותר לרב, או לשאלה שהרב כבר אישר והשואל הסכים לפרסם.';
  if (/transition/i.test(message)) return 'המעבר בין המצבים אינו מותר לתפקיד הזה.';
  if (/new rows start/i.test(message)) return 'רשומה חדשה נפתחת כטיוטה או בבדיקה.';
  if (/only an owner/i.test(message)) return 'רק בעלים יכול להעניק או לבטל תפקיד בעלים או מנהל.';
  if (/own owner role/i.test(message)) return 'בעלים לא יכול להסיר מעצמו את תפקיד הבעלים.';
  if (/not allowed/i.test(message)) return 'אין הרשאה לפעולה הזו.';
  if (/staff only/i.test(message)) return 'הפעולה שמורה לצוות.';
  if (/answer is locked/i.test(message)) return 'התשובה נעולה לאחר שנמסרה. אי אפשר לשנות אותה בלי להסיר את הפרסום.';
  if (/audit reason required/i.test(message)) return 'נדרשת סיבה ליומן עבור המעבר או הסרת הפרסום.';
  if (/duplicate key|unique/i.test(message)) return 'רשומה עם אותו מזהה או כתובת כבר קיימת.';
  return 'השמירה נדחתה.';
}

export function mapDbError(e: unknown): unknown {
  if (e instanceof ApiError) return e;
  const code = (e as { code?: string }).code ?? '';
  const message = (e as { message?: string }).message ?? '';
  if (code === '40001' || /version conflict/i.test(message)) return new ApiError(409, hebrew(message), '40001');
  if (code === '42501' || /row-level security|permission denied/i.test(message)) return new ApiError(403, hebrew(message), '42501');
  if (code === '23505') return new ApiError(409, 'רשומה עם אותו מזהה או כתובת כבר קיימת.', '23505');
  if (code === '23514' || code === '23502') return new ApiError(422, hebrew(message) === 'השמירה נדחתה.' ? 'הנתונים אינם עומדים בכללי השמירה.' : hebrew(message), code);
  if (/transition|consent|approved_by_rabbi|new rows start|only an owner|owner role|not allowed|staff only|answer is locked|audit reason required/i.test(message)) {
    return new ApiError(403, hebrew(message), code || '42501');
  }
  return e;
}

type Mode = { kind: 'owner' } | { kind: 'service' } | { kind: 'actor'; userId: string | null };

async function tx<T>(mode: Mode, fn: (sql: Sql) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    if (mode.kind === 'service') {
      await client.query(`select set_config('app.actor', 'service', true)`);
    } else if (mode.kind === 'actor') {
      await client.query(`select set_config('app.user_id', $1, true)`, [mode.userId ?? '']);
      await client.query(`select set_config('app.actor', 'user', true)`);
      await client.query(mode.userId ? 'set local role app_api' : 'set local role app_anon');
    }
    const sql: Sql = async (text, params) => (await client.query(text, params)).rows;
    const out = await fn(sql);
    await client.query('commit');
    return out;
  } catch (e) {
    try { await client.query('rollback'); } catch { /* connection already failed */ }
    throw mapDbError(e);
  } finally {
    client.release();
  }
}

/** Table owner: bypasses RLS. Use only for login, sessions, invites, and private intake. */
export function asOwner<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  return tx({ kind: 'owner' }, fn);
}
/** Owner plus app.actor=service, so workflow triggers allow seed-style writes (invites, first roles). */
export function asService<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  return tx({ kind: 'service' }, fn);
}
/** Anonymous (null) or signed-in user. RLS policies apply. */
export function withActor<T>(userId: string | null, fn: (sql: Sql) => Promise<T>): Promise<T> {
  return tx({ kind: 'actor', userId }, fn);
}
