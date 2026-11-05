import { route, preflight } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { ensureProfile } from '@/services/identity';
import { sessionView } from '@/services/auth-roles';
/**
 * The signed-in user's role, plan, minor/consent state, onboarding progress and where to land.
 * The role is computed server-side from user_roles + the verified Clerk email (never from the request).
 * 401 when signed out: the client treats that as "visitor".
 */
export const GET = route(async () => {
  const s = await requireUser();
  await ensureProfile(s.userId);
  return sessionView(s);
}, { rateLimit: { name: 'auth-session', max: 120, windowSeconds: 600 } });
export const OPTIONS = preflight;
