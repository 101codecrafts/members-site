import { route, preflight, body, unwrap } from '@/lib/http';
import { z } from 'zod';
import { requireMemberCan } from '@/lib/auth';
import { uuid } from '@/lib/validation';
const r0 = z.object({ product_id: uuid, order_id: uuid, rating: z.number().int().min(1).max(5), body: z.string().max(4000).optional() });
/** Verified-purchase reviews only (enforced by the DB trigger). */
export const POST = route(async ({ req }) => { const s = await requireMemberCan('rating.create'); return unwrap(await s.db.from('mkt_reviews').insert({ user_id: s.userId, ...(await body(req, r0)) }).select().single()); });
export const OPTIONS = preflight;
