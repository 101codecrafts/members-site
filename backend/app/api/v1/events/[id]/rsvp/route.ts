import { route, preflight } from '@/lib/http';
import { requireMember, requireMemberCan } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { uuid } from '@/lib/validation';
/** Free event RSVP with capacity + waitlist; minors need guardian consent for in-person events. */
export const POST = route<{ id: string }>(async ({ params }) => { const s = await requireMemberCan('event.register'); return rpc(s.db, 'event_rsvp', { p_event: uuid.parse(params.id) }); });
export const DELETE = route<{ id: string }>(async ({ params }) => { const s = await requireMember(); await rpc(s.db, 'event_cancel_rsvp', { p_event: uuid.parse(params.id) }); return { cancelled: true }; });
export const OPTIONS = preflight;
