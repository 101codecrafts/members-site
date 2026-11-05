import { route, preflight, unwrap } from '@/lib/http';
import { requireUser } from '@/lib/auth';
/** Your own badges (shown on your private profile even when the profile is not public). RLS: user_badges_select. */
export const GET = route(async () => {
  const s = await requireUser();
  return unwrap(await s.db.from('user_badges').select('awarded_at, badges(code, name, icon_url)').eq('user_id', s.userId).order('awarded_at', { ascending: false }));
});
export const OPTIONS = preflight;
