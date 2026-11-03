import { NextResponse, type NextRequest } from 'next/server';
import { trackClick } from '@/services/tracking';
import { uuid } from '@/lib/validation';
import { route, preflight } from '@/lib/http';
/**
 * Outbound redirect: only to URLs stored in our DB (no open redirect), click logged, rel=noopener on the card.
 * - DB id (uuid) found  -> 302 straight to the stored https URL (no interstitial, works without JS and for native apps).
 * - not a uuid          -> the static branded interstitial /go.html?id=… resolves ids from the front-end catalogue
 *                          (library seed data, AI tools, news) — previously these 400'd once /go/:id hit this route.
 * - uuid not found      -> /go.html?…&missing=1, the branded "link not available" card (was /index.html#not-found).
 * The id is only ever passed back as an encoded query value; the destination is never taken from the request.
 */
export const GET = route<{ id: string }>(async ({ req, params, ip }) => {
  const raw = String(params.id ?? '').slice(0, 200);
  const page = (missing: boolean) => {
    const u = new URL('/go.html', req.url);
    u.searchParams.set('id', raw);
    if (missing) u.searchParams.set('missing', '1');
    const r = NextResponse.redirect(u, 302);
    r.headers.set('cache-control', 'no-store');
    return r;
  };
  const parsed = uuid.safeParse(raw);
  if (!parsed.success) return page(false);
  const kind = req.nextUrl.searchParams.get('k');
  const target = await trackClick(parsed.data, kind, req as NextRequest, ip);
  if (!target) return page(true);
  const res = NextResponse.redirect(target, 302);
  res.headers.set('referrer-policy', 'no-referrer');
  res.headers.set('cache-control', 'no-store');
  return res;
});
export const OPTIONS = preflight;
