import { route, preflight, body, query, unwrap } from '@/lib/http';
import { requireTutor } from '@/lib/auth';
import { uuid } from '@/lib/validation';
export const POST = route<{ id: string }>(async ({ params }) => {
  const s = await requireTutor();
  return unwrap(await s.db.from('courses').update({ status: 'pending_review' }).eq('id', uuid.parse(params.id)).select('id, status').single());
});
export const OPTIONS = preflight;
