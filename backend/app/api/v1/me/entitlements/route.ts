import { route, preflight } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { getEntitlements } from '@/services/billing';
/** The caller's round-11 role, learner + tutor plans, live limits, usage and subscriptions. */
export const GET = route(async () => getEntitlements(await requireUser()));
export const OPTIONS = preflight;
