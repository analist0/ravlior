// In-memory sliding-window limiter (per process). The DB limiter (public.hit_rate_limit) is used
// in addition when Supabase is configured, so limits hold across serverless instances.
export class RateLimiter {
  private hits = new Map<string, number[]>();
  private readonly windowMs: number;
  private readonly max: number;
  constructor(windowMs: number, max: number) {
    this.windowMs = windowMs;
    this.max = max;
  }
  hit(key: string, now = Date.now()): boolean {
    const from = now - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > from);
    list.push(now);
    this.hits.set(key, list);
    if (this.hits.size > 10_000) for (const [k, v] of this.hits) if (!v.some((t) => t > from)) this.hits.delete(k);
    return list.length <= this.max;
  }
}
