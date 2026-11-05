import { route, preflight, body, unwrap, unwrapMaybe } from '@/lib/http';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { AppError } from '@/lib/errors';
import { rateLimit, LIMITS } from '@/lib/ratelimit';
import { requireRecentVerification } from '@/lib/stepup';

/** DPPA 2019 right to erasure. POST queues the request (processed by the daily job after a 24 h cool-off), GET shows the
 *  open request, DELETE cancels it during the cool-off. Secured (round 11):
 *   - typed confirmation, plus a Clerk sign-in within the last 10 minutes (step-up; a stolen long-lived session can't erase)
 *   - the root admin (super_admin) can't be erased this way (409); the DB function refuses too
 *   - one open request per user (unique index); a repeat POST returns the existing one
 *   - rate-limited; RLS + the data_requests guard trigger force status/created_at server-side */
const COOL_OFF_MS = 24 * 3600 * 1000;
const view = (r: { id: string; status: string; created_at: string; due_at?: string } | null) =>
  r ? { ...r, erase_after: new Date(new Date(r.created_at).getTime() + COOL_OFF_MS).toISOString() } : null;

export const GET = route(async () => {
  const s = await requireUser();
  return view(unwrapMaybe(await s.db.from('data_requests').select('id, status, created_at, due_at').eq('user_id', s.userId).eq('kind', 'delete')
    .in('status', ['received', 'processing']).order('created_at', { ascending: false }).limit(1).maybeSingle()));
});

export const POST = route(async ({ req }) => {
  const s = await requireUser();
  await rateLimit(LIMITS.auth, `erase:${s.userId}`);
  const { details } = await body(req, z.object({ confirm: z.literal('DELETE MY ACCOUNT'), details: z.string().max(2000).optional() }));
  if (s.roles.includes('super_admin') || s.roles.includes('root_admin')) throw new AppError('conflict', 'The root admin account cannot be deleted');
  await requireRecentVerification();
  const open = unwrapMaybe(await s.db.from('data_requests').select('id, status, created_at, due_at').eq('user_id', s.userId).eq('kind', 'delete')
    .in('status', ['received', 'processing']).limit(1).maybeSingle());
  if (open) return view(open);
  return view(unwrap(await s.db.from('data_requests').insert({ user_id: s.userId, kind: 'delete', details: details ?? null }).select('id, status, created_at, due_at').single()));
});

export const DELETE = route(async () => {
  const s = await requireUser();
  const r = await s.db.from('data_requests').update({ status: 'cancelled' }).eq('user_id', s.userId).eq('kind', 'delete').eq('status', 'received').select('id');
  const rows = unwrap(r) as { id: string }[];
  if (!rows.length) throw new AppError('not_found', 'No deletion request to cancel (it may already be processing)');
  return { ok: true, cancelled: rows.length };
});
export const OPTIONS = preflight;
