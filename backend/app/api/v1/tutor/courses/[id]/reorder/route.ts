import { route, preflight, body } from '@/lib/http';
import { requireTutor } from '@/lib/auth';
import { uuid } from '@/lib/validation';
import { ReorderInput } from '@/lib/lesson-input';
import { rpcLoose } from '@/repositories/course-builder';
/** POST {modules:[ids], lessons:{moduleId:[ids]}}: reorder modules and move/reorder lessons in one transaction. */
export const POST = route<{ id: string }>(async ({ req, params }) => {
  const s = await requireTutor();
  const b = await body(req, ReorderInput);
  await rpcLoose(s.db, 'reorder_course', { p_course: uuid.parse(params.id), p_modules: b.modules, p_lessons: b.lessons });
  return { ok: true };
});
export const OPTIONS = preflight;
