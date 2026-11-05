import { route, preflight, query } from '@/lib/http';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { priceRequestQueue } from '@/services/billing';
import { requireScope } from '@/services/admin-console';
const Q = z.object({ status: z.enum(['pending', 'approved', 'rejected']).catch('pending').default('pending') });
/** Tutor price requests waiting for review (?status=pending|approved|rejected; anything else = pending). */
export const GET = route(async ({ req }) => {
  const s = await requireAdmin();
  await requireScope(s, 'approvals');   // same scope as deciding (POST /admin/price-requests/:id)
  return priceRequestQueue(s, query(req, Q).status);
});
export const OPTIONS = preflight;
