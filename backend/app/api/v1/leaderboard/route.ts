import { route, preflight, body, query, unwrap } from '@/lib/http';
import { z } from 'zod';
import { requireMember } from '@/lib/auth';
export const GET = route(async ({ req }) => {
  const s = await requireMember();
  const { period } = query(req, z.object({ period: z.enum(['week', 'all']).default('week') }));
  const view = period === 'week' ? 'leaderboard_weekly' : 'leaderboard_all_time';
  return unwrap(await s.db.from(view).select('*').order('rank').limit(50));
});
export const OPTIONS = preflight;
