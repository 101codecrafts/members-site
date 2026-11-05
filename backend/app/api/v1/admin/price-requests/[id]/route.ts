import { route, preflight, body } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { uuid } from '@/lib/validation';
import { priceDecisionBody } from '@/lib/plans-validation';
import { decideCoursePrice } from '@/services/billing';
import { requireScope } from '@/services/admin-console';
/** Approve or reject a tutor's price request; approval sets the course price. Scope: approvals (also enforced in SQL, 20261105040000). */
export const POST = route<{ id: string }>(async ({ req, params }) => {
  const s = await requireAdmin();
  await requireScope(s, 'approvals');
  const b = await body(req, priceDecisionBody);
  return decideCoursePrice(s, uuid.parse(params.id), b.approve, b.note);
});
export const OPTIONS = preflight;
