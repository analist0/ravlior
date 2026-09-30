// Local API server for development (Termux / any Node ≥ 22.18). No framework, no native deps.
// Run: node --env-file-if-exists=.env.local server/node-server.ts
import { createServer, type IncomingMessage } from 'node:http';
import { handle, defaultDeps } from './handlers.ts';

const PORT = Number(process.env.API_PORT ?? 8787);
const HOST = '127.0.0.1';
const deps = defaultDeps();

async function toRequest(req: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 64 * 1024) break; // bodies are small JSON; anything larger is rejected by the handler
    chunks.push(c as Buffer);
  }
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks);
  return new Request(`http://${HOST}:${PORT}${req.url ?? '/'}`, { method: req.method, headers, body });
}

createServer(async (req, res) => {
  const started = Date.now();
  const response = await handle(await toRequest(req), req.socket.remoteAddress ?? '0.0.0.0', deps);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
  // Path + status only: never query strings, bodies or headers.
  console.log(`${req.method} ${(req.url ?? '').split('?')[0]} ${response.status} ${Date.now() - started}ms`);
}).listen(PORT, HOST, () => {
  console.log(`API on http://${HOST}:${PORT}  (supabase: ${deps.env.configured ? 'configured' : 'NOT configured — question submission disabled'})`);
});
