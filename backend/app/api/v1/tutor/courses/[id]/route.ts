import { route, preflight, body, query, unwrap } from '@/lib/http';
import { requireTutor } from '@/lib/auth';
import { uuid } from '@/lib/validation';
import { CourseInput } from '../route';
const Patch = CourseInput.partial().extend({}).strict();
export const PATCH = route<{ id: string }>(async ({ req, params }) => {
  const s = await requireTutor();
  const b = await body(req, Patch);
  return unwrap(await s.db.from('courses').update(b).eq('id', uuid.parse(params.id)).select('id, slug, status').single());
});
export const OPTIONS = preflight;
