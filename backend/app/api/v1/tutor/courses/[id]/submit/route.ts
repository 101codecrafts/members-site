import { route, preflight, body } from '@/lib/http';
import { requireTutor } from '@/lib/auth';
import { uuid } from '@/lib/validation';
import { SubmitInput } from '@/lib/lesson-input';
import { rpcLoose } from '@/repositories/course-builder';
/** POST: Submit for review. The DB runs the checklist + link report and adds the course to the admin queue. */
export const POST = route<{ id: string }>(async ({ req, params }) => {
  const s = await requireTutor();
  const b = await body(req, SubmitInput);
  return rpcLoose(s.db, 'submit_course_for_review', { p_course: uuid.parse(params.id), p_note: b.note ?? null });
});
export const OPTIONS = preflight;
