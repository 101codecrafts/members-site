import { route, preflight, body } from '@/lib/http';
import { z } from 'zod';
import { requireMember } from '@/lib/auth';
import { uuid } from '@/lib/validation';
import { createMarketplaceCheckout } from '@/services/checkout';
const co = z.object({ shipping: z.record(uuid, z.object({ zone_id: uuid.optional(), pickup_point_id: uuid.optional(), address: z.record(z.string(), z.string().max(200)).optional() })).default({}), coupon: z.string().regex(/^[A-Za-z0-9_-]{3,32}$/).optional() });
/** Amount and tx_ref are computed in the database (SR-17); the client never supplies a price. */
export const POST = route(async ({ req }) => {
  const s = await requireMember(); const b = await body(req, co);
  return createMarketplaceCheckout(s, b.shipping, b.coupon);
});
export const OPTIONS = preflight;
