import { route, preflight, body, query, unwrap } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { pagination } from '@/lib/validation';
export const GET = route(async ({ req }) => {
  const s = await requireUser();
  const p = query(req, pagination);
  return unwrap(await s.db.from('payments').select('id, tx_ref, purpose, reference_id, amount_ugx, discount_ugx, status, refunded_ugx, verified_at, created_at')
    .eq('user_id', s.userId).order('created_at', { ascending: false }).range(p.offset, p.offset + p.limit - 1));
});
export const OPTIONS = preflight;
