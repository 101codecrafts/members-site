import { createHash } from "node:crypto";

/**
 * Fixed-window rate limiter.
 * - Production: Supabase RPC public.ai_rate_limit_hit (atomic upsert; service role only).
 * - Fallback: in-memory map (per server instance; fine for dev, best-effort on serverless).
 */

export type RateLimitResult = { allowed: boolean; remaining: number; resetAt: Date; limit: number };

export type RateLimitStore = (key: string, limit: number, windowSeconds: number) => Promise<RateLimitResult>;

const memory = new Map<string, { count: number; windowStart: number }>();

export function memoryStore(now: () => number = Date.now): RateLimitStore {
  return async (key, limit, windowSeconds) => {
    const t = now();
    const windowMs = windowSeconds * 1000;
    const windowStart = Math.floor(t / windowMs) * windowMs;
    const cur = memory.get(key);
    const entry = cur && cur.windowStart === windowStart ? cur : { count: 0, windowStart };
    entry.count += 1;
    memory.set(key, entry);
    if (memory.size > 10_000) {
      for (const [k, v] of memory) if (v.windowStart < windowStart) memory.delete(k);
    }
    return {
      allowed: entry.count <= limit,
      remaining: Math.max(0, limit - entry.count),
      resetAt: new Date(windowStart + windowMs),
      limit,
    };
  };
}

export function resetMemoryStore() {
  memory.clear();
}

/** Never store raw IPs: key anonymous visitors by a salted hash. */
export function anonKey(ip: string, salt = process.env.AI_RATE_LIMIT_SALT ?? "101-codecrafts"): string {
  return `anon:${createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32)}`;
}

export function userKey(userId: string): string {
  return `user:${userId}`;
}

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export function supabaseStore(client: RpcClient): RateLimitStore {
  return async (key, limit, windowSeconds) => {
    const { data, error } = await client.rpc("ai_rate_limit_hit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as { allowed: boolean; remaining: number; reset_at: string } | undefined;
    if (!row) throw new Error("ai_rate_limit_hit returned no row");
    return { allowed: row.allowed, remaining: row.remaining, resetAt: new Date(row.reset_at), limit };
  };
}

/** Try the primary store; if it errors, fall back to memory rather than failing open or closed silently. */
export function withFallback(primary: RateLimitStore | null, fallback: RateLimitStore = memoryStore()): RateLimitStore {
  if (!primary) return fallback;
  return async (key, limit, windowSeconds) => {
    try {
      return await primary(key, limit, windowSeconds);
    } catch (err) {
      console.warn("[ai] rate-limit store error, using memory:", (err as Error).message);
      return fallback(key, limit, windowSeconds);
    }
  };
}
