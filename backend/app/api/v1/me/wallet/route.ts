import { route, preflight, body, query, unwrap } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
export const GET = route(async () => {
  const s = await requireUser();
  return rpc(s.db, 'my_wallet');
});
export const OPTIONS = preflight;
