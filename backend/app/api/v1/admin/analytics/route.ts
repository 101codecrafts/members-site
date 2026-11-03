import { route, preflight, query } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { analyticsQuery } from '@/lib/validation';
export const GET = route(async ({ req }) => {
  const s = await requireAdmin();
  const p = query(req, analyticsQuery);
  return rpc(s.db, 'admin_analytics', { p_metric: p.metric, p_from: p.from, p_to: p.to, p_limit: p.limit });
});
export const OPTIONS = preflight;
