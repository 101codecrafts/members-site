import { route, preflight } from '@/lib/http';
import { requireMember } from '@/lib/auth';
import { listIntegrations } from '@/services/live-sessions';
/** Meeting providers for live sessions: Jitsi always available; Google Meet / Zoom / Teams show whether an account is linked (connecting is not built yet). */
export const GET = route(async () => listIntegrations((await requireMember()).userId));
export const OPTIONS = preflight;
