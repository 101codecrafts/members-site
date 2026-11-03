import { route, preflight, query, body, unwrap } from '@/lib/http';
import { z } from 'zod';
import { optionalSession, requireMember } from '@/lib/auth';
import { pagination } from '@/lib/validation';
export const GET = route(async ({ req }) => {
  const { db } = await optionalSession();
  const p = query(req, pagination);
  return unwrap(await db.from('mkt_stores').select('id, slug, name, description, logo_url, kyc_status, rating_avg, rating_count').order('rating_avg', { ascending: false }).range(p.offset, p.offset + p.limit - 1));
});
const storeBody = z.object({ slug: z.string().regex(/^[a-z0-9][a-z0-9-]{2,60}$/), name: z.string().min(2).max(80), description: z.string().max(4000).optional(), logo_url: z.string().url().startsWith('https://').optional() });
/** Open a store (adults only); KYC starts 'pending' until an admin verifies. */
export const POST = route(async ({ req }) => {
  const s = await requireMember();
  return unwrap(await s.db.from('mkt_stores').insert({ owner_id: s.userId, ...(await body(req, storeBody)) }).select().single());
});
export const OPTIONS = preflight;
