import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextRequest, NextResponse, type NextFetchEvent } from 'next/server';

/**
 * Clerk attaches/validates the session for every request (cookie for web,
 * `Authorization: Bearer` for native apps). Authorization itself happens in
 * each handler (requireUser/requireTutor/requireAdmin) AND again in Postgres
 * RLS — middleware only establishes identity and handles CORS preflight.
 */
const clerk = clerkMiddleware(async (_auth, req) => {
  if (req.method === 'OPTIONS' && req.nextUrl.pathname.startsWith('/api/')) return NextResponse.next();
  return NextResponse.next();
});

/**
 * A malformed `Authorization: Bearer` value makes Clerk throw while decoding
 * it (MIDDLEWARE_INVOCATION_FAILED, a 500 on every route). Retry once without
 * that header so the request continues as anonymous: public routes answer
 * normally and protected routes answer 401 from requireUser.
 */
export default async function middleware(req: NextRequest, event: NextFetchEvent) {
  try {
    return await clerk(req, event);
  } catch (err) {
    if (!req.headers.has('authorization')) throw err;
    console.warn(JSON.stringify({ level: 'warn', msg: 'middleware: unreadable Authorization header, continuing as anonymous', path: req.nextUrl.pathname }));
    const headers = new Headers(req.headers);
    headers.delete('authorization');
    return clerk(new NextRequest(req, { headers }), event);
  }
}

export const config = {
  matcher: ['/api/:path*', '/go/:path*', '/verify/:path*', '/u/:path*'],
};
