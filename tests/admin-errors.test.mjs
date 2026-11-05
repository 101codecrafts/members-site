// js/admin-console.js error states (BUS F2): every failure gets one precise message. node --test tests/admin-errors.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../js/admin-console.js', import.meta.url), 'utf8');
function load() {
  const document = { readyState: 'loading', addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], documentElement: { classList: { add() {}, remove() {} } } };
  const window = {};
  const ctx = vm.createContext({ window, document, location: new URL('https://x.test/admin.html'), URLSearchParams, Intl, sessionStorage: { getItem: () => null }, addEventListener() {}, setTimeout, clearTimeout, console });
  vm.runInContext(src, ctx);
  return window.CCAdminErrors.describe;
}
const E = (o) => Object.assign(new Error(o.serverMessage || 'x'), o);

test('network, 401, MFA, re-verify, 403 are told apart', () => {
  const d = load();
  assert.equal(d(E({ status: 0 })).kind, 'network');
  assert.match(d(E({ status: 0 }), true).text, /Nothing was saved/);
  assert.equal(d(E({ status: 401, code: 'unauthenticated' })).kind, 'signin');
  assert.equal(d(E({ status: 403, code: 'mfa_required' })).kind, 'mfa');
  assert.equal(d(E({ status: 403, code: 'reverification_required' })).kind, 'reverify');
  const f = d(E({ status: 403, code: 'forbidden', serverMessage: 'Missing admin scope: plans' }), true);
  assert.equal(f.kind, 'denied'); assert.match(f.text, /Missing admin scope: plans\. Nothing was saved/);
});

test('500s: database-not-updated vs generic server error vs upstream; never "could not reach the server"', () => {
  const d = load();
  const s = d(E({ status: 500, code: 'schema_outdated', requestId: 'abcdef1234' }), true);
  assert.equal(s.kind, 'schema'); assert.match(s.text, /^Database not updated/); assert.match(s.text, /ref abcdef12/);
  const g = d(E({ status: 500, code: 'internal' }), true);
  assert.equal(g.kind, 'server'); assert.match(g.text, /database was not updated/);
  assert.equal(d(E({ status: 503 })).kind, 'upstream');
  for (const st of [400, 401, 403, 404, 409, 422, 429, 500, 502]) assert.doesNotMatch(d(E({ status: st })).text, /could not reach/i, String(st));
});

test('HTML instead of JSON (protection page / missing API) = API not available; 429 = slow down; 422 shows server text', () => {
  const d = load();
  assert.equal(d(E({ status: 200, notJson: true })).kind, 'nobackend');
  assert.equal(d(E({ status: 429 })).kind, 'ratelimited');
  assert.equal(d(E({ status: 422, serverMessage: 'Give a reason' })).text, 'Give a reason.');
});
