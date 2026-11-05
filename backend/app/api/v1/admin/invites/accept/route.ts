import { route, preflight, body } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { acceptInvite } from '@/services/admin-console';
import { acceptBody } from '@/lib/admin-validation';
/** Any signed-in user with the invite token; the DB matches the invite email to the Clerk-VERIFIED email. */
export const POST = route(async ({ req }) => {
  const s = await requireUser();
  const b = await body(req, acceptBody);
  return acceptInvite(s, b.token);
}, { rateLimit: { name: 'admin-accept', max: 10, windowSeconds: 600 } });
export const OPTIONS = preflight;
