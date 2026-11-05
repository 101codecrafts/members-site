import { route, preflight } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { callOptional } from '@/services/admin-console';
/** Plans + prices + limits as stored in the database (r11 plans branch: plan_tiers + subscription_plans). */
export const GET = route(async () => {
  const s = await requireAdmin();
  const r = await callOptional(s.db, 'plans_catalogue', {}, { currency: 'UGX', learner: [], tutor: [] });
  return { ...r.data, available: r.available };
});
export const OPTIONS = preflight;
