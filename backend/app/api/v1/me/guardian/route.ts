import { route, preflight, body, query, unwrap } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { guardianBody } from '@/lib/validation';
import { startGuardianConsent } from '@/services/members';
export const POST = route(async ({ req }) => {
  const s = await requireUser();
  return startGuardianConsent(s, await body(req, guardianBody));
});
export const OPTIONS = preflight;
