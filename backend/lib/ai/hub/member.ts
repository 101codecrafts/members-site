import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Plan } from "./quota";

/**
 * Who is asking: effective plan (backend public.my_plan(): promo → Pro for all)
 * and whether the member is a minor (profiles.is_minor, derived from DOB).
 * When the backend is unreachable we fail SAFE: plan "free", and minors-safe mode
 * ON unless AI_HUB_ASSUME_ADULT_WHEN_UNKNOWN=1.
 */
export type Member = { userId: string; plan: Plan; promoActive: boolean; isMinor: boolean; known: boolean };

const planRow = z.object({ effective_plan: z.enum(["free", "pro"]).catch("free"), promo_active: z.boolean().catch(false) });

export async function loadMember(userId: string, sb: SupabaseClient | null): Promise<Member> {
  const unknownMinor = process.env.AI_HUB_ASSUME_ADULT_WHEN_UNKNOWN !== "1";
  const fallback: Member = { userId, plan: "free", promoActive: false, isMinor: unknownMinor, known: false };
  if (!sb) return fallback;
  try {
    const [planRes, profRes] = await Promise.all([
      sb.rpc("my_plan"),
      sb.from("profiles").select("is_minor").eq("id", userId).maybeSingle(),
    ]);
    const plan = planRes.error ? null : planRow.safeParse(planRes.data);
    const isMinor = profRes.error || !profRes.data ? unknownMinor : Boolean((profRes.data as { is_minor?: boolean }).is_minor);
    return {
      userId,
      plan: plan?.success ? plan.data.effective_plan : "free",
      promoActive: plan?.success ? plan.data.promo_active : false,
      isMinor,
      known: Boolean(plan?.success && !profRes.error && profRes.data),
    };
  } catch (err) {
    console.warn("[ai-hub] member lookup failed:", (err as Error).message);
    return fallback;
  }
}
