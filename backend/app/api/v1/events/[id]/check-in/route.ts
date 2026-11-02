import { route, preflight, body } from '@/lib/http';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { uuid } from '@/lib/validation';
import { verifyTicket } from '@/lib/tickets';
/** Organiser scans the QR → verifies HMAC → marks attended. */
export const POST = route<{ id: string }>(async ({ req, params }) => {
  const s = await requireUser(); const id = uuid.parse(params.id);
  const b = await body(req, z.object({ ticket: z.string().min(20).max(400) }));
  const { userId } = verifyTicket(b.ticket, id);
  return rpc(s.db, 'event_check_in', { p_event: id, p_user: userId });
}, { rateLimit: { name: 'checkin', max: 120, windowSeconds: 60 } });
export const OPTIONS = preflight;
