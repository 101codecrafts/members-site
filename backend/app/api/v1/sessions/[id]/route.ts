import { route, preflight } from '@/lib/http';
import { requireMember } from '@/lib/auth';
import { uuid } from '@/lib/validation';
import { getSession } from '@/services/live-sessions';
/** One live session (RLS-scoped), same shape as a GET /api/v1/sessions item. */
export const GET = route<{ id: string }>(async ({ params }) => getSession(await requireMember(), uuid.parse(params.id)));
export const OPTIONS = preflight;
