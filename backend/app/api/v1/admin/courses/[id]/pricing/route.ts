import { route, preflight, body } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { z } from 'zod';
import { call, requireScope } from '@/services/admin-console';
import { pricingBody } from '@/lib/admin-validation';
/** Make any course free or paid (scope: plans). admin_set_course_pricing is the r11 plans branch RPC. */
export const POST = route<{ id: string }>(async ({ req, params }) => {
  const s = await requireAdmin();
  await requireScope(s, 'plans');
  const b = await body(req, pricingBody);
  return call(s.db, 'admin_set_course_pricing', { p_course: z.string().uuid().parse(params.id), p_is_free: b.is_free, p_price_ugx: b.is_free ? 0 : b.price_ugx,
    ...(b.all_lessons_free === undefined ? {} : { p_all_lessons_free: b.all_lessons_free }) });
});
export const OPTIONS = preflight;
