import { route, preflight, body } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { call, invite } from '@/services/admin-console';
import { inviteBody } from '@/lib/admin-validation';
export const GET = route(async () => call((await requireAdmin()).db, 'admin_list_admins'));
/** Root only (enforced in admin_invite). Emails the accept link; returns it to root only when email is not configured. */
export const POST = route(async ({ req }) => {
  const s = await requireAdmin();
  const b = await body(req, inviteBody);
  return invite(s, b.email, b.scopes);
}, { rateLimit: { name: 'admin-invite', max: 20, windowSeconds: 3600 } });
export const OPTIONS = preflight;
