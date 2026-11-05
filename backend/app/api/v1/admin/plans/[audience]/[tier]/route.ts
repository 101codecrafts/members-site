import { route, preflight, body } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { z } from 'zod';
import { call, requireScope } from '@/services/admin-console';
import { planBody } from '@/lib/admin-validation';
/** Scope: plans. Edits a tier's limits/features/prices (admin_update_plan, r11 plans branch); audited there + here. */
export const PUT = route<{ audience: string; tier: string }>(async ({ req, params }) => {
  const s = await requireAdmin();
  await requireScope(s, 'plans');
  const audience = z.enum(['learner', 'tutor']).parse(params.audience);
  const tier = z.enum(['free', 'standard', 'plus', 'pro']).parse(params.tier);
  const b = await body(req, planBody);
  return call(s.db, 'admin_update_plan', { p_audience: audience, p_tier: tier, p_name: b.name ?? null, p_tagline: b.tagline ?? null,
    p_limits: b.limits ?? null, p_features: b.features ?? null, p_monthly_ugx: b.monthly_ugx ?? null, p_yearly_ugx: b.yearly_ugx ?? null, p_confirm_prices: b.confirm_prices ?? null });
});
export const OPTIONS = preflight;
