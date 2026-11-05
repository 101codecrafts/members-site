import { route, preflight, query } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { approvalQueue } from '@/services/admin-console';
import { queueQuery } from '@/lib/admin-validation';
/** Scope: approvals (admin_review_queue). Riskiest first, then oldest. */
export const GET = route(async ({ req }) => {
  const s = await requireAdmin();
  const p = query(req, queueQuery);
  return approvalQueue(s, p);
});
export const OPTIONS = preflight;
