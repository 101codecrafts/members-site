import { route, preflight, query, body, unwrap } from '@/lib/http';
import { z } from 'zod';
import { optionalSession, requireMemberCan } from '@/lib/auth';
import { pagination } from '@/lib/validation';
/** Public catalogue of free AI tools (approved only). We never store users' personal API keys. */
export const GET = route(async ({ req }) => {
  const { db } = await optionalSession();
  const p = query(req, pagination.extend({ category: z.string().max(20).optional(), q: z.string().max(80).optional() }));
  let q = db.from('ai_tools').select('id, name, slug, category, logo_url, free_tier_summary, signup_url, docs_url, student_perk, how_to_key_md, tags, verified_at').eq('approved', true).order('name').range(p.offset, p.offset + p.limit - 1);
  if (p.category) q = q.eq('category', p.category);
  if (p.q) q = q.ilike('name', `%${p.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
  return unwrap(await q);
}, { cacheSeconds: 300 });
const suggest = z.object({ name: z.string().min(2).max(80), slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,60}$/), category: z.enum(['chat', 'coding', 'image', 'video', 'audio', 'speech', 'search', 'agents', 'api', 'dataset', 'notebook', 'other']),
  signup_url: z.string().url().startsWith('https://').optional(), docs_url: z.string().url().startsWith('https://').optional(), free_tier_summary: z.string().max(600).optional() });
/** Members suggest a tool; admins approve + verify the free tier. */
export const POST = route(async ({ req }) => { const s = await requireMemberCan('community.post'); return unwrap(await s.db.from('ai_tools').insert({ ...(await body(req, suggest)), suggested_by: s.userId }).select().single()); },
  { rateLimit: { name: 'write', max: 10, windowSeconds: 600 } });
export const OPTIONS = preflight;
