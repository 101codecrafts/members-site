/**
 * One error type for the whole API. Route handlers never build error JSON by
 * hand: they throw AppError (or let Postgres/Zod errors bubble) and the http
 * wrapper maps it to a stable envelope: { error: { code, message, request_id } }.
 */
import { ZodError } from 'zod';

export type ErrorCode =
  | 'bad_request' | 'unauthenticated' | 'forbidden' | 'not_found' | 'conflict'
  | 'rate_limited' | 'mfa_required' | 'payment_required' | 'unprocessable' | 'upstream_error' | 'internal';

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400, unauthenticated: 401, payment_required: 402, forbidden: 403, mfa_required: 403, not_found: 404,
  conflict: 409, unprocessable: 422, rate_limited: 429, upstream_error: 502, internal: 500,
};

export class AppError extends Error {
  constructor(public readonly code: ErrorCode, message: string, public readonly details?: unknown) {
    super(message);
    this.name = 'AppError';
  }
  get status(): number { return STATUS[this.code]; }
}

export const badRequest = (m: string, d?: unknown) => new AppError('bad_request', m, d);
export const unauthenticated = () => new AppError('unauthenticated', 'Sign in required');
export const forbidden = (m = 'You do not have access to this resource') => new AppError('forbidden', m);
export const notFound = (m = 'Not found') => new AppError('not_found', m);

interface PgLikeError { code?: string; message?: string; details?: string | null; hint?: string | null }

/** Maps PostgREST / Postgres error codes (raised by RLS, guards and RPCs) to AppError. */
export function fromPostgres(err: PgLikeError): AppError {
  const msg = err.message ?? 'Database error';
  switch (err.code) {
    case '42501': return new AppError('forbidden', msg);            // RLS / guard / role check
    case 'P0002': case 'PGRST116': return new AppError('not_found', msg);
    case '23505': return new AppError('conflict', msg);
    case '23503': case '23514': case '22023': case '22P02': case '23502': return new AppError('bad_request', msg);
    case 'P0001': return new AppError('unprocessable', msg);         // business rule (full, closed, window passed)
    default: return new AppError('internal', 'Unexpected database error');
  }
}

export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  if (e instanceof ZodError) return new AppError('bad_request', 'Invalid input', e.flatten());
  if (e && typeof e === 'object' && 'code' in e && typeof (e as PgLikeError).code === 'string') return fromPostgres(e as PgLikeError);
  return new AppError('internal', 'Something went wrong');
}
