import { route, preflight, body } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { call } from '@/services/admin-console';
import { supportBody } from '@/lib/admin-validation';
/** Start a 30-minute READ-ONLY view of a user's dashboard (scope: support_view). Reason required; the user is notified. */
export const POST = route(async ({ req }) => {
  const s = await requireAdmin();
  const b = await body(req, supportBody);
  return call(s.db, 'admin_start_support_view', { p_target: b.target, p_reason: b.reason, p_ticket: b.ticket ?? null });
}, { rateLimit: { name: 'support-view', max: 30, windowSeconds: 3600 } });
export const OPTIONS = preflight;
