import { route, preflight, body, unwrap } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { call } from '@/services/admin-console';
import { flagBody } from '@/lib/admin-validation';
export const GET = route(async () => {
  const s = await requireAdmin();
  return unwrap(await s.db.from('feature_flags').select('*').order('key'));
});
/** Scope: flags (admin_set_flag); before→after lands in the audit log. */
export const POST = route(async ({ req }) => {
  const s = await requireAdmin();
  const b = await body(req, flagBody);
  await call(s.db, 'admin_set_flag', { p_key: b.key, p_enabled: b.enabled, p_rollout_pct: b.rollout_pct, p_roles: b.roles ?? null });
  return { ok: true };
});
export const OPTIONS = preflight;
