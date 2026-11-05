import { route, preflight, body } from '@/lib/http';
import { requireTutor } from '@/lib/auth';
import { uuid } from '@/lib/validation';
import { AppError } from '@/lib/errors';
import { LessonInput } from '@/lib/lesson-input';
import { loose, run, nextPosition } from '@/repositories/course-builder';
/** POST: add a lesson (video | book | text | file | quiz) to a module. Quiz answers go to lesson_quiz_keys, never the lesson. */
export const POST = route<{ id: string }>(async ({ req, params }) => {
  const s = await requireTutor();
  const moduleId = uuid.parse(params.id);
  const mod = await run<{ course_id: string } | null>(loose(s.db).from('course_modules').select('course_id').eq('id', moduleId).maybeSingle());
  if (!mod) throw new AppError('not_found', 'Module not found');
  const row = await body(req, LessonInput);
  const { answers, ...lesson } = row as typeof row & { answers?: number[] };
  const position = await nextPosition(s.db, 'lessons', mod.course_id);
  const created = await run<{ id: string }>(loose(s.db).from('lessons').insert({ ...lesson, course_id: mod.course_id, module_id: moduleId, position }).select('id, module_id, title, kind, position, payload, content_md, is_preview, approved').single());
  if (answers) await run(loose(s.db).from('lesson_quiz_keys').insert({ lesson_id: created.id, answers }));
  return answers ? { ...created, answers } : created;
});
export const OPTIONS = preflight;
