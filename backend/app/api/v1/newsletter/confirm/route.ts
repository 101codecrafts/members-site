import { NextResponse } from 'next/server';
import { route, preflight } from '@/lib/http';
import { confirmNewsletter } from '@/services/tracking';
export const GET = route(async ({ req }) => {
  const ok = await confirmNewsletter(req.nextUrl.searchParams.get('token') ?? '');
  return NextResponse.redirect(new URL(ok ? '/index.html#newsletter-confirmed' : '/index.html#newsletter-invalid', req.url), 302);
});
export const OPTIONS = preflight;
