import { route, preflight } from '@/lib/http';
import { requireMember } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { uuid } from '@/lib/validation';
export const GET = route<{ id: string }>(async ({ params }) => {
  const s = await requireMember();
  return rpc(s.db, 'session_join_info', { p_session: uuid.parse(params.id) });
});
export const OPTIONS = preflight;
