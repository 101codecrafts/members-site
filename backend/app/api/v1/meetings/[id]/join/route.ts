import { route, preflight } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { uuid } from '@/lib/validation';
/** Short-lived join info for allowed participants only (paid/enrolled; minors need guardian consent + verified tutor). */
export const POST = route<{ id: string }>(async ({ params }) => { const s = await requireUser(); return rpc(s.db, 'meeting_join', { p_meeting: uuid.parse(params.id) }); },
  { rateLimit: { name: 'join', max: 20, windowSeconds: 60 } });
export const OPTIONS = preflight;
