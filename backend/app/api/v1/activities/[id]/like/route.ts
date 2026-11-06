import { route, preflight } from '@/lib/http';
import { LIMITS } from '@/lib/ratelimit';
import { requireMemberCan } from '@/lib/auth';
import { uuid } from '@/lib/validation';
import type { Session } from '@/lib/auth';

/**
 * Like / unlike an activity-feed item (a community post).
 * POST adds the caller's 'like' reaction (idempotent), DELETE removes it.
 * Both answer { liked, likes } so the client can reconcile its optimistic state.
 * RLS: reactions_insert (own row, members) and reactions_delete (own row) — see
 * supabase/migrations/20261103000100_activity_reactions.sql.
 */
async function state(s: Session, postId: string): Promise<{ liked: boolean; likes: number }> {
  const [all, mine] = await Promise.all([
    s.db.from('reactions').select('id', { count: 'exact', head: true }).eq('post_id', postId).eq('emoji', 'like'),
    s.db.from('reactions').select('id').eq('post_id', postId).eq('emoji', 'like').eq('user_id', s.userId).maybeSingle(),
  ]);
  if (all.error) throw all.error;
  if (mine.error) throw mine.error;
  return { liked: Boolean(mine.data), likes: all.count ?? 0 };
}

export const POST = route<{ id: string }>(async ({ params }) => {
  const s = await requireMemberCan('community.post');
  const postId = uuid.parse(params.id);
  const { error } = await s.db.from('reactions').upsert(
    { post_id: postId, user_id: s.userId, emoji: 'like' },
    { onConflict: 'user_id,post_id,emoji', ignoreDuplicates: true },
  );
  if (error) throw error;
  return state(s, postId);
}, { rateLimit: LIMITS.write });

export const DELETE = route<{ id: string }>(async ({ params }) => {
  const s = await requireMemberCan('community.post');
  const postId = uuid.parse(params.id);
  const { error } = await s.db.from('reactions').delete().eq('post_id', postId).eq('user_id', s.userId).eq('emoji', 'like');
  if (error) throw error;
  return state(s, postId);
}, { rateLimit: LIMITS.write });

export const OPTIONS = preflight;
