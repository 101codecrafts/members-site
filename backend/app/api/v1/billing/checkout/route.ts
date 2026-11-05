import { route, preflight, body } from '@/lib/http';
import { requireMember } from '@/lib/auth';
import { planCheckoutBody } from '@/lib/plans-validation';
import { createPlanCheckout } from '@/services/billing';
/** Plan upgrade checkout. Body names plan + interval + method only; the DB computes the amount (SR-17). */
export const POST = route(async ({ req }) => {
  const s = await requireMember();
  return createPlanCheckout(s, await body(req, planCheckoutBody));
});
export const OPTIONS = preflight;
