import { route, preflight, body, unwrapMaybe } from '@/lib/http';
import { z } from 'zod';
import { optionalSession, requireMember } from '@/lib/auth';
import { notFound } from '@/lib/errors';
export const GET = route<{ slug: string }>(async ({ params }) => {
  const { db } = await optionalSession();
  const p = unwrapMaybe(await db.from('mkt_products').select('*, mkt_stores(id, slug, name, logo_url, rating_avg, rating_count), mkt_variants(*), mkt_price_tiers(min_qty, unit_price_ugx)').eq('slug', params.slug).maybeSingle());
  if (!p) throw notFound('Product not found');
  const [reviews, questions] = await Promise.all([
    db.from('mkt_reviews').select('rating, body, vendor_reply, created_at, profiles(username, display_name)').eq('product_id', p.id).order('created_at', { ascending: false }).limit(20),
    db.from('mkt_questions').select('id, body, answer, answered_at, created_at').eq('product_id', p.id).order('created_at', { ascending: false }).limit(20),
  ]);
  return { ...p, reviews: reviews.data ?? [], questions: questions.data ?? [] };
});
const patch = z.object({ title: z.string().min(3).max(160).optional(), description_md: z.string().max(30000).optional(), price_ugx: z.number().int().min(500).optional(),
  compare_at_ugx: z.number().int().nullable().optional(), stock: z.number().int().min(0).nullable().optional(), images: z.array(z.string().url()).max(12).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(), tags: z.array(z.string().max(40)).max(15).optional() });
export const PATCH = route<{ slug: string }>(async ({ req, params }) => {
  const s = await requireMember();
  const r = unwrapMaybe(await s.db.from('mkt_products').update(await body(req, patch)).eq('slug', params.slug).select().maybeSingle());
  if (!r) throw notFound('Product not found');
  return r;
});
export const OPTIONS = preflight;
