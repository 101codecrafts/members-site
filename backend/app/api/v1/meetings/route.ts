import { route, preflight, query, body, unwrap } from '@/lib/http';
import { z } from 'zod';
import { requireMemberCan } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { pagination, uuid } from '@/lib/validation';
import { provisionMeeting } from '@/services/meetings';
const m0 = z.object({ context_type: z.enum(['tutor_session', 'group', 'competition', 'event']), context_id: uuid, provider: z.enum(['jitsi', 'google_meet', 'zoom', 'teams']).default('jitsi'),
  title: z.string().min(3).max(200), starts_at: z.string().datetime(), duration_minutes: z.number().int().min(10).max(600).default(60) });
/** Organiser schedules a meeting (Jitsi by default); the join link is stored privately. */
export const POST = route(async ({ req }) => {
  const s = await requireMemberCan('shell.full'); const b = await body(req, m0);
  const m = await rpc(s.db, 'meeting_create', { p_context: b.context_type, p_context_id: b.context_id, p_provider: b.provider, p_title: b.title, p_starts_at: b.starts_at, p_duration: b.duration_minutes });
  return { meeting: m, ...(await provisionMeeting(m)) };
});
export const GET = route(async ({ req }) => {
  const s = await requireMemberCan('shell.full'); const p = query(req, pagination);
  return unwrap(await s.db.from('meetings').select('id, context_type, context_id, provider, title, starts_at, duration_minutes, status, recording_url').order('starts_at').range(p.offset, p.offset + p.limit - 1));
});
export const OPTIONS = preflight;
