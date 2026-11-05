import { route, preflight, body } from '@/lib/http';
import { LIMITS } from '@/lib/ratelimit';
import { requireTutor } from '@/lib/auth';
import { BuilderCourseInput, courseColumns, slugify } from '@/lib/lesson-input';
import { loose, run, COURSE_COLS } from '@/repositories/course-builder';
/** GET: the tutor's own courses (any status). POST: create a draft (price is a request; admins set the live price). */
export const GET = route(async () => {
  const s = await requireTutor();
  return run(loose(s.db).from('courses').select(COURSE_COLS + ', enrollments_count, rating_avg').eq('tutor_id', s.userId).is('deleted_at', null).order('updated_at', { ascending: false }));
});
export const POST = route(async ({ req }) => {
  const s = await requireTutor();
  const c = await body(req, BuilderCourseInput);
  return run(loose(s.db).from('courses').insert({ ...courseColumns(c), slug: slugify(c.title), tutor_id: s.userId, status: 'draft' }).select(COURSE_COLS).single());
}, { rateLimit: LIMITS.write });
export const OPTIONS = preflight;
