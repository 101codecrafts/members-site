import { route, preflight, body, query, unwrap } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { z } from 'zod';
import { createExternalCourse } from '@/services/admin';
import { httpsUrl, educationLevel } from '@/lib/validation';
const B = z.object({ url: httpsUrl, provider: z.string().min(2).max(60), access_type: z.enum(['free', 'free_audit', 'free_trial', 'free_until', 'paid_with_aid']).default('free'),
  free_until: z.string().datetime().optional(), certificate_free: z.boolean().default(false), level: educationLevel.optional(), category: z.string().max(60).optional(),
  language: z.string().max(20).default('en') });
export const POST = route(async ({ req }) => {
  const s = await requireAdmin();
  return createExternalCourse(s, await body(req, B));
});
export const GET = route(async () => rpc((await requireAdmin()).db, 'admin_expiring_external_courses', { p_days: 14 }));
export const OPTIONS = preflight;
