import { route, preflight, body, query, unwrap } from '@/lib/http';
import { requireMember } from '@/lib/auth';
import { uuid } from '@/lib/validation';
export const POST = route<{ id: string }>(async ({ params }) => {
  const s = await requireMember();
  unwrap(await s.db.from('lesson_progress').insert({ user_id: s.userId, lesson_id: uuid.parse(params.id), course_id: '00000000-0000-0000-0000-000000000000' }));
  return { ok: true };
});
export const OPTIONS = preflight;
