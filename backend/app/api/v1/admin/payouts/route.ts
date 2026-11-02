import { route, preflight, query, unwrap } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';

import { z } from 'zod';
export const GET = route(async ({ req }) => {
  const s = await requireAdmin();
  const { status } = query(req, z.object({ status: z.enum(['requested', 'approved', 'held', 'processing', 'paid', 'failed', 'rejected']).default('requested') }));
  return unwrap(await s.db.from('payouts').select('id, tutor_id, amount_ugx, status, reference, created_at, reviewed_at, review_note, failure_reason').eq('status', status).order('created_at'));
});
export const OPTIONS = preflight;
