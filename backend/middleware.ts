import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

/**
 * Clerk attaches/validates the session for every request (cookie for web,
 * `Authorization: Bearer` for native apps). Authorization itself happens in
 * each handler (requireUser/requireTutor/requireAdmin) AND again in Postgres
 * RLS — middleware only establishes identity and handles CORS preflight.
 */
export default clerkMiddleware(async (_auth, req) => {
  if (req.method === 'OPTIONS' && req.nextUrl.pathname.startsWith('/api/')) return NextResponse.next();
  return NextResponse.next();
});

export const config = {
  matcher: ['/api/:path*', '/go/:path*', '/verify/:path*', '/u/:path*'],
};
