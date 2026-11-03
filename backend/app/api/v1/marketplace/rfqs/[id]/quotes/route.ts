import { route, preflight, body, unwrap } from '@/lib/http';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { uuid } from '@/lib/validation';
const qt = z.object({ store_id: uuid, unit_price_ugx: z.number().int().min(100), moq: z.number().int().min(1).default(1), valid_until: z.string().datetime(), note: z.string().max(2000).optional() });
export const POST = route<{ id: string }>(async ({ req, params }) => { const s = await requireUser();
  return unwrap(await s.db.from('mkt_rfq_quotes').insert({ rfq_id: uuid.parse(params.id), ...(await body(req, qt)) }).select().single()); });
export const OPTIONS = preflight;
