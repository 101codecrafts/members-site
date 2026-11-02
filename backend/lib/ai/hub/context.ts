import "server-only";
import { commitAi, reserveAi } from "@/services/ai";
import { currentUser } from "../http";
import { serviceConfigured, userClient } from "../supabase";
import { loadHubModels } from "./catalog";
import { loadMember, type Member } from "./member";
import { backendQuotaStore, memoryQuotaStore, type BackendQuota, type QuotaStore } from "./quota";

/**
 * Shared per-request context for /api/ai/* (auth → member → quota store).
 * Quota is the backend's generic AI quota API (services/ai.ts reserveAi/commitAi +
 * my_ai_quota, table ai_usage). The in-memory store is used only when Supabase
 * isn't configured (local dev without keys).
 */
export async function hubContext(): Promise<{ ok: false } | { ok: true; member: Member; store: QuotaStore }> {
  const { userId, getToken } = await currentUser();
  if (!userId) return { ok: false };
  const db = userClient(getToken);
  let member = await loadMember(userId, db);
  // Launch month safety net for the badge only; real limits come from the backend's app.has_pro().
  if (process.env.AI_HUB_LAUNCH_PRO === "1") member = { ...member, plan: "pro", promoActive: true };

  const store: QuotaStore =
    db && serviceConfigured()
      ? backendQuotaStore(
          {
            reserve: (u, feature, est) => reserveAi(u, feature, est),
            commit: (id, status, d) => commitAi(id, status, d),
            myQuota: async () => {
              const { data, error } = await db.rpc("my_ai_quota");
              if (error) throw new Error(error.message);
              return (data ?? null) as BackendQuota | null;
            },
          },
          userId,
          member.promoActive,
        )
      : memoryQuotaStore(userId, member.plan, member.promoActive);
  return { ok: true, member, store };
}

export function hubModels() {
  return loadHubModels();
}
