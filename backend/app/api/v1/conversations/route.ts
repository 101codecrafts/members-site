import { route, preflight, body, unwrap } from '@/lib/http';
import { z } from 'zod';
import { requireMemberCan } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { clerkId } from '@/lib/validation';
export const GET = route(async () => {
  const s = await requireMemberCan('message.send');
  return unwrap(await s.db.from('conversations').select('id, kind, title, last_message_at, conversation_participants(user_id, last_read_at)').order('last_message_at', { ascending: false, nullsFirst: false }).limit(100));
});
/** Child-safety and block rules are enforced inside start_direct_conversation(). */
export const POST = route(async ({ req }) => {
  const s = await requireMemberCan('message.send');
  const { user_id } = await body(req, z.object({ user_id: clerkId }));
  return { conversation_id: await rpc(s.db, 'start_direct_conversation', { p_other: user_id }) };
});
export const OPTIONS = preflight;
