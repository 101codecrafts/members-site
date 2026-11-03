import { route, preflight, query, body, unwrap } from '@/lib/http';
import { z } from 'zod';
import { optionalSession, requireMember } from '@/lib/auth';
import { pagination, uuid } from '@/lib/validation';
/** Full-text search + filters (category, type, price range, store, rating, in-stock), sorted. */
export const GET = route(async ({ req }) => {
  const { db } = await optionalSession();
  const p = query(req, pagination.extend({ q: z.string().max(100).optional(), category: uuid.optional(), store: uuid.optional(),
    type: z.enum(['digital', 'physical', 'service', 'software_license', 'course_bundle']).optional(),
    min: z.coerce.number().int().min(0).optional(), max: z.coerce.number().int().min(0).optional(), rating: z.coerce.number().min(0).max(5).optional(),
    in_stock: z.coerce.boolean().default(false), sort: z.enum(['relevance', 'new', 'price_asc', 'price_desc', 'rating', 'best_selling']).default('new') }));
  let q = db.from('mkt_products').select('id, slug, title, type, images, price_ugx, compare_at_ugx, stock, moq, rating_avg, rating_count, sold_count, store_id, mkt_stores(slug, name, rating_avg)', { count: 'exact' })
    .range(p.offset, p.offset + p.limit - 1);
  if (p.q) q = q.textSearch('search', p.q, { type: 'websearch', config: 'english' });
  if (p.category) q = q.eq('category_id', p.category);
  if (p.store) q = q.eq('store_id', p.store);
  if (p.type) q = q.eq('type', p.type);
  if (p.min != null) q = q.gte('price_ugx', p.min);
  if (p.max != null) q = q.lte('price_ugx', p.max);
  if (p.rating != null) q = q.gte('rating_avg', p.rating);
  if (p.in_stock) q = q.or('stock.is.null,stock.gt.0');
  const order: Record<string, [string, boolean]> = { new: ['created_at', false], relevance: ['rating_count', false], price_asc: ['price_ugx', true], price_desc: ['price_ugx', false], rating: ['rating_avg', false], best_selling: ['sold_count', false] };
  const [col, asc] = order[p.sort] ?? ['created_at', false];
  const r = await q.order(col, { ascending: asc });
  return { rows: unwrap(r), total: r.count ?? 0 };
}, { cacheSeconds: 60 });
const productBody = z.object({ store_id: uuid, slug: z.string().regex(/^[a-z0-9][a-z0-9-]{2,100}$/), title: z.string().min(3).max(160), description_md: z.string().max(30000).optional(),
  type: z.enum(['digital', 'physical', 'service', 'software_license', 'course_bundle']), category_id: uuid.optional(), images: z.array(z.string().url().startsWith('https://')).max(12).default([]),
  price_ugx: z.number().int().min(500).max(100_000_000), compare_at_ugx: z.number().int().optional(), stock: z.number().int().min(0).nullable().optional(),
  moq: z.number().int().min(1).default(1), tags: z.array(z.string().max(40)).max(15).default([]), status: z.enum(['draft', 'published', 'archived']).default('draft') });
/** Vendor creates a product (RLS: own store; publishing requires verified KYC). */
export const POST = route(async ({ req }) => {
  const s = await requireMember();
  return unwrap(await s.db.from('mkt_products').insert(await body(req, productBody)).select().single());
});
export const OPTIONS = preflight;
