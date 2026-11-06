import { route, preflight } from '@/lib/http';
import { requireMemberCan } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { uuid } from '@/lib/validation';
import { joinSession } from '@/services/live-sessions';
/** GET (legacy): the private link for the tutor / a confirmed booker. POST (sessions.html): { provider, url, embed } via the meeting when one exists. */
export const GET = route<{ id: string }>(async ({ params }) => {
  const s = await requireMemberCan('shell.full');
  return rpc(s.db, 'session_join_info', { p_session: uuid.parse(params.id) });
});
export const POST = route<{ id: string }>(async ({ params }) => joinSession(await requireMemberCan('shell.full'), uuid.parse(params.id)),
  { rateLimit: { name: 'join', max: 20, windowSeconds: 60 } });
export const OPTIONS = preflight;
