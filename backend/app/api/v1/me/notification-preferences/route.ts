import { route, preflight, body, query, unwrap, unwrapMaybe } from '@/lib/http';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
const Channel = z.record(z.enum(['messages', 'comments', 'courses', 'events', 'payments', 'announcements', 'gamification']), z.boolean());
const Prefs = z.object({ in_app: Channel.optional(), email: Channel.optional(), whatsapp_opt_in: z.boolean().optional(),
  whatsapp_number: z.string().regex(/^\+[0-9]{7,15}$/).nullable().optional(), digest_frequency: z.enum(['off', 'daily', 'weekly']).optional() }).strict();
export const GET = route(async () => {
  const s = await requireUser();
  return unwrapMaybe(await s.db.from('notification_preferences').select('*').eq('user_id', s.userId).maybeSingle());
});
export const PUT = route(async ({ req }) => {
  const s = await requireUser();
  const input = await body(req, Prefs);
  return unwrap(await s.db.from('notification_preferences').upsert({ user_id: s.userId, ...input }, { onConflict: 'user_id' }).select('*').single());
});
export const OPTIONS = preflight;
