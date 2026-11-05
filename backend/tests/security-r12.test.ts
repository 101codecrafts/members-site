// Round 12 security: SSRF address filter, Zoom signing-oracle fix, CORS dev origin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// these libs import via the '@/…' tsconfig alias; map it to the backend root for node --test (no bundler here)
const ROOT = new URL('../', import.meta.url);
// lib/errors.ts uses TS parameter properties (not strippable) and lib/env.ts validates the whole env: tiny stand-ins
const STUBS: Record<string, string> = {
  '@/lib/errors': 'export class AppError extends Error { constructor(code, message, details) { super(message); this.code = code; this.details = details; } }',
  '@/lib/env': 'export const env = () => ({});',
};
registerHooks({
  resolve(spec, ctx, next) {
    if (STUBS[spec]) return { url: 'data:text/javascript,' + encodeURIComponent(STUBS[spec]), shortCircuit: true };
    if (spec.startsWith('@/')) return next(new URL(spec.slice(2) + (/\.[a-z]+$/.test(spec) ? '' : '.ts'), ROOT).href, ctx);
    return next(spec, ctx);
  },
});
const { isPrivateIp, expandV6, assertSafeUrl } = await import('../lib/ssrf.ts');
const { verifyZoomSignature, zoomPlainTokenOk } = await import('../lib/meetings.ts');
const { hmacSha256 } = await import('../lib/crypto.ts');
const { allowedOrigins } = await import('../lib/cors.ts');

test('SSRF: private/reserved v4 and v6 in every spelling are refused', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1',
    '::', '::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe', '0:0:0:0:0:ffff:7f00:0001', '::127.0.0.1', '64:ff9b::7f00:1',
    '2002:7f00:1::', '2002:c0a8:101::1', '2001:0:4136:e378:8000:63bf:3fff:fdd2', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'fec0::1', 'ff02::1',
    '2001:db8::1', '100::1', 'fe80::1%eth0', 'not-an-ip']) assert.equal(isPrivateIp(ip), true, ip);
  for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '2a00:1450:4001:81b::200e', '::ffff:8.8.8.8', '2002:808:808::1'])
    assert.equal(isPrivateIp(ip), false, ip);
});

test('SSRF: expandV6 normalises and rejects junk', () => {
  assert.equal(expandV6('::1'), '0000:0000:0000:0000:0000:0000:0000:0001');
  assert.equal(expandV6('::ffff:127.0.0.1'), '0000:0000:0000:0000:0000:ffff:7f00:0001');
  for (const bad of ['1::2::3', '12345::', 'g::1', '1:2:3:4:5:6:7:8:9', '::ffff:1.2.3.400']) assert.equal(expandV6(bad), null, bad);
});

test('SSRF: URL-level guard still refuses http, ports, credentials and IP literals', () => {
  for (const u of ['http://example.com', 'https://example.com:8443/', 'https://u:p@example.com', 'https://127.0.0.1/', 'https://[::1]/', 'https://foo.internal/'])
    assert.throws(() => assertSafeUrl(u), u);
  assert.equal(assertSafeUrl('https://example.com/a').hostname, 'example.com');
});

test('Zoom: url_validation plain token cannot be a "v0:<ts>:<body>" string (signing oracle closed)', () => {
  assert.equal(zoomPlainTokenOk('qgg8vlvZRS6UYooatFL8Aw'), true);
  for (const bad of ['v0:1700000000:{"event":"meeting.ended"}', '', 'short', 'a'.repeat(200), 'abc def ghi', null, 42]) assert.equal(zoomPlainTokenOk(bad), false, String(bad));
  const secret = 's3cret', ts = String(Math.floor(Date.now() / 1000)), body = '{"event":"meeting.ended"}';
  const sig = `v0=${hmacSha256(secret, `v0:${ts}:${body}`)}`;
  assert.equal(verifyZoomSignature(body, ts, sig, secret), true);
  assert.equal(verifyZoomSignature(body + ' ', ts, sig, secret), false);
  assert.equal(verifyZoomSignature(body, ts, sig, undefined), false);
  assert.equal(verifyZoomSignature(body, String(Number(ts) - 600), `v0=${hmacSha256(secret, `v0:${Number(ts) - 600}:${body}`)}`, secret), false, 'stale timestamp');
});

test('CORS: Expo dev origin is never allowed on the production deployment', () => {
  const prev = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = 'production';
  assert.ok(!allowedOrigins().includes('http://localhost:8081'));
  assert.ok(allowedOrigins().includes('capacitor://localhost'));
  process.env.VERCEL_ENV = 'preview';
  assert.ok(allowedOrigins().includes('http://localhost:8081'));
  if (prev === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = prev;
});
