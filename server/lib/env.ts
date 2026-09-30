// Server-only configuration. Never import this from src/ (browser code).
export interface ServerEnv {
  supabaseUrl: string;
  secretKey: string;
  rateSalt: string;
  importAllowlist: string[];
  configured: boolean;
}
export function readEnv(env: Record<string, string | undefined> = process.env): ServerEnv {
  const supabaseUrl = (env.SUPABASE_URL ?? '').replace(/\/$/, '');
  const secretKey = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  return {
    supabaseUrl,
    secretKey,
    rateSalt: env.RATE_LIMIT_SALT || 'dev-only-salt-change-me',
    importAllowlist: (env.IMPORT_URL_ALLOWLIST ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    configured: !!supabaseUrl && !!secretKey,
  };
}
