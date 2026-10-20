// Runtime configuration from Vite env. Only PUBLIC values may appear here.
// The browser never receives DATABASE_URL or AUTH_SECRET.
const env = import.meta.env;

export const SITE_URL: string = ((env.VITE_SITE_URL as string | undefined) ?? '').replace(/\/$/, '');
export const API_BASE: string = ((env.VITE_API_BASE as string | undefined) ?? '').replace(/\/$/, '');
/** Public Turnstile site key. Empty disables the widget. The secret stays on the server. */
export const TURNSTILE_SITE_KEY: string = (env.VITE_TURNSTILE_SITE_KEY as string | undefined) ?? '';

for (const [key, value] of Object.entries(env)) {
  if (!key.startsWith('VITE_')) continue;
  const text = String(value ?? '');
  if (key === 'VITE_DATABASE_URL' || key === 'VITE_AUTH_SECRET' || /postgres(ql)?:\/\//i.test(text) || /sb_secret_|service_role/.test(text)) {
    throw new Error(`${key} must not carry a database URL or secret. Set VITE_DATA_MODE=api and keep credentials on the server.`);
  }
}

/** Demo mode unless the public flag says the site should call the API. */
export const IS_DEMO = (env.VITE_DATA_MODE as string | undefined) !== 'api';
