import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import type { ZodType, ZodTypeDef } from 'zod';
import { toAppError, AppError } from '@/lib/errors';
import { createLogger, type Logger } from '@/lib/logger';
import { corsHeaders } from '@/lib/cors';
import { rateLimit, type LimitRule } from '@/lib/ratelimit';
import { captureException } from '@/lib/monitoring';

export interface Ctx<P = Record<string, string>> {
  req: NextRequest;
  params: P;
  log: Logger;
  requestId: string;
  ip: string;
}

type Handler<P> = (ctx: Ctx<P>) => Promise<Response | unknown>;

interface Options { rateLimit?: LimitRule; cacheSeconds?: number }

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
    const requestId = req.headers.get('x-request-id') ?? randomUUID();
    const ip = clientIp(req);
    const log = createLogger({ request_id: requestId, method: req.method, path: req.nextUrl.pathname });
    const started = Date.now();
    const cors = corsHeaders(req.headers.get('origin'));
    try {
      if (opts.rateLimit) await rateLimit(opts.rateLimit, ip);
      const params = (context?.params ? await context.params : {}) as P;
      const result = await handler({ req, params, log, requestId, ip });
      const res = result instanceof Response ? result : NextResponse.json({ data: result ?? null });
      res.headers.set('x-request-id', requestId);
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      if (opts.cacheSeconds && req.method === 'GET' && !res.headers.has('cache-control')) {
        res.headers.set('cache-control', `public, s-maxage=${opts.cacheSeconds}, stale-while-revalidate=${opts.cacheSeconds * 4}`);
      } else if (!res.headers.has('cache-control')) {
        res.headers.set('cache-control', 'no-store');
      }
      log.info('request', { status: res.status, ms: Date.now() - started });
      return res;
    } catch (e) {
      const err = toAppError(e);
      const level = err.status >= 500 ? 'error' : 'warn';
      log[level]('request_failed', { status: err.status, code: err.code, ms: Date.now() - started, cause: e instanceof Error && !(e instanceof AppError) ? e.message : undefined });
      if (err.status >= 500) await captureException(e, { request_id: requestId, path: req.nextUrl.pathname });
      return NextResponse.json(
        { error: { code: err.code, message: err.message, details: err.status < 500 ? err.details : undefined, request_id: requestId } },
        { status: err.status, headers: { ...cors, 'x-request-id': requestId, 'cache-control': 'no-store' } },
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

/** Unwraps a supabase-js result, mapping Postgres errors to AppError. */
export function unwrap<T>(r: { data: T | null; error: { code?: string; message: string } | null }): T {
  if (r.error) throw r.error;
  return r.data as T;
}
