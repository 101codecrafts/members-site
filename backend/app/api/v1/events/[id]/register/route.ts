import { route, preflight, unwrap } from '@/lib/http';
import { requireMember } from '@/lib/auth';
import { uuid } from '@/lib/validation';
export const POST = route<{ id: string }>(async ({ params }) => {
  const s = await requireMember();
  return unwrap(await s.db.from('event_registrations').insert({ event_id: uuid.parse(params.id), user_id: s.userId }).select('id, status').single());
});
export const DELETE = route<{ id: string }>(async ({ params }) => {
  const s = await requireMember();
  unwrap(await s.db.from('event_registrations').update({ status: 'cancelled' }).eq('event_id', uuid.parse(params.id)).eq('user_id', s.userId));
  return { ok: true };
});
export const OPTIONS = preflight;
