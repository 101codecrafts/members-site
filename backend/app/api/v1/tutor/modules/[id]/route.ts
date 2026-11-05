import { route, preflight, body } from '@/lib/http';
import { requireTutor } from '@/lib/auth';
import { uuid } from '@/lib/validation';
import { ModulePatch } from '@/lib/lesson-input';
import { loose, run } from '@/repositories/course-builder';
export const PATCH = route<{ id: string }>(async ({ req, params }) => {
  const s = await requireTutor();
  const b = await body(req, ModulePatch);
  return run(loose(s.db).from('course_modules').update(b).eq('id', uuid.parse(params.id)).select('id, title, summary, position, approved').single());
});
/** DELETE: removes the module and its lessons (cascade). */
export const DELETE = route<{ id: string }>(async ({ params }) => {
  const s = await requireTutor();
  await run(loose(s.db).from('course_modules').delete().eq('id', uuid.parse(params.id)));
  return { ok: true };
});
export const OPTIONS = preflight;
