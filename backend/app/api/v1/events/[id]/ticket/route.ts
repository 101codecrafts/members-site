import { route, preflight, unwrapMaybe } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { uuid } from '@/lib/validation';
import { signTicket } from '@/lib/tickets';
import { AppError } from '@/lib/errors';
/** Signed (HMAC) ticket token for the QR code; valid until 12h after the event starts. */
export const GET = route<{ id: string }>(async ({ params }) => {
  const s = await requireUser(); const id = uuid.parse(params.id);
  const r = unwrapMaybe(await s.db.from('event_registrations').select('status, events(starts_at)').eq('event_id', id).eq('user_id', s.userId).maybeSingle());
  if (!r || !['registered', 'attended'].includes(r.status)) throw new AppError('forbidden', 'No confirmed registration');
  const starts = new Date((r.events as unknown as { starts_at: string }).starts_at);
  return { ticket: signTicket(id, s.userId, new Date(starts.getTime() + 12 * 3600_000)) };
});
export const OPTIONS = preflight;
