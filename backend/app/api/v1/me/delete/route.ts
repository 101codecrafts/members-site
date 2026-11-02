import { route, preflight, body, query, unwrap } from '@/lib/http';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
/** DPPA 2019 right to erasure: queued, processed by the daily job after a 24 h cool-off. */
export const POST = route(async ({ req }) => {
  const s = await requireUser();
  const { confirm, details } = await body(req, z.object({ confirm: z.literal('DELETE MY ACCOUNT'), details: z.string().max(2000).optional() }));
  void confirm;
  return unwrap(await s.db.from('data_requests').insert({ user_id: s.userId, kind: 'delete', details: details ?? null }).select('id, status, due_at').single());
});
export const OPTIONS = preflight;
