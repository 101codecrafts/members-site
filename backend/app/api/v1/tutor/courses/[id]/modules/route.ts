import { route, preflight, body } from '@/lib/http';
import { requireTutor } from '@/lib/auth';
import { uuid } from '@/lib/validation';
import { ModuleInput } from '@/lib/lesson-input';
import { loose, run, nextPosition } from '@/repositories/course-builder';
/** POST: add a module at the end of the course. Ownership + in-review lock enforced by RLS and the DB guard. */
export const POST = route<{ id: string }>(async ({ req, params }) => {
  const s = await requireTutor();
  const courseId = uuid.parse(params.id);
  const m = await body(req, ModuleInput);
  const position = await nextPosition(s.db, 'course_modules', courseId);
  return run(loose(s.db).from('course_modules').insert({ ...m, course_id: courseId, position }).select('id, title, summary, position, approved').single());
});
export const OPTIONS = preflight;
