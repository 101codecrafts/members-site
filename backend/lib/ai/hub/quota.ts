/**
 * Daily quota for the 101 AI hub — backed by the backend's generic AI quota API.
 *
 *  - Metering: services/ai.ts reserveAi → provider call → commitAi (ai_usage rows,
 *    one per request, Africa/Kampala days). Limits live in site_settings `ai.quotas`
 *    (free / pro / minor) and plan comes from app.has_pro() — paid 101 Pro OR the
 *    launch promo (everyone Pro). Nothing about limits is configured here.
 *  - Display: GET /api/v1/ai/quota (public.my_ai_quota) → toQuotaStatus().
 *
 * The in-memory store is only for local dev / tests when Supabase isn't configured;
 * it mirrors the seeded `ai.quotas` request limits.
 */

export type Plan = "free" | "pro";
export type QuotaStatus = { used: number; limit: number; remaining: number; plan: Plan; promoActive: boolean; resetsAt: string };

/** Mirrors the seeded site_settings `ai.quotas` request limits (fallback store only). */
export const FALLBACK_LIMITS: Record<Plan, number> = { free: 20, pro: 200 };

const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Kampala calendar day (YYYY-MM-DD) and the instant it ends. */
export function kampalaDay(now = new Date()): { day: string; resetsAt: Date } {
  const local = new Date(now.getTime() + EAT_OFFSET_MS);
  const day = local.toISOString().slice(0, 10);
  const nextMidnightLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1);
  return { day, resetsAt: new Date(nextMidnightLocal - EAT_OFFSET_MS) };
}

/** Shape of public.my_ai_quota() (GET /api/v1/ai/quota → { data }). */
export type BackendQuota = { plan?: string; limit_requests?: number; used_requests?: number; limit_tokens?: number; used_tokens?: number; enabled?: boolean };
/** Shape of public.ai_reserve() (services/ai.ts Reservation + refusal fields). */
export type BackendReservation = {
  allowed: boolean;
  usage_id?: string;
  reason?: string;
  plan?: string;
  remaining_requests?: number;
  limit_requests?: number;
  used_requests?: number;
  resets_at?: string;
};

const asPlan = (p: unknown): Plan => (p === "pro" ? "pro" : "free");
const n = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v ?? d) || d);

/** Map the backend's my_ai_quota() JSON to the hub's QuotaStatus. */
export function toQuotaStatus(raw: BackendQuota | null | undefined, promoActive = false, now = new Date()): QuotaStatus {
  const limit = n(raw?.limit_requests);
  const used = n(raw?.used_requests);
  return { used, limit, remaining: Math.max(0, limit - used), plan: asPlan(raw?.plan), promoActive, resetsAt: kampalaDay(now).resetsAt.toISOString() };
}

/** "3 of 20 free messages today" */
export function quotaLabel(q: Pick<QuotaStatus, "used" | "limit" | "plan">): string {
  return `${q.used} of ${q.limit} ${q.plan === "pro" ? "Pro" : "free"} messages today`;
}

export type CommitStatus = "ok" | "error" | "blocked";
export type CommitDetails = { provider?: string; model?: string; input_tokens?: number; output_tokens?: number; latency_ms?: number };

/** Per-request, per-member quota handle used by /api/ai/chat. */
export type QuotaStore = {
  /** Reserve one request (before calling a provider). */
  reserve: (feature: string, estTokens: number) => Promise<{ allowed: boolean; usageId?: string; reason?: string; quota: QuotaStatus }>;
  /** Settle a reservation (after the stream ends). Never throws. */
  commit: (usageId: string, status: CommitStatus, details?: CommitDetails) => Promise<void>;
  /** Current usage without reserving. */
  peek: () => Promise<QuotaStatus>;
};

/** Backend API the store talks to (injected so it is unit-testable without Supabase). */
export type BackendQuotaApi = {
  reserve: (userId: string, feature: string, estTokens: number) => Promise<BackendReservation>;
  commit: (usageId: string, status: CommitStatus, details?: CommitDetails) => Promise<void>;
  myQuota: () => Promise<BackendQuota | null>;
};

export function backendQuotaStore(api: BackendQuotaApi, userId: string, promoActive: boolean): QuotaStore {
  const peek = async () => toQuotaStatus(await api.myQuota(), promoActive);
  return {
    peek,
    async reserve(feature, estTokens) {
      const r = await api.reserve(userId, feature, estTokens);
      if (!r.allowed) {
        const quota = r.reason === "quota"
          ? toQuotaStatus({ plan: r.plan, limit_requests: r.limit_requests, used_requests: r.used_requests }, promoActive)
          : await peek().catch(() => toQuotaStatus({ plan: r.plan }, promoActive));
        return { allowed: false, reason: r.reason ?? "unavailable", quota };
      }
      // my_ai_quota counts the reservation we just made.
      const quota = await peek().catch(() => toQuotaStatus({ plan: r.plan }, promoActive));
      return { allowed: true, usageId: r.usage_id, quota };
    },
    async commit(usageId, status, details) {
      await api.commit(usageId, status, details).catch((e: Error) => console.warn("[ai-hub] commitAi failed:", e.message));
    },
  };
}

/* ---------- in-memory store (local dev / tests only) ---------- */
const mem = new Map<string, number>();
export function resetMemoryQuota() {
  mem.clear();
}
export function memoryQuotaStore(userId: string, plan: Plan, promoActive: boolean, now = () => new Date()): QuotaStore {
  const key = () => `${userId}:${kampalaDay(now()).day}`;
  const limit = FALLBACK_LIMITS[plan];
  const q = (used: number) => toQuotaStatus({ plan, limit_requests: limit, used_requests: used }, promoActive, now());
  return {
    async peek() {
      return q(mem.get(key()) ?? 0);
    },
    async reserve() {
      const used = mem.get(key()) ?? 0;
      if (used >= limit) return { allowed: false, reason: "quota", quota: q(used) };
      mem.set(key(), used + 1);
      return { allowed: true, usageId: `mem-${used + 1}`, quota: q(used + 1) };
    },
    async commit() {},
  };
}
