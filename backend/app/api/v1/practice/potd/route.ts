import { route, preflight, unwrapMaybe } from '@/lib/http';
import { optionalSession } from '@/lib/auth';
export const GET = route(async () => {
  const { db } = await optionalSession();
  const day = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);   // Africa/Kampala (UTC+3, no DST)
  const r = unwrapMaybe(await db.from('problem_of_the_day').select('day, problems(id, slug, title, difficulty, tags)').eq('day', day).maybeSingle());
  return r ?? { day, problems: null };
});
export const OPTIONS = preflight;
