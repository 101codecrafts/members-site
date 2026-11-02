import { route, preflight, body, query, unwrap } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { env } from '@/lib/env';
export const GET = route(async () => {
  const s = await requireUser();
  const code = await rpc(s.db, 'my_referral_code');
  const referrals = unwrap(await s.db.from('referrals').select('status, created_at').eq('referrer_id', s.userId));
  return { code, invite_url: `${env().APP_URL}/?ref=${code}`, referrals };
});
export const OPTIONS = preflight;
