import { route, preflight, body, unwrap } from '@/lib/http';
import { z } from 'zod';
import { requireMember, requireUser } from '@/lib/auth';
import { uuid } from '@/lib/validation';
export const GET = route(async () => { const s = await requireUser(); return unwrap(await s.db.from('mkt_rfqs').select('*, mkt_rfq_quotes(*)').order('created_at', { ascending: false })); });
const rfq = z.object({ product_id: uuid.optional(), store_id: uuid.optional(), title: z.string().min(3).max(160), details: z.string().max(8000).optional(), qty: z.number().int().min(1), target_unit_ugx: z.number().int().optional() });
/** Request for quotation (bulk / MOQ); vendors answer via /rfqs/:id/quotes. */
export const POST = route(async ({ req }) => { const s = await requireMember(); return unwrap(await s.db.from('mkt_rfqs').insert({ buyer_id: s.userId, ...(await body(req, rfq)) }).select().single()); });
export const OPTIONS = preflight;
