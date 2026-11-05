import { route, preflight, body } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { sha256 } from '@/lib/crypto';
import { env } from '@/lib/env';
import { ensureProfile } from '@/services/identity';
import { onboardingSubmit } from '@/lib/onboarding';
import { submitOnboarding } from '@/services/auth-roles';
/**
 * Finish the /auth flow for the chosen path (guest | learner | tutor). Strict schema: any extra key (e.g. "role")
 * is rejected with 400, and the server alone decides what the path grants. Disposable emails are refused here too.
 */
export const POST = route(async ({ req, ip }) => {
  const s = await requireUser();
  await ensureProfile(s.userId);
  const input = await body(req, onboardingSubmit);
  return submitOnboarding(s, input, sha256(env().HASH_SALT + ip));
}, { rateLimit: { name: 'auth-onboarding', max: 20, windowSeconds: 600 } });
export const OPTIONS = preflight;
