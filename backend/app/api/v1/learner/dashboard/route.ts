import { route, preflight } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { rpcLoose } from '@/repositories/course-builder';
/** GET: the signed-in learner's own dashboard (enrolments + progress, certificates, saved, sessions, plan). Real rows only. */
export const GET = route(async () => {
  const s = await requireUser();
  return rpcLoose(s.db, 'learner_dashboard');
});
export const OPTIONS = preflight;
