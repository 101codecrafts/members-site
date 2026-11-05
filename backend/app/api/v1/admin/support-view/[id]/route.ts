import { route, preflight } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { z } from 'zod';
import { call } from '@/services/admin-console';
/** Snapshot (every read is audited). No user token is ever minted: the admin keeps their own session. */
export const GET = route<{ id: string }>(async ({ params }) => call((await requireAdmin()).db, 'admin_support_snapshot', { p_session: z.string().uuid().parse(params.id) }));
export const DELETE = route<{ id: string }>(async ({ params }) => {
  await call((await requireAdmin()).db, 'admin_end_support_view', { p_id: z.string().uuid().parse(params.id) });
  return { ok: true };
});
export const OPTIONS = preflight;
