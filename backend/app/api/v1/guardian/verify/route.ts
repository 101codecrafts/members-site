import { NextResponse } from 'next/server';
import { z } from 'zod';
import { route, preflight, body } from '@/lib/http';
import { rateLimit, LIMITS } from '@/lib/ratelimit';
import { verifyGuardianToken } from '@/services/members';

/**
 * Guardian consent (Uganda DPPA 2019 s.8). Round 11 integrate (audit P1-11):
 *  - GET (the link in the guardian's email) changes NOTHING. Mail scanners and link previews fetch links on their own,
 *    so it only forwards to the confirm page /guardian.html, which shows what is being agreed to.
 *  - POST {token, confirm: true}, sent when the guardian presses "I give consent" on that page, records the consent
 *    (single-use hashed token, 7-day expiry, then afterGuardianVerified() activates the account).
 */
const tokenRe = /^[A-Za-z0-9_-]{30,64}$/;

export const GET = route(async ({ req }) => {
  const token = req.nextUrl.searchParams.get('token') ?? '';
  const to = new URL('/guardian.html', req.url);
  if (tokenRe.test(token)) to.searchParams.set('token', token); else to.searchParams.set('invalid', '1');
  return NextResponse.redirect(to, 302);
});

export const POST = route(async ({ req, ip }) => {
  await rateLimit(LIMITS.auth, `guardian:${ip}`);
  const { token } = await body(req, z.object({ token: z.string().regex(tokenRe), confirm: z.literal(true) }).strict());
  const verified = await verifyGuardianToken(token);
  return { verified };
});

export const OPTIONS = preflight;
