import { route, preflight, body, unwrap } from '@/lib/http';
import { z } from 'zod';
import { requireMemberCan } from '@/lib/auth';
import { uuid } from '@/lib/validation';
export const GET = route<{ id: string }>(async ({ req, params }) => {
  const s = await requireMemberCan('message.send');
  const before = req.nextUrl.searchParams.get('before');
  let q = s.db.from('messages').select('id, sender_id, body, attachment_path, edited_at, created_at').eq('conversation_id', uuid.parse(params.id)).order('created_at', { ascending: false }).limit(50);
  if (before) q = q.lt('created_at', z.string().datetime().parse(before));
  return unwrap(await q);
});
export const POST = route<{ id: string }>(async ({ req, params }) => {
  const s = await requireMemberCan('message.send');
  const { text } = await body(req, z.object({ text: z.string().min(1).max(5000) }));
  return unwrap(await s.db.from('messages').insert({ conversation_id: uuid.parse(params.id), sender_id: s.userId, body: text }).select('id, created_at').single());
});
export const OPTIONS = preflight;
