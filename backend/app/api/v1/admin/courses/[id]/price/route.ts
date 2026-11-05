import { z } from 'zod';
import { route, preflight, body } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { uuid } from '@/lib/validation';
import { rpcLoose } from '@/repositories/course-builder';
/** POST {price_ugx}: admin makes any course free (0) or paid (>= UGX 1,000). Audited. */
export const POST = route<{ id: string }>(async ({ req, params }) => {
  const s = await requireAdmin();
  const b = await body(req, z.object({ price_ugx: z.number().int().min(0).max(100_000_000) }));
  await rpcLoose(s.db, 'admin_set_course_price', { p_course: uuid.parse(params.id), p_price_ugx: b.price_ugx });
  return { ok: true };
});
export const OPTIONS = preflight;
