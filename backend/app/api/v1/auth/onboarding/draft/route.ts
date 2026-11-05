import { route, preflight, body } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { ensureProfile } from '@/services/identity';
import { onboardingDraft } from '@/lib/onboarding';
import { saveDraft } from '@/services/auth-roles';
/** Save-and-resume for the multi-step /auth flow (minors: only the minimum is kept server-side before consent). */
export const PUT = route(async ({ req }) => {
  const s = await requireUser();
  await ensureProfile(s.userId);
  return saveDraft(s, await body(req, onboardingDraft));
}, { rateLimit: { name: 'auth-draft', max: 120, windowSeconds: 600 } });
export const OPTIONS = preflight;
