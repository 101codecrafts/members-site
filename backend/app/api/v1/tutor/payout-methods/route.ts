import { route, preflight, body, query, unwrap } from '@/lib/http';
import { requireTutor } from '@/lib/auth';
import { payoutMethodBody } from '@/lib/validation';
import { addPayoutMethod } from '@/services/members';
export const GET = route(async () => {
  const s = await requireTutor();
  return unwrap(await s.db.from('payout_methods').select('id, kind, provider_code, network, account_name, account_last4, is_default, verified_at, created_at').is('deleted_at', null));
});
export const POST = route(async ({ req }) => {
  const s = await requireTutor();
  return addPayoutMethod(s, await body(req, payoutMethodBody));
});
export const OPTIONS = preflight;
