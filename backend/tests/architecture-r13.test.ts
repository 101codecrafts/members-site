// r13 architecture: request ids, CDN cache policy, ETag, default write rate limit, job runner, storage purge, readiness.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  sanitizeRequestId, ipHash, hasSessionCredentials, cachePolicy, weakEtag, etagMatches, pickRateLimit, DEFAULT_WRITE_LIMIT, mergeVary, VIEWER_HEADER,
} from '../lib/request-context.ts';
import { runJobs, PermanentJobError, purgeUserStorage, parsePurgePayload, listAll, type QueueStore, type JobRow, type StorageLike } from '../lib/job-runner.ts';
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

// ---------------------------------------------------------------- job runner ----
function fakeStore(jobs: JobRow[]) {
  const log: string[] = [];
  let queue = [...jobs];
  const store: QueueStore = {
    claim: async (_w, limit) => { const b = queue.slice(0, limit); queue = queue.slice(limit); return b; },
    complete: async (id) => { log.push(`done:${id}`); },
    fail: async (id, _e, retry) => { log.push(`fail:${id}:${retry}`); return retry ? 'failed' : 'dead'; },
  };
  return { store, log };
}
const J = (id: string, kind: string, payload: unknown = {}): JobRow => ({ id, kind, payload, attempts: 1, max_attempts: 8 });

test('runJobs: one failure does not stop the batch; unknown kinds and permanent errors are not retried', async () => {
  const { store, log } = fakeStore([J('1', 'a.ok'), J('2', 'a.boom'), J('3', 'a.bad'), J('4', 'x.unknown'), J('5', 'a.ok')]);
  const s = await runJobs(store, {
    'a.ok': async () => ({ ok: true }),
    'a.boom': async () => { throw new Error('timeout'); },
    'a.bad': async () => { throw new PermanentJobError('bad payload'); },
  }, { worker: 't', batchSize: 2 });
  assert.deepEqual(log, ['done:1', 'fail:2:true', 'fail:3:false', 'fail:4:false', 'done:5']);
  assert.equal(s.claimed, 5); assert.equal(s.done, 2); assert.equal(s.retrying, 1); assert.equal(s.dead, 2); assert.equal(s.stopped, 'empty');
});

test('runJobs: stops on the time budget before claiming more', async () => {
  let t = 0;
  const { store } = fakeStore(Array.from({ length: 50 }, (_, i) => J(String(i), 'a.ok')));
  const s = await runJobs(store, { 'a.ok': async () => { t += 1000; return null; } }, { worker: 't', batchSize: 5, budgetMs: 9000, now: () => t });
  assert.equal(s.stopped, 'budget'); assert.ok(s.done >= 9 && s.done <= 10, String(s.done));
});

// ---------------------------------------------------------------- storage purge ----
function fakeStorage(files: Record<string, string[]>) {
  const removed: string[] = [];
  const st: StorageLike = {
    from: (bucket) => ({
      list: async (prefix, { limit, offset }) => {
        const all = (files[bucket] ?? []).filter((f) => f.startsWith(prefix + '/'));
        const names = [...new Set(all.map((f) => f.slice(prefix.length + 1).split('/')[0]!))].sort();
        const rows = names.map((n) => ({ name: n, id: all.includes(`${prefix}/${n}`) ? `id-${n}` : null }));
        return { data: rows.slice(offset, offset + limit), error: null };
      },
      remove: async (paths) => { removed.push(...paths.map((p) => `${bucket}:${p}`)); files[bucket] = (files[bucket] ?? []).filter((f) => !paths.includes(f)); return { data: [], error: null }; },
    }),
  };
  return { st, removed };
}

test('listAll walks nested folders and pages past 100 entries', async () => {
  const many = Array.from({ length: 230 }, (_, i) => `u_1/p/${String(i).padStart(3, '0')}.png`);
  const { st } = fakeStorage({ 'project-files': [...many, 'u_1/top.zip', 'u_2/other.zip'] });
  const got = await listAll(st, 'project-files', 'u_1/');
  assert.equal(got.length, 231); assert.ok(got.includes('u_1/top.zip')); assert.ok(!got.some((p) => p.startsWith('u_2/')));
});

test('purge: deletes only the member\'s own folders + captured paths; KYC with no bucket goes to manual review; a re-run finds the folders empty', async () => {
  const files = { avatars: ['user_bob/a.png', 'user_alice/a.png'], 'tutor-docs': ['user_bob/id-front.jpg'], 'course-media': ['c1/user_bob/v.mp4'] };
  const { st, removed } = fakeStorage(files);
  const payload = { user_id: 'user_bob', prefixes: [{ bucket: 'avatars', prefix: 'user_bob/' }, { bucket: 'tutor-docs', prefix: 'user_bob/' }],
    paths: [{ bucket: 'tutor-docs', path: 'user_bob/id-front.jpg' }, { bucket: null, path: 'store-9/kyc/id.pdf', note: 'store kyc document' }] };
  const r = await purgeUserStorage(payload, st);
  assert.deepEqual(removed.sort(), ['avatars:user_bob/a.png', 'tutor-docs:user_bob/id-front.jpg']);
  assert.equal(r.removed, 2); assert.deepEqual(r.needs_review, [{ path: 'store-9/kyc/id.pdf', note: 'store kyc document' }]);
  assert.deepEqual(files.avatars, ['user_alice/a.png']); assert.deepEqual(files['course-media'], ['c1/user_bob/v.mp4'], 'paid course content untouched');
  const again = await purgeUserStorage(payload, st);
  assert.equal(again.removed, 1, 'the explicit path is re-sent (remove of a missing object is harmless); folders are empty');
});

test('purge payload guard: no other member\'s folder, no paid-content bucket, no traversal', () => {
  const base = { user_id: 'user_bob', prefixes: [], paths: [] };
  assert.throws(() => parsePurgePayload({ ...base, prefixes: [{ bucket: 'avatars', prefix: 'user_alice/' }] }), PermanentJobError);
  assert.throws(() => parsePurgePayload({ ...base, prefixes: [{ bucket: 'avatars', prefix: '' }] }), PermanentJobError);
  assert.throws(() => parsePurgePayload({ ...base, prefixes: [{ bucket: 'course-media', prefix: 'user_bob/' }] }), PermanentJobError);
  assert.throws(() => parsePurgePayload({ ...base, paths: [{ bucket: 'listing-files', path: 'user_bob/x' }] }), PermanentJobError);
  assert.throws(() => parsePurgePayload({ ...base, paths: [{ bucket: 'avatars', path: 'user_bob/../user_alice/a.png' }] }), PermanentJobError);
  assert.throws(() => parsePurgePayload({ ...base, user_id: '../x' }), PermanentJobError);
  assert.deepEqual(parsePurgePayload(base), base);
});

// ---------------------------------------------------------------- readiness ----
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
