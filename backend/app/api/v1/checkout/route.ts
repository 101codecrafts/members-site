import { route, preflight, body, query, unwrap } from '@/lib/http';
import { requireMember } from '@/lib/auth';
import { checkoutBody } from '@/lib/validation';
import { createCheckout } from '@/services/checkout';
export const POST = route(async ({ req }) => {
  const s = await requireMember();
  return createCheckout(s, await body(req, checkoutBody));
});
export const OPTIONS = preflight;
