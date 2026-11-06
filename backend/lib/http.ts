import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import type { ZodType, ZodTypeDef } from 'zod';
import { toAppError, AppError } from '@/lib/errors';
import { createLogger, type Logger } from '@/lib/logger';
import { corsHeaders } from '@/lib/cors';
import { rateLimit, type LimitRule } from '@/lib/ratelimit';
import { captureException } from '@/lib/monitoring';
import { cachePolicy, etagMatches, hasSessionCredentials, ipHash, mergeVary, pickRateLimit, sanitizeRequestId, weakEtag } from '@/lib/request-context';

export interface Ctx<P = Record<string, string>> {
  req: NextRequest;
  params: P;
  log: Logger;
  requestId: string;
  ip: string;
}

type Handler<P> = (ctx: Ctx<P>) => Promise<Response | unknown>;

/**
 * rateLimit: a specific rule, or `false` to opt out. Omitted → mutating methods get the default per-IP write guard
 * (lib/request-context DEFAULT_WRITE_LIMIT); webhook and cron paths are exempt.
 * cacheSeconds: a public GET whose visitor answer may sit in the Vercel CDN for N s (signed-in callers get private).
 */
interface Options { rateLimit?: LimitRule | false; cacheSeconds?: number }

export function clientIp(req: NextRequest): string {
  return req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0';
}

/**
 * Wraps every route handler: request id, structured log, CORS, optional rate
 * limit, consistent JSON envelope ({ data } | { error }), error mapping and
 * monitoring. Handlers return plain data or a Response.
 */
export function route<P = Record<string, string>>(handler: Handler<P>, opts: Options = {}) {
  return async (req: NextRequest, context: { params: Promise<P> }): Promise<Response> => {
    const requestId = sanitizeRequestId(req.headers.get('x-request-id')) ?? randomUUID();
    const ip = clientIp(req);
    const path = req.nextUrl.pathname;
    const log = createLogger({
      request_id: requestId, method: req.method, path,
      ip_hash: ipHash(ip, process.env.HASH_SALT ?? ''), vercel_id: req.headers.get('x-vercel-id') ?? undefined,
      release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? undefined,
    });
    const started = Date.now();
    const cors = corsHeaders(req.headers.get('origin'));
    try {
      const limit = pickRateLimit(req.method, path, opts.rateLimit);
      if (limit) await rateLimit(limit, ip);
      const params = (context?.params ? await context.params : {}) as P;
      const result = await handler({ req, params, log, requestId, ip });
      const policy = cachePolicy({ method: req.method, status: result instanceof Response ? result.status : 200,
        cacheSeconds: opts.cacheSeconds, credentialed: hasSessionCredentials(req.headers) });
      let res: Response;
      if (result instanceof Response) {
        res = result;
      } else {
        const json = JSON.stringify({ data: result ?? null });
        const etag = policy.etag ? weakEtag(json) : null;
        if (etag && etagMatches(req.headers.get('if-none-match'), etag)) {
          res = new NextResponse(null, { status: 304, headers: { etag } });
        } else {
          res = new NextResponse(json, { status: 200, headers: { 'content-type': 'application/json', ...(etag ? { etag } : {}) } });
        }
      }
      res.headers.set('x-request-id', requestId);
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      if (!res.headers.has('cache-control')) res.headers.set('cache-control', policy.cacheControl);
      if (policy.vary.length) res.headers.set('vary', mergeVary(res.headers.get('vary'), policy.vary));
      const ms = Date.now() - started;
      res.headers.set('server-timing', `app;dur=${ms}`);
      log.info('request', { status: res.status, ms });
      return res;
    } catch (e) {
      const err = toAppError(e);
      const level = err.status >= 500 ? 'error' : 'warn';
      const ms = Date.now() - started;
      log[level]('request_failed', { status: err.status, code: err.code, ms, cause: e instanceof Error && !(e instanceof AppError) ? e.message : undefined });
      if (err.status >= 500) await captureException(e, { request_id: requestId, path });
      return NextResponse.json(
        { error: { code: err.code, message: err.message, details: err.status < 500 ? err.details : undefined, request_id: requestId } },
        { status: err.status, headers: { ...cors, 'x-request-id': requestId, 'cache-control': 'no-store', 'server-timing': `app;dur=${ms}`,
          ...(err.code === 'rate_limited' ? { 'retry-after': '60' } : {}) } },
      );
    }
  };
}

/** CORS preflight for every /api/v1 route. */
export function preflight(req: NextRequest): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) });
}

export async function body<T>(req: NextRequest, schema: ZodType<T, ZodTypeDef, unknown>): Promise<T> {
  const text = await req.text();
  if (text.length > 1_000_000) throw new AppError('bad_request', 'Body too large');
  let json: unknown = {};
  if (text) {
    try { json = JSON.parse(text); } catch { throw new AppError('bad_request', 'Invalid JSON'); }
  }
  return schema.parse(json);
}

export function query<T>(req: NextRequest, schema: ZodType<T, ZodTypeDef, unknown>): T {
  return schema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
}

type PgResult = { data: unknown; error: { code?: string; message: string } | null };
/** Unwraps a supabase-js list/single result (throws the Postgres error, mapped later to AppError). */
export function unwrap<R extends PgResult>(r: R): NonNullable<R['data']> {
  if (r.error) throw r.error;
  return r.data as NonNullable<R['data']>;
}
/** Same for .maybeSingle(): null when no row is visible under RLS. */
export function unwrapMaybe<R extends PgResult>(r: R): R['data'] {
  if (r.error) throw r.error;
  return r.data;
}
