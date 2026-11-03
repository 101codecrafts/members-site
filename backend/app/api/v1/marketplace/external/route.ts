import { route, preflight, query, unwrap } from '@/lib/http';
import { z } from 'zod';
import { optionalSession } from '@/lib/auth';
import { pagination } from '@/lib/validation';
export const GET = route(async ({ req }) => {
  const { db } = await optionalSession();
  const p = query(req, pagination.extend({ source: z.enum(['amazon', 'alibaba', 'aliexpress', 'jumia', 'other']).optional() }));
  let q = db.from('external_products').select('id, source, title, image_url, price_text, category_id').order('created_at', { ascending: false }).range(p.offset, p.offset + p.limit - 1);
  if (p.source) q = q.eq('source', p.source);
  return unwrap(await q);   // link out through /api/v1/go/<id>?k=product, never the raw URL
}, { cacheSeconds: 300 });
export const OPTIONS = preflight;
