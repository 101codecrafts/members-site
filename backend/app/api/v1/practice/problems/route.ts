import { route, preflight, query, unwrap } from '@/lib/http';
import { z } from 'zod';
import { optionalSession } from '@/lib/auth';
import { pagination } from '@/lib/validation';
/** Problem list: full-text q, difficulty, topic id, company tag, solved filter (signed-in). */
export const GET = route(async ({ req }) => {
  const { db } = await optionalSession();
  const p = query(req, pagination.extend({ q: z.string().max(100).optional(), difficulty: z.enum(['basic', 'easy', 'medium', 'hard']).optional(),
    topic: z.string().uuid().optional(), company: z.string().max(60).optional(), sort: z.enum(['new', 'popular', 'solved']).default('new') }));
  let q = db.from('problems').select('id, slug, title, difficulty, topic_ids, tags, company_tags, solved_count, attempts_count, level', { count: 'exact' })
    .range(p.offset, p.offset + p.limit - 1);
  if (p.q) q = q.textSearch('search', p.q, { type: 'websearch', config: 'english' });
  if (p.difficulty) q = q.eq('difficulty', p.difficulty);
  if (p.topic) q = q.contains('topic_ids', [p.topic]);
  if (p.company) q = q.contains('company_tags', [p.company]);
  q = p.sort === 'popular' ? q.order('attempts_count', { ascending: false }) : p.sort === 'solved' ? q.order('solved_count', { ascending: false }) : q.order('created_at', { ascending: false });
  const r = await q;
  return { rows: unwrap(r), total: r.count ?? 0 };
});
export const OPTIONS = preflight;
