// Vercel Function entry (Node runtime, Web Request/Response). Not deployed yet — see README → Deploy.
// Media uploads arrive as small chunks and are stored in Postgres. The browser never holds DATABASE_URL.
import { handle } from '../server/handlers.ts';

const ip = (req: Request) => req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0';

export async function GET(req: Request): Promise<Response> {
  return handle(req, ip(req));
}
export async function POST(req: Request): Promise<Response> {
  return handle(req, ip(req));
}
