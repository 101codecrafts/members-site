import { route, preflight, body, unwrapMaybe } from '@/lib/http';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { notFound } from '@/lib/errors';
import { uuid } from '@/lib/validation';
/** Host shares a recording link with participants. */
export const POST = route<{ id: string }>(async ({ req, params }) => {
  const s = await requireUser(); const b = await body(req, z.object({ recording_url: z.string().url().startsWith('https://') }));
  const r = unwrapMaybe(await s.db.from('meetings').update({ recording_url: b.recording_url }).eq('id', uuid.parse(params.id)).select('id, recording_url').maybeSingle());
  if (!r) throw notFound('Meeting not found');
  return r;
});
export const OPTIONS = preflight;
