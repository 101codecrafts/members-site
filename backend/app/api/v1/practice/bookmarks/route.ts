import { route, preflight, query, body, unwrap } from '@/lib/http';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
const bm = z.object({ kind: z.enum(['article', 'problem', 'quiz', 'interview_set', 'contest']), ref_id: z.string().uuid() });
export const GET = route(async () => { const s = await requireUser(); return unwrap(await s.db.from('bookmarks').select('*').order('created_at', { ascending: false })); });
export const POST = route(async ({ req }) => {
  const s = await requireUser(); const b = await body(req, bm);
  unwrap(await s.db.from('bookmarks').upsert({ user_id: s.userId, ...b }, { onConflict: 'user_id,kind,ref_id', ignoreDuplicates: true }).select());
  return { saved: true };
});
export const DELETE = route(async ({ req }) => {
  const s = await requireUser(); const b = query(req, bm);
  unwrap(await s.db.from('bookmarks').delete().eq('kind', b.kind).eq('ref_id', b.ref_id).select());
  return { removed: true };
});
export const OPTIONS = preflight;
