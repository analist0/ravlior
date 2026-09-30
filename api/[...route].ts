// Vercel Function entry (Node runtime, Web Request/Response). Not deployed yet — see README → Deploy.
// Large uploads never pass through here: the browser uploads directly to Supabase Storage.
import { handle } from '../server/handlers.ts';

const ip = (req: Request) => req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0';

export async function GET(req: Request): Promise<Response> {
  return handle(req, ip(req));
}
export async function POST(req: Request): Promise<Response> {
  return handle(req, ip(req));
}
