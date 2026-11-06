import { route, preflight } from '@/lib/http';
import { requireMemberCan } from '@/lib/auth';
import { z } from 'zod';
import { call } from '@/services/admin-console';
export const DELETE = route<{ id: string }>(async ({ params }) => {
  await call((await requireMemberCan('review.submit')).db, 'withdraw_submission', { p_id: z.string().uuid().parse(params.id) });
  return { ok: true };
});
export const OPTIONS = preflight;
