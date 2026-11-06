import { route, preflight } from '@/lib/http';
import { requireMemberCan } from '@/lib/auth';
import { listSessions } from '@/services/live-sessions';
/** Live sessions the caller can see (upcoming or live now), with the meeting provider, the caller's role and booking. Real rows only. */
export const GET = route(async () => listSessions(await requireMemberCan('shell.full')));
export const OPTIONS = preflight;
