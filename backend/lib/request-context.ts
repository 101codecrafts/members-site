/**
 * r13 architecture: pure helpers the route() wrapper uses for request ids, log context, CDN cache policy,
 * conditional GETs (ETag/304) and the default write rate limit. No server-only import and no I/O, so the
 * node unit tests can load this file directly.
 */
import { createHash } from 'node:crypto';

export interface LimitRuleLike { name: string; max: number; windowSeconds: number; key?: string }

/** A client-sent x-request-id is reused only when it is short and safe to log; otherwise a new one is minted. */
const SAFE_ID = /^[A-Za-z0-9._:-]{8,128}$/;
export function sanitizeRequestId(raw: string | null | undefined): string | null {
  return raw && SAFE_ID.test(raw) ? raw : null;
}

/**
 * Logs never carry the raw IP (personal data under DPPA). A salted, day-scoped hash still lets one request
 * trail be followed within a day. The salt is an existing server secret, so no new env var is needed.
 */
export function ipHash(ip: string, salt: string, day = new Date().toISOString().slice(0, 10)): string {
  return createHash('sha256').update(`${salt}|${day}|${ip}`).digest('hex').slice(0, 16);
}

/**
 * True when the request carries a Clerk session: a Bearer token (native apps) or the `__session` cookie (web,
 * including the `__session_<suffix>` variant). Such a request may be answered with RLS-scoped (personal) rows,
 * so its response must never enter a shared cache.
 */
export function hasSessionCredentials(headers: { get(name: string): string | null }): boolean {
  if ((headers.get('authorization') ?? '').trim()) return true;
  const cookie = headers.get('cookie') ?? '';
  return /(?:^|;\s*)__session(?:_[A-Za-z0-9-]+)?=[^;\s]/.test(cookie);
}

/** Request header the front end sends when it holds a session, so the CDN keeps member and visitor entries apart. */
export const VIEWER_HEADER = 'x-cc-viewer';

export interface CachePolicy { cacheControl: string; vary: string[]; etag: boolean }

/**
 * Cache policy for one response.
 *  - mutating methods, errors and routes without cacheSeconds: `no-store`
 *  - cacheable GET from a visitor: `public, s-maxage=N, stale-while-revalidate=4N` (Vercel CDN, shared)
 *  - cacheable GET from a signed-in caller: `private, no-store` (the RLS view may include their own rows)
 * Cacheable GETs vary on the viewer header so a member's request never reads the visitor entry, and get an ETag.
 * Vercel's CDN already refuses requests with an Authorization header and responses that are private/no-store
 * (https://vercel.com/docs/caching/cdn-cache#cacheable-response-criteria); cookies are NOT in its cache key, so the
 * cookie check here is what keeps a web member's rows out of the shared cache.
 */
export function cachePolicy(o: { method: string; status: number; cacheSeconds?: number; credentialed: boolean }): CachePolicy {
  const cacheable = (o.method === 'GET' || o.method === 'HEAD') && !!o.cacheSeconds && o.cacheSeconds > 0 && o.status === 200;
  if (!cacheable) return { cacheControl: 'no-store', vary: [], etag: false };
  if (o.credentialed) return { cacheControl: 'private, no-store', vary: [VIEWER_HEADER], etag: true };
  const n = Math.floor(o.cacheSeconds!);
  return { cacheControl: `public, s-maxage=${n}, stale-while-revalidate=${n * 4}`, vary: [VIEWER_HEADER], etag: true };
}

/** Weak ETag over the exact JSON body sent. */
export function weakEtag(body: string): string {
  return `W/"${createHash('sha1').update(body).digest('base64url').slice(0, 22)}"`;
}

/** If-None-Match comparison (weak, list-aware, `*`). */
export function etagMatches(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false;
  const bare = (t: string) => t.trim().replace(/^W\//, '');
  return ifNoneMatch.split(',').some((t) => t.trim() === '*' || bare(t) === bare(etag));
}

/** Default flood guard for every write that has no specific rule. Generous on purpose: campus networks put
 *  hundreds of students behind one IP. Specific rules (auth, checkout, errors, …) stay stricter. */
export const DEFAULT_WRITE_LIMIT: LimitRuleLike = { name: 'write_ip', max: 120, windowSeconds: 60 };

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/** Signed by their sender (svix / Flutterwave hash / Zoom HMAC) or by CRON_SECRET; retries must never be throttled. */
const EXEMPT_PREFIXES = ['/api/v1/webhooks/', '/api/v1/cron/'];

/**
 * Which rate-limit rule applies: an explicit rule wins; `false` opts out; otherwise mutating methods get the
 * default write guard, except webhook and cron paths. GETs without a rule are not limited here.
 */
export function pickRateLimit(method: string, path: string, opt: LimitRuleLike | false | undefined): LimitRuleLike | null {
  if (opt === false) return null;
  if (opt) return opt;
  if (!MUTATING.has(method.toUpperCase())) return null;
  if (EXEMPT_PREFIXES.some((p) => path.startsWith(p))) return null;
  return DEFAULT_WRITE_LIMIT;
}

/** Combine Vary values without duplicates (case-insensitive). */
export function mergeVary(existing: string | null, add: string[]): string {
  const out: string[] = [];
  for (const v of [...(existing ?? '').split(','), ...add].map((s) => s.trim()).filter(Boolean)) {
    if (!out.some((o) => o.toLowerCase() === v.toLowerCase())) out.push(v);
  }
  return out.join(', ');
}
