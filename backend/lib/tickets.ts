import 'server-only';
import { hmacSha256, safeEqual } from '@/lib/crypto';
import { env } from '@/lib/env';
import { AppError } from '@/lib/errors';

/** Signed event ticket for the QR code: base64url("<event>.<user>.<exp>") + "." + HMAC. */
export function signTicket(eventId: string, userId: string, expiresAt: Date): string {
  const secret = env().TICKET_HMAC_SECRET;
  if (!secret) throw new AppError('internal', 'TICKET_HMAC_SECRET not set');
  const payload = Buffer.from(`${eventId}.${userId}.${Math.floor(expiresAt.getTime() / 1000)}`).toString('base64url');
  return `${payload}.${hmacSha256(secret, payload, 'base64').replace(/=+$/, '')}`;
}
export function verifyTicket(token: string, eventId: string): { userId: string } {
  const secret = env().TICKET_HMAC_SECRET;
  const [payload, sig] = token.split('.');
  if (!secret || !payload || !sig || !safeEqual(sig, hmacSha256(secret, payload, 'base64').replace(/=+$/, ''))) throw new AppError('forbidden', 'Invalid ticket');
  const [ev, user, exp] = Buffer.from(payload, 'base64url').toString().split('.');
  if (ev !== eventId || !user) throw new AppError('forbidden', 'Ticket is for another event');
  if (Number(exp) * 1000 < Date.now()) throw new AppError('forbidden', 'Ticket expired');
  return { userId: user };
}
