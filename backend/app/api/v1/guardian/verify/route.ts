import { NextResponse } from 'next/server';
import { route, preflight } from '@/lib/http';
import { verifyGuardianToken } from '@/services/members';
export const GET = route(async ({ req }) => {
  const ok = await verifyGuardianToken(req.nextUrl.searchParams.get('token') ?? '');
  return NextResponse.redirect(new URL(ok ? '/auth.html?guardian=approved' : '/auth.html?guardian=invalid', req.url), 302);
});
export const OPTIONS = preflight;
