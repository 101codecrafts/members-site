import { route, preflight, query, unwrap } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';

import { z } from 'zod';
import { pagination } from '@/lib/validation';
export const GET = route(async ({ req }) => {
  const s = await requireAdmin();
  const p = query(req, pagination.extend({ status: z.enum(['open', 'reviewing', 'resolved', 'dismissed']).default('open') }));
  const flags = unwrap(await s.db.from('moderation_flags').select('*').eq('status', p.status).order('created_at').range(p.offset, p.offset + p.limit - 1));
  const safeguarding = unwrap(await s.db.from('safeguarding_reports').select('*').in('status', ['open', 'investigating', 'escalated']).order('created_at'));
  return { flags, safeguarding };
});
export const OPTIONS = preflight;
