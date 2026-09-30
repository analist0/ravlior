// Runtime configuration from Vite env. Only PUBLIC values may appear here.
const env = import.meta.env;

export const SUPABASE_URL: string = (env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
export const SUPABASE_PUBLISHABLE_KEY: string = (env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() ?? '';
export const SITE_URL: string = ((env.VITE_SITE_URL as string | undefined) ?? '').replace(/\/$/, '');
export const API_BASE: string = ((env.VITE_API_BASE as string | undefined) ?? '').replace(/\/$/, '');

// Guard: a service-role/secret key must never reach the browser bundle.
if (/^sb_secret_/.test(SUPABASE_PUBLISHABLE_KEY) || /service_role/.test(atobSafe(SUPABASE_PUBLISHABLE_KEY.split('.')[1] ?? ''))) {
  throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY looks like a secret/service-role key. Use the publishable (anon) key only.');
}

/** Demo mode = no Supabase configured. Always shown to the user; never presented as connected. */
export const IS_DEMO = !SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY;

function atobSafe(s: string): string {
  try {
    return atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    return '';
  }
}
