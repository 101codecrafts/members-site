import { route, preflight, body, query, unwrap } from '@/lib/http';
import { z } from 'zod';
import { requireMemberCan } from '@/lib/auth';
import { LIMITS } from '@/lib/ratelimit';
import { uuid } from '@/lib/validation';

/**
 * Comments on an activity-feed item (a community post).
 * GET: any signed-in user (post_comments_select). POST: active members, own rows
 * only (post_comments_insert; author_id is stamped by the guard_ugc trigger).
 */
const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().datetime().optional(),
});

export const GET = route<{ id: string }>(async ({ req, params }) => {
  const s = await requireMemberCan('shell.full');
  const q = query(req, listQuery);
  let sel = s.db.from('post_comments')
    .select('id, author_id, parent_id, body, created_at, author:profiles!post_comments_author_id_fkey(display_name, avatar_url)')
    .eq('post_id', uuid.parse(params.id))
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(q.limit);
  if (q.before) sel = sel.lt('created_at', q.before);
  return unwrap(await sel);
});

export const POST = route<{ id: string }>(async ({ req, params }) => {
  const s = await requireMemberCan('community.post');
  const b = await body(req, z.object({ text: z.string().trim().min(1).max(2000), parent_id: uuid.optional() }));
  return unwrap(await s.db.from('post_comments')
    .insert({ post_id: uuid.parse(params.id), author_id: s.userId, body: b.text, parent_id: b.parent_id ?? null })
    .select('id, author_id, parent_id, body, created_at')
    .single());
}, { rateLimit: LIMITS.write });

export const OPTIONS = preflight;
