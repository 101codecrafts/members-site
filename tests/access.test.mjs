// CCAccess (js/access.js) unit tests: node --test tests/access.test.mjs
// Loads the real file in a VM with a minimal DOM stub. Optional parity check against the backend: set
// BACKEND_ACCESS=/path/to/backend/lib/access.ts (run with --experimental-strip-types) to compare every decision.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../js/access.js', import.meta.url), 'utf8');
const policy = JSON.parse(readFileSync(new URL('../src/data/access-policy.json', import.meta.url), 'utf8'));

function load(href = 'https://x.test/index.html') {
  const cls = new Set(), listeners = {};
  const document = {
    readyState: 'complete', body: { dataset: { page: (new URL(href).pathname.match(/([a-z0-9-]+)\.html$/) || [, 'index'])[1] } },
    documentElement: { classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)), contains: (c) => cls.has(c) }, dataset: {} },
    querySelector: () => null, querySelectorAll: () => [], addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
    dispatchEvent: () => true, createElement: () => ({}),
  };
  const replaced = [];
  const location = Object.assign(new URL(href), { replace: (u) => replaced.push(u) });
  const window = {};
  const ctx = vm.createContext({ window, document, location, URL, CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } }, Promise, console });
  vm.runInContext(src, ctx);
  return { A: window.CCAccess, cls, replaced, listeners };
}

test('the embedded policy equals src/data/access-policy.json (run tools/build.py after editing the JSON)', () => {
  const { A } = load();
  assert.deepEqual(JSON.parse(JSON.stringify(A.policy)), policy);
});

test('starts as visitor; can() follows the policy; unknown actions fail closed', () => {
  const { A } = load();
  assert.equal(A.role, 'visitor');
  assert.equal(A.can('news.read'), true);
  assert.equal(A.why('course.browse'), 'signin');
  assert.equal(A.why('nope.nope'), 'role');
  assert.equal(A.why('$comment'), 'role');
});

test('role/plan only from set() (the server answer); bogus values fall back to least privilege', () => {
  const { A, cls } = load();
  A.set({ role: 'root_admin_pls', user: { id: 'u1' } });
  assert.equal(A.role, 'guest', 'unknown role from anywhere -> guest when signed in');
  A.set({ role: 'learner', plan: 'platinum', user: { id: 'u1' } });
  assert.equal(A.plan, 'free');
  assert.ok(cls.has('role-learner') && !cls.has('role-guest'));
  A.set({ role: 'visitor' });
  assert.equal(A.role, 'visitor');
});

test('limits: defaults from policy, server overrides win', () => {
  const { A } = load();
  A.set({ role: 'tutor', plan: 'free', user: { id: 't' } });
  assert.equal(A.limit('students.max'), 2);
  A.set({ role: 'tutor', plan: 'free', user: { id: 't' }, limits: { 'students.max': 4 } });
  assert.equal(A.limit('students.max'), 4);
  A.set({ role: 'learner', plan: 'pro', user: { id: 'l' } });
  assert.equal(A.limit('courses.active'), null);
});

test('authUrl / safeNext: same-origin paths only, never back to /auth', () => {
  const { A } = load();
  assert.equal(A.authUrl('/courses.html?x=1'), '/auth.html?next=%2Fcourses.html%3Fx%3D1');
  for (const bad of ['https://evil.io/', '//evil.io/x', '/\\evil.io', 'javascript:alert(1)', '/auth.html?next=/x', '/auth'])
    assert.equal(A.safeNext(bad), '', bad);
});

test('page guard: visitor on an app page goes to /auth?next=; wrong role goes home; never a loop', () => {
  let r = load('https://x.test/dashboard.html'); r.A.set({ role: 'visitor' });
  assert.deepEqual(r.replaced, ['/auth.html?next=%2Fdashboard.html']);
  r = load('https://x.test/admin.html'); r.A.set({ role: 'learner', user: { id: 'l' } });
  assert.deepEqual(r.replaced, ['/dashboard.html']);
  r = load('https://x.test/dashboard.html'); r.A.set({ role: 'learner', user: { id: 'l' } });
  assert.deepEqual(r.replaced, [], 'allowed page stays');
  r = load('https://x.test/seller.html'); r.A.set({ role: 'guest', user: { id: 'g' } });
  assert.deepEqual(r.replaced, ['/auth.html?next=%2Fseller.html&upgrade=1'], 'guest -> upgrade path');
  r = load('https://x.test/news.html'); r.A.set({ role: 'visitor' });
  assert.deepEqual(r.replaced, [], 'public page stays public');
});

test('every page in the policy maps to a real action and every role has a home page', () => {
  for (const [p, a] of Object.entries(policy.pages)) { if (p === '$comment') continue; assert.ok(policy.actions[a], `${p} -> ${a}`); }
  for (const r of policy.roles) assert.ok(policy.home[r], r);
});

const backend = process.env.BACKEND_ACCESS;
test('parity with backend lib/access.ts decide() for every role x action x minor/consent x plan', { skip: !backend }, async () => {
  const B = await import(backend);
  const { A } = load();
  let n = 0;
  for (const role of policy.roles) for (const plan of policy.plans) for (const minor of [false, true]) for (const consent of [false, true])
    for (const action of Object.keys(policy.actions)) {
      const ctx = { role, plan, minor, consent };
      assert.equal(A.why(action, ctx), B.decide(ctx, action), `${action} ${JSON.stringify(ctx)}`); n++;
    }
  assert.ok(n > 1000);
});
