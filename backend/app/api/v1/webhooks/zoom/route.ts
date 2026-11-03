import { route } from '@/lib/http';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { hmacSha256 } from '@/lib/crypto';
import { AppError } from '@/lib/errors';
import { verifyZoomSignature } from '@/lib/meetings';
import { recordZoomEvent } from '@/services/meetings';
export const runtime = 'nodejs';
/** Zoom: meeting.started/ended + participant_joined/left → attendance. Signature verified (x-zm-signature). */
export const POST = route(async ({ req }) => {
  const raw = await req.text();
  const secret = env().ZOOM_WEBHOOK_SECRET;
  const evt = JSON.parse(raw) as { event: string; payload?: { plainToken?: string; object?: { id?: string | number } } };
  if (evt.event === 'endpoint.url_validation' && secret && evt.payload?.plainToken) {
    return NextResponse.json({ plainToken: evt.payload.plainToken, encryptedToken: hmacSha256(secret, evt.payload.plainToken) });
  }
  if (!verifyZoomSignature(raw, req.headers.get('x-zm-request-timestamp'), req.headers.get('x-zm-signature'), secret)) throw new AppError('unauthenticated', 'Invalid signature');
  await recordZoomEvent(evt);
  return { ok: true };
});
