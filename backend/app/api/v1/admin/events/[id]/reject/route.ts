import { route, preflight, body } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { uuid } from '@/lib/validation';
import { rejectBody } from '@/lib/event-review';
import { reviewEvent } from '@/services/event-review';
/** Reject a pending member event. Reason required (3–300 chars); it is sent to the submitter and written to the audit log. Scope 'approvals'. */
export const POST = route<{ id: string }>(async ({ req, params }) => {
  const s = await requireAdmin();
  const id = uuid.parse(params.id);
  const b = await body(req, rejectBody);
  return reviewEvent(s, id, 'reject', b.reason);
});
export const OPTIONS = preflight;
