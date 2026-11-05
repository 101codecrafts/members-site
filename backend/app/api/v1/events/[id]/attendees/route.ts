import { route, preflight } from '@/lib/http';
import { requireMember } from '@/lib/auth';
import { uuid } from '@/lib/validation';
import { eventAttendees } from '@/services/live-sessions';
/** Organiser view: who registered for an event and who checked in. The event's creator or an admin only. */
export const GET = route<{ id: string }>(async ({ params }) => eventAttendees(await requireMember(), uuid.parse(params.id)));
export const OPTIONS = preflight;
