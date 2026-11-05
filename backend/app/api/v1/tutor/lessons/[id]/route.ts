import { route, preflight, body } from '@/lib/http';
import { requireTutor } from '@/lib/auth';
import { uuid } from '@/lib/validation';
import { LessonInput } from '@/lib/lesson-input';
import { loose, run } from '@/repositories/course-builder';
/** PATCH: replace a lesson's content (send the full lesson, same shape as create). Edits to a live course stay hidden until approved. */
export const PATCH = route<{ id: string }>(async ({ req, params }) => {
  const s = await requireTutor();
  const id = uuid.parse(params.id);
  const row = await body(req, LessonInput);
  const { answers, ...lesson } = row as typeof row & { answers?: number[] };
  const updated = await run<{ id: string }>(loose(s.db).from('lessons').update(lesson).eq('id', id).select('id, module_id, title, kind, position, payload, content_md, is_preview, approved').single());
  if (answers) await run(loose(s.db).from('lesson_quiz_keys').upsert({ lesson_id: id, answers, updated_at: new Date().toISOString() }, { onConflict: 'lesson_id' }));
  else await run(loose(s.db).from('lesson_quiz_keys').delete().eq('lesson_id', id));
  return answers ? { ...updated, answers } : updated;
});
export const DELETE = route<{ id: string }>(async ({ params }) => {
  const s = await requireTutor();
  await run(loose(s.db).from('lessons').delete().eq('id', uuid.parse(params.id)));
  return { ok: true };
});
export const OPTIONS = preflight;
