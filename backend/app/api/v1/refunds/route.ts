import { route, preflight, body, query, unwrap } from '@/lib/http';
import { requireMember } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { refundRequestBody } from '@/lib/validation';
export const POST = route(async ({ req }) => {
  const s = await requireMember();
  const b = await body(req, refundRequestBody);
  return rpc(s.db, 'request_refund', { p_payment_id: b.payment_id, p_reason: b.reason });
});
export const OPTIONS = preflight;
