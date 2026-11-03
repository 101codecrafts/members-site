import { route, preflight, query, unwrap } from '@/lib/http';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { pagination } from '@/lib/validation';
export const GET = route(async ({ req }) => {
  const s = await requireUser();
  const p = query(req, pagination.extend({ role: z.enum(['buyer', 'seller']).default('buyer') }));
  let q = s.db.from('mkt_orders').select('*, mkt_order_items(*), mkt_order_events(status, note, at)').order('created_at', { ascending: false }).range(p.offset, p.offset + p.limit - 1);
  q = p.role === 'buyer' ? q.eq('buyer_id', s.userId) : q.neq('buyer_id', s.userId);
  return unwrap(await q);
});
export const OPTIONS = preflight;
