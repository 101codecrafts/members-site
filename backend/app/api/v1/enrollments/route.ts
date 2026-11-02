import { route, preflight, body, query, unwrap } from '@/lib/http';
import { z } from 'zod';
import { requireMember } from '@/lib/auth';
import { uuid } from '@/lib/validation';
export const GET = route(async () => {
  const s = await requireMember();
  return unwrap(await s.db.from('enrollments').select('id, course_id, status, progress_pct, enrolled_at, completed_at, last_activity_at').eq('user_id', s.userId));
});
/** Free courses only; paid ones go through /checkout. */
export const POST = route(async ({ req }) => {
  const s = await requireMember();
  const { course_id } = await body(req, z.object({ course_id: uuid }));
  return unwrap(await s.db.from('enrollments').insert({ user_id: s.userId, course_id }).select('id, status').single());
});
export const OPTIONS = preflight;
