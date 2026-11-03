import { route, preflight, query, unwrap } from '@/lib/http';
import { anonClient } from '@/lib/supabase/user';
import { pagination } from '@/lib/validation';
/** Global coding-score leaderboard. */
export const GET = route(async ({ req }) => {
  const p = query(req, pagination);
  return unwrap(await anonClient().from('practice_stats').select('user_id, coding_score, solved_total, potd_streak, profiles(username, display_name, avatar_url)')
    .order('coding_score', { ascending: false }).range(p.offset, p.offset + p.limit - 1));
}, { cacheSeconds: 120 });
export const OPTIONS = preflight;
