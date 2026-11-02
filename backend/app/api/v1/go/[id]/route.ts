import { NextResponse, type NextRequest } from 'next/server';
import { trackClick } from '@/services/tracking';
import { uuid } from '@/lib/validation';
import { route, preflight } from '@/lib/http';
/** Outbound redirect: only to URLs stored in our DB (no open redirect), click logged, rel=noopener on the card. */
export const GET = route<{ id: string }>(async ({ req, params, ip }) => {
  const id = uuid.parse(params.id);
  const kind = req.nextUrl.searchParams.get('k');
  const target = await trackClick(id, kind, req as NextRequest, ip);
  if (!target) return NextResponse.redirect(new URL('/index.html#not-found', req.url), 302);
  const res = NextResponse.redirect(target, 302);
  res.headers.set('referrer-policy', 'no-referrer');
  res.headers.set('cache-control', 'no-store');
  return res;
});
export const OPTIONS = preflight;
