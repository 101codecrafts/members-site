import { route, preflight, body, query, unwrap } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { payoutDecisionBody, uuid } from '@/lib/validation';
import { executePayout } from '@/services/payments';
/** Approve → immediately initiate the Flutterwave transfer (MTN/Airtel MoMo or bank). */
export const POST = route<{ id: string }>(async ({ req, params, log }) => {
  const s = await requireAdmin();
  const b = await body(req, payoutDecisionBody);
  const po = await rpc(s.db, 'admin_review_payout', { p_payout_id: uuid.parse(params.id), p_decision: b.decision, p_note: b.note });
  if (b.decision === 'approve') return { payout: po, transfer: await executePayout(po.id, log) };
  return { payout: po };
});
export const OPTIONS = preflight;
