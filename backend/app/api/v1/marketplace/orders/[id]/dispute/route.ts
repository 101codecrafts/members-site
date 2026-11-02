import { route, preflight, body } from '@/lib/http';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { uuid } from '@/lib/validation';
const d0 = z.object({ kind: z.enum(['return', 'refund', 'not_received', 'not_as_described']), reason: z.string().min(5).max(4000) });
export const POST = route<{ id: string }>(async ({ req, params }) => { const s = await requireUser(); const b = await body(req, d0); return rpc(s.db, 'mkt_open_dispute', { p_order: uuid.parse(params.id), p_kind: b.kind, p_reason: b.reason }); });
export const OPTIONS = preflight;
