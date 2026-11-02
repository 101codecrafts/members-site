import { route, preflight, query } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';

import { exportQuery } from '@/lib/validation';
import { exportCsv } from '@/services/admin';
import { rateLimit, LIMITS } from '@/lib/ratelimit';
export const GET = route(async ({ req }) => {
  const s = await requireAdmin();
  await rateLimit(LIMITS.export, s.userId);
  const p = query(req, exportQuery);
  return exportCsv(s, p.dataset, p.from, p.to);
});
export const OPTIONS = preflight;
