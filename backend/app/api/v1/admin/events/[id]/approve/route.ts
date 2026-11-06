import { route, preflight, body } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { uuid } from '@/lib/validation';
import { approveBody } from '@/lib/event-review';
import { reviewEvent } from '@/services/event-review';
/** Approve a pending member event: it goes live on /events. Optional note (≤300 chars) to the submitter. Audited; the submitter is notified. Scope 'approvals'. */
export const POST = route<{ id: string }>(async ({ req, params }) => {
  const s = await requireAdmin();
  const id = uuid.parse(params.id);
  const b = await body(req, approveBody);
  return reviewEvent(s, id, 'approve', b.reason || null);
});
export const OPTIONS = preflight;
