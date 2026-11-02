import { route, preflight, body, query, unwrap } from '@/lib/http';
import { requireTutor } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
export const GET = route(async () => {
  const s = await requireTutor();
  return rpc(s.db, 'tutor_dashboard');
});
export const OPTIONS = preflight;
