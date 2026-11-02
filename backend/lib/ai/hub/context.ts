import "server-only";
import { currentUser } from "../http";
import { serviceClient, userClient } from "../supabase";
import { loadHubModels } from "./catalog";
import { loadMember, type Member } from "./member";
import { kampalaDay, status, supabaseQuotaStore, withQuotaFallback, type QuotaStatus } from "./quota";

/** Shared per-request context for /api/ai/* (auth → member → quota store). */
export async function hubContext(): Promise<
  | { ok: false }
  | { ok: true; member: Member; store: ReturnType<typeof withQuotaFallback>; day: string; quota: (used: number) => QuotaStatus }
> {
  const { userId, getToken } = await currentUser();
  if (!userId) return { ok: false };
  let member = await loadMember(userId, userClient(getToken));
  // Launch month safety net: everyone Pro even if the backend promo flag can't be read.
  if (process.env.AI_HUB_LAUNCH_PRO === "1") member = { ...member, plan: "pro", promoActive: true };
  const svc = serviceClient();
  const store = withQuotaFallback(svc ? supabaseQuotaStore(svc) : null);
  const { day } = kampalaDay();
  return { ok: true, member, store, day, quota: (used) => status(used, member.plan, member.promoActive) };
}

export function hubModels() {
  return loadHubModels();
}
