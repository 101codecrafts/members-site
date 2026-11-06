import { route, preflight, query } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { pagination } from '@/lib/validation';
import { pendingEvents } from '@/services/event-review';
/** Events to review: member-submitted events still pending_review, oldest first. Admin / root_admin with scope 'approvals'. Paginated (limit ≤ 100). */
export const GET = route(async ({ req }) => {
  const s = await requireAdmin();
  return pendingEvents(s, query(req, pagination));
});
export const OPTIONS = preflight;
