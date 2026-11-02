import { hubContext } from "../../../../lib/ai/hub/context";
import { json } from "../../../../lib/ai/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/ai/quota → { used, limit, remaining, plan, promoActive, resetsAt, safeMode } */
export async function GET() {
  const ctx = await hubContext();
  if (!ctx.ok) return json({ error: "Sign in to use 101 AI" }, 401);
  const used = await ctx.store.peek(ctx.member.userId, ctx.day);
  return json({ ...ctx.quota(used), safeMode: ctx.member.isMinor });
}
