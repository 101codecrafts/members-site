import { route, preflight, body, query, unwrap } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { reviewDecision, uuid } from '@/lib/validation';
import { notifyDecisionEmail } from '@/services/admin';
export const POST = route<{ id: string }>(async ({ req, params }) => {
  const s = await requireAdmin();
  const b = await body(req, reviewDecision);
  const a = await rpc(s.db, 'admin_review_membership', { p_application_id: uuid.parse(params.id), p_decision: b.decision, p_note: b.note });
  if (b.decision === 'approved') await notifyDecisionEmail(a.user_id, 'membership');
  return a;
});
export const OPTIONS = preflight;
