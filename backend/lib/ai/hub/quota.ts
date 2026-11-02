/**
 * Daily message quota for the 101 AI hub.
 *  - free: AI_HUB_DAILY_FREE (default 50) · pro: AI_HUB_DAILY_PRO (default 300)
 *  - "Pro" = backend app.has_pro(): paid 101 Pro OR the launch promo (everyone Pro).
 *  - The day resets at midnight Africa/Kampala (EAT, UTC+3, no DST).
 * Store: Supabase RPC ai_hub_consume / ai_hub_usage_get (service role only, see
 * migration 20261102121000_ai_hub_quota.sql) with an in-memory fallback.
 *
 * CONTRACT (mirrors the planned backend /api/v1/ai/* + ai_usage):
 *   QuotaStatus = { used, limit, remaining, plan: "free"|"pro", promoActive, resetsAt }
 * If the backend's ai_usage RPCs land, only `supabaseQuotaStore` needs repointing.
 */
import { z } from "zod";

export type Plan = "free" | "pro";
export type QuotaStatus = { used: number; limit: number; remaining: number; plan: Plan; promoActive: boolean; resetsAt: string };

const int = (def: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : def))
    .pipe(z.number().int().min(0).max(100_000));

export function quotaLimits(env: Record<string, string | undefined> = process.env) {
  return { free: int(50).parse(env.AI_HUB_DAILY_FREE), pro: int(300).parse(env.AI_HUB_DAILY_PRO) };
}

const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Kampala calendar day (YYYY-MM-DD) and the instant it ends. */
export function kampalaDay(now = new Date()): { day: string; resetsAt: Date } {
  const local = new Date(now.getTime() + EAT_OFFSET_MS);
  const day = local.toISOString().slice(0, 10);
  const nextMidnightLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1);
  return { day, resetsAt: new Date(nextMidnightLocal - EAT_OFFSET_MS) };
}

export type QuotaStore = {
  consume: (userId: string, day: string, limit: number) => Promise<{ allowed: boolean; used: number }>;
  peek: (userId: string, day: string) => Promise<number>;
};

const mem = new Map<string, number>();
export const memoryQuotaStore: QuotaStore = {
  async consume(userId, day, limit) {
    const k = `${userId}:${day}`;
    const used = mem.get(k) ?? 0;
    if (used >= limit) return { allowed: false, used };
    mem.set(k, used + 1);
    return { allowed: true, used: used + 1 };
  },
  async peek(userId, day) {
    return mem.get(`${userId}:${day}`) ?? 0;
  },
};
export function resetMemoryQuota() {
  mem.clear();
}

type Rpc = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> };

export function supabaseQuotaStore(sb: Rpc): QuotaStore {
  return {
    async consume(userId, day, limit) {
      const { data, error } = await sb.rpc("ai_hub_consume", { p_user: userId, p_day: day, p_limit: limit });
      if (error) throw new Error(error.message);
      const row = (Array.isArray(data) ? data[0] : data) as { allowed: boolean; used: number };
      return { allowed: row.allowed, used: row.used };
    },
    async peek(userId, day) {
      const { data, error } = await sb.rpc("ai_hub_usage_get", { p_user: userId, p_day: day });
      if (error) throw new Error(error.message);
      return Number(data ?? 0);
    },
  };
}

export function withQuotaFallback(primary: QuotaStore | null): QuotaStore {
  if (!primary) return memoryQuotaStore;
  return {
    consume: (u, d, l) => primary.consume(u, d, l).catch((e: Error) => (console.warn("[ai-hub] quota store:", e.message), memoryQuotaStore.consume(u, d, l))),
    peek: (u, d) => primary.peek(u, d).catch((e: Error) => (console.warn("[ai-hub] quota store:", e.message), memoryQuotaStore.peek(u, d))),
  };
}

export function status(used: number, plan: Plan, promoActive: boolean, now = new Date(), env = process.env): QuotaStatus {
  const limit = quotaLimits(env)[plan];
  return { used, limit, remaining: Math.max(0, limit - used), plan, promoActive, resetsAt: kampalaDay(now).resetsAt.toISOString() };
}

/** "23 of 50 free messages today" */
export function quotaLabel(q: Pick<QuotaStatus, "used" | "limit" | "plan">): string {
  return `${q.used} of ${q.limit} ${q.plan === "pro" ? "Pro" : "free"} messages today`;
}
