import { route, preflight, body, unwrap } from '@/lib/http';
import { requireTutor } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { payoutRequestBody } from '@/lib/validation';
export const GET = route(async () => {
  const s = await requireTutor();
  return unwrap(await s.db.from('payouts').select('id, amount_ugx, status, reference, review_note, created_at, processed_at, failure_reason').order('created_at', { ascending: false }));
});
export const POST = route(async ({ req }) => {
  const s = await requireTutor();
  const b = await body(req, payoutRequestBody);
  return rpc(s.db, 'request_payout', { p_amount_ugx: b.amount_ugx, p_method_id: b.method_id });
});
export const OPTIONS = preflight;
