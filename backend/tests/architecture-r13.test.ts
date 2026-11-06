// r13 architecture (release cut): request ids, CDN cache policy, ETag, default write rate limit, readiness.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  sanitizeRequestId, ipHash, hasSessionCredentials, cachePolicy, weakEtag, etagMatches, pickRateLimit, DEFAULT_WRITE_LIMIT, mergeVary, VIEWER_HEADER,
} from '../lib/request-context.ts';
import { envCheck, queueCheck, overall, REQUIRED_ENV } from '../lib/health.ts';

const H = (h: Record<string, string>) => ({ get: (k: string) => h[k.toLowerCase()] ?? null });

test('request id: safe client ids are kept, anything else is replaced', () => {
  assert.equal(sanitizeRequestId('req_2f1c9a7e-01'), 'req_2f1c9a7e-01');
  for (const bad of [null, '', 'short', 'x'.repeat(129), 'a b c d e f g h', 'abc\ndef12345', '<script>alert(1)</script>']) assert.equal(sanitizeRequestId(bad), null, String(bad));
});

test('ip hash: stable within a day, different across days and salts, never the raw ip', () => {
  const a = ipHash('41.210.1.2', 's1', '2026-11-06');
  assert.equal(a, ipHash('41.210.1.2', 's1', '2026-11-06'));
  assert.notEqual(a, ipHash('41.210.1.2', 's1', '2026-11-07'));
  assert.notEqual(a, ipHash('41.210.1.2', 's2', '2026-11-06'));
  assert.match(a, /^[0-9a-f]{16}$/); assert.ok(!a.includes('41'));
});

test('session detection: bearer token or Clerk __session cookie (incl. suffixed); other cookies are not a session', () => {
  assert.equal(hasSessionCredentials(H({ authorization: 'Bearer abc' })), true);
  assert.equal(hasSessionCredentials(H({ cookie: '__session=eyJhbGci' })), true);
  assert.equal(hasSessionCredentials(H({ cookie: 'theme=dark; __session_Ab12-x=eyJ' })), true);
  assert.equal(hasSessionCredentials(H({ cookie: '__session=' })), false, 'empty value = signed out');
  assert.equal(hasSessionCredentials(H({ cookie: '__client_uat=0; _vercel_jwt=abc; cc_consent=1' })), false);
  assert.equal(hasSessionCredentials(H({})), false);
});

test('cache policy: visitors share the CDN entry, signed-in callers never do (fixes 7 RLS-scoped routes that cached publicly)', () => {
  const pub = cachePolicy({ method: 'GET', status: 200, cacheSeconds: 60, credentialed: false });
  assert.equal(pub.cacheControl, 'public, s-maxage=60, stale-while-revalidate=240'); assert.deepEqual(pub.vary, [VIEWER_HEADER]); assert.equal(pub.etag, true);
  const mem = cachePolicy({ method: 'GET', status: 200, cacheSeconds: 60, credentialed: true });
  assert.equal(mem.cacheControl, 'private, no-store'); assert.ok(!/s-maxage|public/.test(mem.cacheControl));
  for (const o of [{ method: 'POST', status: 200, cacheSeconds: 60 }, { method: 'GET', status: 404, cacheSeconds: 60 }, { method: 'GET', status: 200 }])
    assert.equal(cachePolicy({ ...o, credentialed: false }).cacheControl, 'no-store', JSON.stringify(o));
});

test('routes that read with the caller\'s RLS client and set cacheSeconds now rely on the credential check (inventory)', () => {
  const root = new URL('../app/api/v1/', import.meta.url).pathname;
  const mixed: string[] = [];
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f === 'route.ts') {
    const s = readFileSync(p, 'utf8'); if (/cacheSeconds/.test(s) && /optionalSession|getSession/.test(s)) mixed.push(p.slice(root.length)); } } };
  walk(root);
  assert.ok(mixed.length >= 1, 'inventory found the mixed routes');
  // the wrapper is the only place cache headers are decided for them: none may set its own public cache-control
  for (const r of mixed) assert.ok(!/['"]cache-control['"]\s*[:,]\s*['"]public/i.test(readFileSync(join(root, r), 'utf8')), r);
});

