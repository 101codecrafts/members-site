import { route, preflight, body } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { z } from 'zod';
import { uuid } from '@/lib/validation';
export const POST = route<{ id: string }>(async ({ req, params }) => {
  const s = await requireAdmin();
  const b = await body(req, z.object({ approve: z.boolean(), featured: z.boolean().optional() }));
  await rpc(s.db, 'admin_approve_external_course', { p_id: uuid.parse(params.id), p_approve: b.approve, p_featured: b.featured });
  return { ok: true };
});
export const OPTIONS = preflight;
