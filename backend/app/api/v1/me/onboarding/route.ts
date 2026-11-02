import { route, preflight, body } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { onboardingBody } from '@/lib/validation';
import { saveOnboarding } from '@/services/members';
export const PUT = route(async ({ req }) => {
  const s = await requireUser();
  return saveOnboarding(s, await body(req, onboardingBody));
});
export const OPTIONS = preflight;
