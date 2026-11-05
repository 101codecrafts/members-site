import { route, preflight } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { z } from 'zod';
import { call } from '@/services/admin-console';
export const DELETE = route<{ id: string }>(async ({ params }) => {
  await call((await requireAdmin()).db, 'admin_revoke_invite', { p_id: z.string().uuid().parse(params.id) });
  return { ok: true };
});
export const OPTIONS = preflight;
