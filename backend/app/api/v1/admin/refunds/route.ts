import { route, preflight, body, query, unwrap } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { adminRefundBody } from '@/lib/validation';
import { executeRefund } from '@/services/payments';
export const GET = route(async () => {
  const s = await requireAdmin();
  return unwrap(await s.db.from('refunds').select('*').in('status', ['requested', 'processing', 'failed']).order('created_at'));
});
export const POST = route(async ({ req, log }) => {
  const s = await requireAdmin();
  const b = await body(req, adminRefundBody);
  const r = await rpc(s.db, 'admin_issue_refund', { p_payment_id: b.payment_id, p_amount_ugx: b.amount_ugx, p_reason: b.reason, p_refund_id: b.refund_id });
  return executeRefund(r.id, log);
});
export const OPTIONS = preflight;
