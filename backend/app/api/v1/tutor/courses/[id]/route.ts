import { route, preflight, body } from '@/lib/http';
import { requireTutor } from '@/lib/auth';
import { uuid } from '@/lib/validation';
import { AppError } from '@/lib/errors';
import { BuilderCoursePatch, courseColumns } from '@/lib/lesson-input';
import { courseTree, loose, run, COURSE_COLS } from '@/repositories/course-builder';
/** GET: full builder tree (course, modules -> lessons, quiz keys, submission history). Owner only (RLS). */
export const GET = route<{ id: string }>(async ({ params }) => {
  const s = await requireTutor();
  const id = uuid.parse(params.id);
  const tree = await courseTree(s.db, id);
  if (tree.course.tutor_id !== s.userId) throw new AppError('forbidden', 'Not your course');
  return tree;
});
/** PATCH: course details and the requested price. Blocked while in review (DB guard). */
export const PATCH = route<{ id: string }>(async ({ req, params }) => {
  const s = await requireTutor();
  const b = await body(req, BuilderCoursePatch);
  return run(loose(s.db).from('courses').update(courseColumns(b)).eq('id', uuid.parse(params.id)).eq('tutor_id', s.userId).select(COURSE_COLS).single());
});
/** DELETE: soft-delete a draft or rejected course. Live / in-review courses can't be deleted by the tutor. */
export const DELETE = route<{ id: string }>(async ({ params }) => {
  const s = await requireTutor();
  const id = uuid.parse(params.id);
  const c = await run<{ status: string } | null>(loose(s.db).from('courses').select('status').eq('id', id).eq('tutor_id', s.userId).maybeSingle());
  if (!c) throw new AppError('not_found', 'Course not found');
  if (!['draft', 'rejected'].includes(c.status)) throw new AppError('conflict', 'Only draft or rejected courses can be deleted');
  await run(loose(s.db).from('courses').update({ deleted_at: new Date().toISOString() }).eq('id', id).eq('tutor_id', s.userId));
  return { ok: true };
});
export const OPTIONS = preflight;
