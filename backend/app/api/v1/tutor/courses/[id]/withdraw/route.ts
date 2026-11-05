import { route, preflight } from '@/lib/http';
import { requireTutor } from '@/lib/auth';
import { uuid } from '@/lib/validation';
import { rpcLoose } from '@/repositories/course-builder';
/** POST: withdraw a pending submission; an in-review course goes back to Draft so it can be edited. */
export const POST = route<{ id: string }>(async ({ params }) => {
  const s = await requireTutor();
  return rpcLoose(s.db, 'withdraw_course_submission', { p_course: uuid.parse(params.id) });
});
export const OPTIONS = preflight;
