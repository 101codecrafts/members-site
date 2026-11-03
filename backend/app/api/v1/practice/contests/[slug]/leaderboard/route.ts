import { route, preflight, unwrapMaybe } from '@/lib/http';
import { optionalSession } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { notFound } from '@/lib/errors';
/** Live leaderboard (poll every ~15s or subscribe to submissions via Realtime on the client). Freeze respected. */
export const GET = route<{ slug: string }>(async ({ params }) => {
  const { db } = await optionalSession();
  const c = unwrapMaybe(await db.from('contests').select('id').eq('slug', params.slug).maybeSingle());
  if (!c) throw notFound('Contest not found');
  return rpc(db, 'contest_leaderboard', { p_contest: c.id, p_limit: 500 });
}, { cacheSeconds: 10 });
export const OPTIONS = preflight;
