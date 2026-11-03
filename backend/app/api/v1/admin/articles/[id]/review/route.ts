import { route, preflight, body } from '@/lib/http';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { uuid } from '@/lib/validation';
export const POST = route<{ id: string }>(async ({ req, params }) => {
  const s = await requireAdmin();
  const b = await body(req, z.object({ decision: z.enum(['publish', 'reject', 'archive']), note: z.string().max(2000).optional() }));
  return rpc(s.db, 'admin_review_article', { p_article: uuid.parse(params.id), p_decision: b.decision, p_note: b.note });
});
export const OPTIONS = preflight;
