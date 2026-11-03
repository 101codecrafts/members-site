import { route, preflight, body } from '@/lib/http';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { uuid } from '@/lib/validation';
const b0 = z.object({ status: z.enum(['processing', 'shipped', 'out_for_delivery', 'delivered']), carrier: z.string().max(60).optional(), tracking_code: z.string().max(80).optional(), note: z.string().max(500).optional() });
/** Vendor fulfilment updates (tracking statuses). */
export const POST = route<{ id: string }>(async ({ req, params }) => {
  const s = await requireUser(); const b = await body(req, b0);
  return rpc(s.db, 'mkt_vendor_update_order', { p_order: uuid.parse(params.id), p_status: b.status, p_carrier: b.carrier, p_tracking: b.tracking_code, p_note: b.note });
});
export const OPTIONS = preflight;
