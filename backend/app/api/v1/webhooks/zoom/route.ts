import { route } from '@/lib/http';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { hmacSha256 } from '@/lib/crypto';
import { AppError } from '@/lib/errors';
import { verifyZoomSignature, zoomPlainTokenOk } from '@/lib/meetings';
import { recordZoomEvent } from '@/services/meetings';
export const runtime = 'nodejs';
/**
 * Zoom: meeting.started/ended + participant_joined/left → attendance. Signature verified (x-zm-signature).
 * r12 security (R12-SEC-03): the signature is checked BEFORE anything else, including endpoint.url_validation.
 * Previously url_validation returned HMAC(secret, plainToken) for an unsigned request with any plainToken, which is
 * a signing oracle: plainToken = "v0:<ts>:<forged body>" yields a valid x-zm-signature for a forged event.
 * Zoom signs url_validation requests too, and real plain tokens are short base64url strings (no ':').
 */
export const POST = route(async ({ req }) => {
  const raw = await req.text();
  const secret = env().ZOOM_WEBHOOK_SECRET;
  if (!verifyZoomSignature(raw, req.headers.get('x-zm-request-timestamp'), req.headers.get('x-zm-signature'), secret)) throw new AppError('unauthenticated', 'Invalid signature');
  let evt: { event: string; payload?: { plainToken?: string; object?: { id?: string | number } } };
  try { evt = JSON.parse(raw); } catch { throw new AppError('bad_request', 'Invalid JSON'); }
  if (evt.event === 'endpoint.url_validation') {
    const t = evt.payload?.plainToken;
    if (!secret || !zoomPlainTokenOk(t)) throw new AppError('bad_request', 'Invalid plainToken');
    return NextResponse.json({ plainToken: t, encryptedToken: hmacSha256(secret, t) });
  }
  await recordZoomEvent(evt);
  return { ok: true };
});
