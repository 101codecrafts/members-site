import { route, preflight, body, unwrap } from '@/lib/http';
import { requireTutor } from '@/lib/auth';
import { CourseInput } from '@/lib/course-input';
export const GET = route(async () => {
  const s = await requireTutor();
  return unwrap(await s.db.from('courses').select('id, slug, title, status, review_note, is_free, price_ugx, enrollments_count, rating_avg, updated_at').eq('tutor_id', s.userId).is('deleted_at', null));
});
export const POST = route(async ({ req }) => {
  const s = await requireTutor();
  const c = await body(req, CourseInput);
  return unwrap(await s.db.from('courses').insert({ ...c, tutor_id: s.userId, status: 'draft' }).select('id, slug, status').single());
});
export const OPTIONS = preflight;
