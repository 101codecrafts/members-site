import { route, preflight, body, unwrap } from '@/lib/http';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { deviceTokenBody } from '@/lib/validation';
export const POST = route(async ({ req }) => {
  const s = await requireUser();
  const d = await body(req, deviceTokenBody);
  return unwrap(await s.db.from('device_tokens').upsert({ user_id: s.userId, ...d, last_seen_at: new Date().toISOString(), disabled_at: null }, { onConflict: 'token' }).select('id').single());
});
export const DELETE = route(async ({ req }) => {
  const s = await requireUser();
  const { token } = await body(req, z.object({ token: z.string().min(10).max(4096) }));
  unwrap(await s.db.from('device_tokens').delete().eq('token', token));
  return { ok: true };
});
export const OPTIONS = preflight;
