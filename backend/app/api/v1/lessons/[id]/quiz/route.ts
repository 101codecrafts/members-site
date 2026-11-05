import { z } from 'zod';
import { route, preflight, body } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { uuid } from '@/lib/validation';
import { rpcLoose } from '@/repositories/course-builder';
/** POST {answers:[optionIndex,...]}: graded in the database; answer keys never reach the browser. */
export const POST = route<{ id: string }>(async ({ req, params }) => {
  const s = await requireUser();
  const b = await body(req, z.object({ answers: z.array(z.number().int().min(0).max(10).nullable()).max(50) }));
  return rpcLoose(s.db, 'grade_lesson_quiz', { p_lesson: uuid.parse(params.id), p_answers: b.answers });
});
export const OPTIONS = preflight;
