// Server-only configuration. Never import this from src/ (browser code).
export interface ServerEnv {
  databaseUrl: string;
  authSecret: string;
  rateSalt: string;
  importAllowlist: string[];
  siteUrl: string;
  configured: boolean;
}
export function readEnv(env: Record<string, string | undefined> = process.env): ServerEnv {
  const databaseUrl = env.DATABASE_URL ?? '';
  const authSecret = env.AUTH_SECRET ?? '';
  return {
    databaseUrl,
    authSecret,
    rateSalt: env.RATE_LIMIT_SALT || 'dev-only-salt-change-me',
    importAllowlist: (env.IMPORT_URL_ALLOWLIST ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    siteUrl: (env.VITE_SITE_URL ?? env.SITE_URL ?? '').replace(/\/$/, ''),
    configured: databaseUrl.length > 0 && authSecret.length >= 16,
  };
}