test('ETag: weak, stable for the same body, If-None-Match lists and * match', () => {
  const e = weakEtag('{"data":[1,2]}');
  assert.match(e, /^W\/"[A-Za-z0-9_-]{22}"$/); assert.equal(e, weakEtag('{"data":[1,2]}')); assert.notEqual(e, weakEtag('{"data":[1,3]}'));
  assert.equal(etagMatches(e, e), true); assert.equal(etagMatches(`"x", ${e.replace('W/', '')}`, e), true); assert.equal(etagMatches('*', e), true);
  assert.equal(etagMatches(null, e), false); assert.equal(etagMatches('W/"other"', e), false);
});

test('rate limit: explicit rule wins, false opts out, writes get the default IP guard, webhooks and cron are exempt, GETs are not limited', () => {
  const r = { name: 'auth', max: 10, windowSeconds: 60 };
  assert.equal(pickRateLimit('POST', '/api/v1/auth/email-check', r), r);
  assert.equal(pickRateLimit('POST', '/api/v1/newsletter', undefined), DEFAULT_WRITE_LIMIT);
  for (const m of ['PUT', 'PATCH', 'DELETE', 'post']) assert.equal(pickRateLimit(m, '/api/v1/me', undefined), DEFAULT_WRITE_LIMIT, m);
  assert.equal(pickRateLimit('POST', '/api/v1/webhooks/flutterwave', undefined), null);
  assert.equal(pickRateLimit('POST', '/api/v1/webhooks/payments/pesapal', undefined), null);
  assert.equal(pickRateLimit('GET', '/api/v1/cron/jobs', undefined), null);
  assert.equal(pickRateLimit('GET', '/api/v1/courses', undefined), null);
  assert.equal(pickRateLimit('POST', '/api/v1/me', false), null);
  assert.ok(DEFAULT_WRITE_LIMIT.max >= 60, 'campus NAT: hundreds of students share one IP');
});

test('every route file that exports a write handler goes through route() (so the default guard applies)', () => {
  const root = new URL('../app/api/v1/', import.meta.url).pathname;
  const bad: string[] = [];
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f === 'route.ts') {
    const s = readFileSync(p, 'utf8');
    for (const m of s.matchAll(/export const (POST|PUT|PATCH|DELETE)\s*=\s*([^\n]*)/g)) if (!/^route\s*[<(]/.test(m[2]!.trim())) bad.push(`${p.slice(root.length)} ${m[1]}`);
  } } };
  walk(root);
  assert.deepEqual(bad, []);
});

test('Vary merge keeps Origin and adds the viewer header once', () => {
  assert.equal(mergeVary('Origin', [VIEWER_HEADER]), `Origin, ${VIEWER_HEADER}`);
  assert.equal(mergeVary(`origin, ${VIEWER_HEADER.toUpperCase()}`, [VIEWER_HEADER]), `origin, ${VIEWER_HEADER.toUpperCase()}`);
  assert.equal(mergeVary(null, [VIEWER_HEADER]), VIEWER_HEADER);
});

// job runner tests live on r13/architecture-api (job queue not in this release)

test('readiness: missing required setting = down (503); missing optional or queue trouble = degraded; values never echoed', () => {
  const full = Object.fromEntries(REQUIRED_ENV.map((k) => [k, 'secret-value-' + k]));
  const e = envCheck(full);
  assert.equal(e.required.status, 'ok'); assert.equal(e.optional.status, 'warn');
  assert.ok(!JSON.stringify(e).includes('secret-value'), 'no values');
  const { CRON_SECRET: _drop, ...noCron } = full;
  const e2 = envCheck(noCron);
  assert.deepEqual(e2.required, { status: 'fail', detail: { missing: ['CRON_SECRET'] } });
  assert.deepEqual(overall({ db: { status: 'ok' }, config: e2.required }), { status: 'down', http: 503 });
  assert.deepEqual(overall({ db: { status: 'ok' }, jobs: queueCheck(null) }), { status: 'degraded', http: 200 });
  assert.equal(queueCheck({ queued: 2, dead: 0, oldest_due_seconds: 3600 }).status, 'ok');
  assert.equal(queueCheck({ queued: 2, dead: 1, oldest_due_seconds: 0 }).status, 'warn');
  assert.equal(queueCheck({ queued: 2, dead: 0, oldest_due_seconds: 27 * 3600 }).status, 'warn');
  assert.deepEqual(overall({ db: { status: 'fail' } }), { status: 'down', http: 503 });
});
