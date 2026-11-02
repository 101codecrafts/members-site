import { route, preflight, body } from '@/lib/http';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { uuid } from '@/lib/validation';
export const POST = route<{ id: string }>(async ({ req, params }) => { const s = await requireAdmin();
  const b = await body(req, z.object({ outcome: z.enum(['refund', 'release']), refund_ugx: z.number().int().min(0).optional(), note: z.string().max(2000).optional() }));
  return rpc(s.db, 'admin_resolve_dispute', { p_dispute: uuid.parse(params.id), p_outcome: b.outcome, p_refund_ugx: b.refund_ugx, p_note: b.note }); });
export const OPTIONS = preflight;
