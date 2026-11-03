import { route, preflight, body, unwrapMaybe } from '@/lib/http';
import { z } from 'zod';
import { optionalSession, requireUser } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { notFound } from '@/lib/errors';
/** Questions WITHOUT answers (keys live in quiz_answer_keys, admin-only). */
export const GET = route<{ slug: string }>(async ({ params }) => {
  const { db } = await optionalSession();
  const z0 = unwrapMaybe(await db.from('quizzes').select('id, slug, title, level, time_limit_s, pass_pct, quiz_questions(id, ord, prompt_md, options, multi)').eq('slug', params.slug).maybeSingle());
  if (!z0) throw notFound('Quiz not found');
  return z0;
});
const answers = z.object({ answers: z.record(z.string().uuid(), z.array(z.number().int().min(0).max(7)).max(8)) });
export const POST = route<{ slug: string }>(async ({ req, params }) => {
  const s = await requireUser();
  const b = await body(req, answers);
  const z0 = unwrapMaybe(await s.db.from('quizzes').select('id').eq('slug', params.slug).maybeSingle());
  if (!z0) throw notFound('Quiz not found');
  return rpc(s.db, 'submit_quiz', { p_quiz: z0.id, p_answers: b.answers });
}, { rateLimit: { name: 'quiz', max: 20, windowSeconds: 600 } });
export const OPTIONS = preflight;
