import { route, preflight, body } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { decide } from '@/services/admin-console';
import { decideBody, reviewId } from '@/lib/admin-validation';
/** approve | reject (reason) | request_changes (reason + fixes). The submitter is notified in-app by the DB. */
export const POST = route<{ id: string }>(async ({ req, params }) => {
  const s = await requireAdmin();
  const b = await body(req, decideBody);
  return decide(s, reviewId.parse(params.id), b.decision, b.reason ?? null, b.fixes);
});
export const OPTIONS = preflight;
