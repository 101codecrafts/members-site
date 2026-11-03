import { route, preflight, body, unwrapMaybe } from '@/lib/http';
import { z } from 'zod';
import { optionalSession, requireMember } from '@/lib/auth';
import { notFound } from '@/lib/errors';
export const GET = route<{ slug: string }>(async ({ params }) => {
  const { db } = await optionalSession();
  const a = unwrapMaybe(await db.from('articles').select('*, profiles!articles_author_id_fkey(username, display_name, avatar_url)').eq('slug', params.slug).maybeSingle());
  if (!a) throw notFound('Article not found');
  return a;
});
const patch = z.object({ title: z.string().min(5).max(160).optional(), summary: z.string().max(400).optional(), body_md: z.string().max(200000).optional(),
  topic_id: z.string().uuid().nullable().optional(), tags: z.array(z.string().max(40)).max(10).optional(),
  level: z.enum(['primary', 'o_level', 'a_level', 'university', 'professional']).nullable().optional(), status: z.enum(['draft', 'pending_review', 'archived']).optional() });
/** Author edit (versioned by trigger; a published article returns to review). */
export const PATCH = route<{ slug: string }>(async ({ req, params }) => {
  const s = await requireMember();
  const a = unwrapMaybe(await s.db.from('articles').update(await body(req, patch)).eq('slug', params.slug).select().maybeSingle());
  if (!a) throw notFound('Article not found');
  return a;
});
export const OPTIONS = preflight;
