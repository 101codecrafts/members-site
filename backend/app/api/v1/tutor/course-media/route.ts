import { route, preflight, body, unwrap } from '@/lib/http';
import { requireTutor } from '@/lib/auth';
import { courseMediaBody } from '@/lib/validation';
import { buildCourseMedia } from '@/services/resources';
export const POST = route(async ({ req }) => {
  const s = await requireTutor();
  const b = await body(req, courseMediaBody);
  const m = await buildCourseMedia(b.url, b.kind);
  const { embed_url, ...row } = m;
  const inserted = unwrap(await s.db.from('course_media').insert({ ...row, course_id: b.course_id, lesson_id: b.lesson_id ?? null, level: b.level ?? null, position: b.position, approved: true })
    .select('*').single());
  return { ...inserted, embed_url };
});
export const OPTIONS = preflight;
