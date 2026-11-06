import { route, preflight, query, body, unwrap } from '@/lib/http';
import { z } from 'zod';
import { optionalSession, requireMemberCan } from '@/lib/auth';
import { pagination, slug } from '@/lib/validation';
export const GET = route(async ({ req }) => {
  const { db } = await optionalSession();
  const p = query(req, pagination.extend({ q: z.string().max(100).optional(), topic: z.string().uuid().optional(), tag: z.string().max(40).optional(),
    level: z.enum(['primary', 'o_level', 'a_level', 'university', 'professional']).optional(), mine: z.coerce.boolean().default(false) }));
  let q = db.from('articles').select('id, slug, title, summary, tags, level, topic_id, status, published_at, views_count, author_id, profiles!articles_author_id_fkey(username, display_name)', { count: 'exact' })
    .order('published_at', { ascending: false, nullsFirst: false }).range(p.offset, p.offset + p.limit - 1);
  if (!p.mine) q = q.eq('status', 'published');
  if (p.q) q = q.textSearch('search', p.q, { type: 'websearch', config: 'english' });
  if (p.topic) q = q.eq('topic_id', p.topic);
  if (p.tag) q = q.contains('tags', [p.tag]);
  if (p.level) q = q.eq('level', p.level);
  const r = await q;
  return { rows: unwrap(r), total: r.count ?? 0 };
}, { cacheSeconds: 60 });
const articleBody = z.object({ slug, title: z.string().min(5).max(160), summary: z.string().max(400).optional(), body_md: z.string().max(200000),
  topic_id: z.string().uuid().optional(), tags: z.array(z.string().max(40)).max(10).default([]),
  level: z.enum(['primary', 'o_level', 'a_level', 'university', 'professional']).optional(), status: z.enum(['draft', 'pending_review']).default('draft') });
export const POST = route(async ({ req }) => {
  const s = await requireMemberCan('review.submit');
  return unwrap(await s.db.from('articles').insert({ author_id: s.userId, ...(await body(req, articleBody)) }).select().single());
}, { rateLimit: { name: 'write', max: 30, windowSeconds: 60 } });
export const OPTIONS = preflight;
