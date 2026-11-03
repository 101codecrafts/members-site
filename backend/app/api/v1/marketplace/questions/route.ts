import { route, preflight, body, unwrap } from '@/lib/http';
import { z } from 'zod';
import { requireMember } from '@/lib/auth';
import { uuid } from '@/lib/validation';
const q0 = z.object({ product_id: uuid, body: z.string().min(3).max(1000) });
export const POST = route(async ({ req }) => { const s = await requireMember(); return unwrap(await s.db.from('mkt_questions').insert({ user_id: s.userId, ...(await body(req, q0)) }).select().single()); },
  { rateLimit: { name: 'write', max: 30, windowSeconds: 60 } });
export const OPTIONS = preflight;
