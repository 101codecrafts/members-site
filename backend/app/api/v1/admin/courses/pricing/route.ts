import { route, preflight, query, unwrap } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { z } from 'zod';
import { requireScope } from '@/services/admin-console';
/** Courses with their free/paid state for the pricing toggle (scope: plans). */
export const GET = route(async ({ req }) => {
  const s = await requireAdmin();
  await requireScope(s, 'plans');
  const p = query(req, z.object({ q: z.string().trim().max(120).optional(), limit: z.coerce.number().int().min(1).max(100).default(30) }));
  let q = s.db.from('courses').select('id, title, slug, status, is_free, price_ugx, tutor_id, enrollments_count').is('deleted_at', null).order('created_at', { ascending: false }).limit(p.limit);
  if (p.q) q = q.ilike('title', `%${p.q.replace(/[%_]/g, '')}%`);
  return unwrap(await q);
});
export const OPTIONS = preflight;
