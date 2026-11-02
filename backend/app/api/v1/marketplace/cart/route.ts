import { route, preflight, query, body, unwrap } from '@/lib/http';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { uuid } from '@/lib/validation';
export const GET = route(async () => {
  const s = await requireUser();
  return unwrap(await s.db.from('mkt_cart_items').select('product_id, variant_id, qty, added_at, mkt_products(slug, title, price_ugx, images, moq, stock, store_id, type)'));
});
const item = z.object({ product_id: uuid, variant_id: uuid.optional(), qty: z.number().int().min(1).max(100000) });
export const POST = route(async ({ req }) => {
  const s = await requireUser(); const b = await body(req, item);
  return unwrap(await s.db.from('mkt_cart_items').upsert({ user_id: s.userId, product_id: b.product_id, variant_id: b.variant_id ?? null, qty: b.qty }, { onConflict: 'user_id,product_id,variant_id' }).select());
});
export const DELETE = route(async ({ req }) => {
  const s = await requireUser(); const b = query(req, z.object({ product_id: uuid.optional() }));
  let q = s.db.from('mkt_cart_items').delete().eq('user_id', s.userId);
  if (b.product_id) q = q.eq('product_id', b.product_id);
  unwrap(await q.select());
  return { removed: true };
});
export const OPTIONS = preflight;
